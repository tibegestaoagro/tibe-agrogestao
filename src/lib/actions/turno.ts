import type { Prisma } from "@/generated/prisma/client";
import { prismaForTenant, scoped, type TenantPrismaClient } from "@/lib/prisma";
import type { Intent } from "@/lib/whatsapp-intents";
import { log, resumirErro } from "@/lib/log";
import { inicioDoDiaEmSaoPaulo } from "@/lib/dia-calendario";
import { detectConfirmation } from "@/lib/actions/confirmation";
import { logInbound, logOutbound } from "@/lib/actions/conversation-log";
import { executarIntencao } from "@/lib/actions/executar-intencao";
import { identificarContato, type ContatoIdentificado } from "@/lib/actions/whatsapp-contato";
import { carregarCursor } from "@/lib/agente/cursor";
import { classificarMensagem, classificarResposta } from "@/lib/agente/classificar";
import { FalhaDoModelo } from "@/lib/agente/modelo";
import { VERSAO_DO_PROMPT } from "@/lib/agente/prompts";

/**
 * O turno do agente WhatsApp (Task 11 da Fase 2): o n8n só transporta a
 * mensagem consolidada, e o Tibé identifica o contato, entende a mensagem
 * (cursor da conversa ou classificação em duas etapas), executa cada pedido
 * pelo mesmo núcleo do `execute-action` e devolve as mensagens a enviar.
 */

export type EntradaDoTurno = {
  telefone: string;
  texto: string;
  provider_message_id: string | null;
  /** Recibo lido por imagem no n8n: vai direto para o lançamento, sem classificar. */
  recibo?: { amount: number; category?: string | null; vendor?: string | null; description?: string | null } | null;
  agora?: Date;
};
export type MensagemDoTurno = { texto: string; pode_humanizar: boolean; report_url: string | null };
export type SaidaDoTurno = { mensagens: MensagemDoTurno[]; replay: boolean };

const FRASE_DE_FALHA = "Não consegui entender agora. Pode mandar de novo daqui a pouco?";
/** Mesma frase de `identificarContato` para número desconhecido: aqui cobre o contato sem usuário ativo, que vem sem sugestão. */
const NUMERO_NAO_CADASTRADO =
  "Este número não está cadastrado no Tibé. Peça para o administrador da sua empresa cadastrar seu telefone no sistema.";

/** Texto fixo do próprio turno: nunca vai ao humanizador. */
function fixa(texto: string): MensagemDoTurno {
  return { texto, pode_humanizar: false, report_url: null };
}

type Pedido = { intent: Intent; parameters: Record<string, unknown> };
type Identificado = Extract<ContatoIdentificado, { identificado: true }>;

async function entenderPedidos(e: EntradaDoTurno, contato: Identificado, agora: Date): Promise<Pedido[]> {
  if (e.recibo) return [{ intent: "registrar_lancamento_financeiro", parameters: { ...e.recibo } }];

  const cursor = await carregarCursor(contato.tenant_id, contato.user.id);
  if (cursor) {
    // Sim e não pertencem ao pedido aberto; o núcleo lê a confirmação do próprio texto.
    if (detectConfirmation(e.texto)) return [{ intent: cursor.intent, parameters: {} }];
    // Esperando só confirmação, não há campo para a resposta preencher: é assunto novo.
    if (cursor.aguardando !== "confirmacao") {
      const leitura = await classificarResposta({
        texto: e.texto,
        pergunta: cursor.pergunta,
        intent: cursor.intent,
        campo: cursor.aguardando,
      });
      if (leitura.tipo === "responde") return [{ intent: cursor.intent, parameters: { [cursor.aguardando]: e.texto } }];
    }
  }

  const hoje = inicioDoDiaEmSaoPaulo(agora).toISOString().slice(0, 10);
  return classificarMensagem({ texto: e.texto, hoje, perfis: contato.activeProfiles });
}

async function gravarTurno(db: TenantPrismaClient, chave: string | null, mensagens: MensagemDoTurno[]) {
  if (!chave) return;
  try {
    await db.agentRequest.create({
      data: scoped({
        provider_message_id: chave,
        intent: "turno",
        response: { mensagens } as unknown as Prisma.InputJsonValue,
      }),
    });
  } catch (err) {
    // Mesma regra do núcleo: duas execuções idênticas em corrida, a segunda só perdeu o registro.
    if ((err as { code?: unknown })?.code !== "P2002") throw err;
  }
}

export async function executarTurno(e: EntradaDoTurno): Promise<SaidaDoTurno> {
  const agora = e.agora ?? new Date();
  const wamid = e.provider_message_id || null;
  const chaveDoTurno = wamid ? `${wamid}#turno` : null;
  let db: TenantPrismaClient | null = null;
  let contatoId: string | null = null;

  try {
    // Antes do replay: o AgentRequest é escopado por tenant, e sem contato não há tenant.
    const contato = await identificarContato(e.telefone);
    if (!contato.identificado) {
      return { mensagens: [fixa(contato.resposta_sugerida ?? NUMERO_NAO_CADASTRADO)], replay: false };
    }
    db = prismaForTenant(contato.tenant_id);
    contatoId = contato.contato_id;

    if (contato.primeiro_contato) {
      const saudacao = fixa(contato.resposta_sugerida ?? "");
      await logOutbound(db, {
        whatsapp_contact_id: contatoId,
        content: saudacao.texto,
        action_taken: "turno:primeiro_contato",
        prompt_version: VERSAO_DO_PROMPT,
      });
      // Gravada para o reenvio repetir a saudação: na segunda vez o contato já existe e não é mais primeiro contato.
      await gravarTurno(db, chaveDoTurno, [saudacao]);
      return { mensagens: [saudacao], replay: false };
    }

    if (chaveDoTurno) {
      const anterior = await db.agentRequest.findFirst({ where: { provider_message_id: chaveDoTurno } });
      if (anterior) {
        return { mensagens: (anterior.response as { mensagens: MensagemDoTurno[] }).mensagens, replay: true };
      }
    }

    await logInbound(db, {
      whatsapp_contact_id: contatoId,
      content: e.texto || (e.recibo ? "[recibo]" : null),
      prompt_version: VERSAO_DO_PROMPT,
    });

    const pedidos = await entenderPedidos(e, contato, agora);

    const mensagens: MensagemDoTurno[] = [];
    for (const [indice, pedido] of pedidos.entries()) {
      const r = await executarIntencao({
        db,
        tenant_id: contato.tenant_id,
        user: { id: contato.user.id, role: contato.user.role },
        contato_id: contatoId,
        activeProfiles: contato.activeProfiles,
        intent: pedido.intent,
        parameters: pedido.parameters,
        message_text: e.texto || null,
        confirmed_do_corpo: null,
        // Índice na chave: dois pedidos da mesma intenção colidiriam em `wamid#intent`.
        provider_message_id: wamid ? `${wamid}#${indice}` : null,
        registrar_entrada: false,
      });
      mensagens.push({
        texto: r.reply_text,
        pode_humanizar: !/\d/.test(r.reply_text) && !r.requires_confirmation && !r.action_taken.includes("aguardando"),
        report_url: r.report_url,
      });
    }

    await gravarTurno(db, chaveDoTurno, mensagens);
    return { mensagens, replay: false };
  } catch (err) {
    // Sem gravar o turno: o reenvio precisa poder tentar de novo.
    const action_taken = err instanceof FalhaDoModelo ? `turno:falha_do_modelo:${err.motivo}` : "turno:falha_interna";
    if (!(err instanceof FalhaDoModelo)) {
      log.error("turno do agente: erro inesperado", { route: "/api/internal/whatsapp/turno", code: resumirErro(err).name });
      console.error(JSON.stringify({ level: "error", msg: "detalhe", err: resumirErro(err) }));
    }
    if (db && contatoId) {
      // O log não pode trocar a frase de falha por um 500.
      await logOutbound(db, { whatsapp_contact_id: contatoId, content: FRASE_DE_FALHA, action_taken, prompt_version: VERSAO_DO_PROMPT }).catch(
        () => undefined,
      );
    }
    return { mensagens: [fixa(FRASE_DE_FALHA)], replay: false };
  }
}
