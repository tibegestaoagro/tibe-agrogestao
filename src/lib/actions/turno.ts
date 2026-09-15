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
import { classificarMensagem, classificarResposta, normalizarParaComparar, trechoOuMensagemInteira } from "@/lib/agente/classificar";
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
/** Falha depois de algum pedido já ter ido ao núcleo: mandar tudo de novo pode gravar duas vezes. */
const FRASE_DE_FALHA_PARCIAL =
  "Não consegui terminar. Parte do que você pediu pode já ter sido registrada: confira antes de mandar de novo.";
/** Primeira palavra de pergunta: áudio transcrito chega sem "?", e a pergunta não pode virar resposta de campo. */
const INTERROGATIVAS = new Set(["quanto", "quanta", "quantos", "quantas", "qual", "quais", "onde", "cade", "como", "quando", "tem", "existe"]);

function comecaComPergunta(texto: string): boolean {
  const primeira = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[a-z]+/)?.[0];
  return !!primeira && INTERROGATIVAS.has(primeira);
}
/** Mesma frase de `identificarContato` para número desconhecido: aqui cobre o contato sem usuário ativo, que vem sem sugestão. */
const NUMERO_NAO_CADASTRADO =
  "Este número não está cadastrado no Tibé. Peça para o administrador da sua empresa cadastrar seu telefone no sistema.";
const BOAS_VINDAS = "Olá! Bem-vindo(a) ao Tibé. É só me mandar uma mensagem com o que precisa.";

/** Texto fixo do próprio turno: nunca vai ao humanizador. */
function fixa(texto: string): MensagemDoTurno {
  return { texto, pode_humanizar: false, report_url: null };
}

/** `trecho`: o recorte da mensagem que é deste pedido; só a classificação o preenche. */
type Pedido = { intent: Intent; parameters: Record<string, unknown>; trecho?: string };
type Identificado = Extract<ContatoIdentificado, { identificado: true }>;

async function entenderPedidos(e: EntradaDoTurno, contato: Identificado, agora: Date): Promise<Pedido[]> {
  if (e.recibo) return [{ intent: "registrar_lancamento_financeiro", parameters: { ...e.recibo } }];

  const cursor = await carregarCursor(contato.tenant_id, contato.user.id);
  if (cursor) {
    // Sim e não pertencem ao pedido aberto; o núcleo lê a confirmação do próprio texto.
    if (detectConfirmation(e.texto)) return [{ intent: cursor.intent, parameters: {} }];
    // Esperando só confirmação (`confirmacao`, `confirmacao_remocao`...), não há campo para a resposta preencher: é assunto novo.
    if (!cursor.aguardando.startsWith("confirmacao")) {
      const leitura = await classificarResposta({
        texto: e.texto,
        pergunta: cursor.pergunta,
        intent: cursor.intent,
        campo: cursor.aguardando,
      });
      const valor = leitura.valor?.trim();
      /**
       * `responde` só vale com um valor que É recorte da mensagem, e nunca numa pergunta.
       * O campo recebe um texto que o handler resolve por aproximação: "quanto tenho de sal?"
       * lido como resposta ao produto casava "Sal" por substring e gravava o uso sem confirmar.
       * Pergunta é o "?" ou a primeira palavra interrogativa (áudio transcrito não tem "?").
       */
      const respostaLiteral =
        leitura.tipo === "responde" &&
        !!valor &&
        !e.texto.includes("?") &&
        !comecaComPergunta(e.texto) &&
        normalizarParaComparar(e.texto).includes(normalizarParaComparar(valor));
      if (respostaLiteral) return [{ intent: cursor.intent, parameters: { [cursor.aguardando]: valor } }];
    }
  }

  const hoje = inicioDoDiaEmSaoPaulo(agora).toISOString().slice(0, 10);
  return classificarMensagem({ texto: e.texto, hoje, perfis: contato.activeProfiles });
}

/**
 * O texto que o núcleo lê é o do PRÓPRIO pedido: com a mensagem inteira, "vendi 10 bois e mandei 5 pro
 * confinamento" desviava a venda para `encerrar_confinamento` pela palavra do outro pedido.
 *
 * Mas o núcleo também lê a confirmação desse texto, e a confirmação continua sendo da MENSAGEM: quando o
 * trecho lê sim ou não diferente dela, vai a mensagem inteira. Sem isto, "ok, e quanto tenho de ração"
 * recortado em "ok" confirmava a compra pendente, que a leitura estrita da mensagem inteira recusa.
 */
function textoDoPedido(pedido: Pedido, texto: string): string | null {
  if (!pedido.trecho) return texto || null;
  const trecho = trechoOuMensagemInteira(pedido.trecho, texto);
  return detectConfirmation(trecho) === detectConfirmation(texto) ? trecho : texto;
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
  let executando = false;
  const mensagens: MensagemDoTurno[] = [];

  try {
    // Antes do replay: o AgentRequest é escopado por tenant, e sem contato não há tenant.
    const contato = await identificarContato(e.telefone);
    if (!contato.identificado) {
      return { mensagens: [fixa(contato.resposta_sugerida ?? NUMERO_NAO_CADASTRADO)], replay: false };
    }
    db = prismaForTenant(contato.tenant_id);
    contatoId = contato.contato_id;

    if (contato.primeiro_contato) {
      const saudacao = fixa(contato.resposta_sugerida || BOAS_VINDAS);
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

    executando = true;
    for (const [indice, pedido] of pedidos.entries()) {
      const r = await executarIntencao({
        db,
        tenant_id: contato.tenant_id,
        user: { id: contato.user.id, role: contato.user.role },
        contato_id: contatoId,
        activeProfiles: contato.activeProfiles,
        intent: pedido.intent,
        parameters: pedido.parameters,
        // Com recibo, a legenda nunca é confirmação: um "ok" confirmaria o pendente financeiro ANTERIOR.
        message_text: e.recibo ? null : textoDoPedido(pedido, e.texto),
        confirmed_do_corpo: null,
        // Índice na chave: dois pedidos da mesma intenção colidiriam em `wamid#intent`.
        provider_message_id: wamid ? `${wamid}#${indice}` : null,
        registrar_entrada: false,
      });
      mensagens.push({
        texto: r.reply_text,
        pode_humanizar:
          !/\d/.test(r.reply_text) &&
          !r.requires_confirmation &&
          !r.action_taken.includes("aguardando") &&
          !r.action_taken.startsWith("cadastro_assistido:") &&
          r.action_taken !== "clarification_requested",
        report_url: r.report_url,
      });
    }

    await gravarTurno(db, chaveDoTurno, mensagens);
    return { mensagens, replay: false };
  } catch (err) {
    /**
     * Sem gravar o turno: o reenvio com o mesmo wamid tenta de novo, e os pedidos que já rodaram
     * voltam por replay do núcleo (chave com índice). As respostas já produzidas saem antes da
     * frase: esconder um uso de estoque já gravado faria o produtor mandar de novo com outro wamid
     * e gravar duas vezes. `FalhaDoModelo` só acontece antes do primeiro pedido (a classificação
     * termina antes de executar), então para ela a lista está sempre vazia.
     *
     * Falha depois de algum pedido ir ao núcleo não pede para mandar de novo: o pedido que falhou pode
     * ter gravado antes de quebrar (sem resposta na lista), e só o produtor sabe o que conferir.
     */
    const frase = executando ? FRASE_DE_FALHA_PARCIAL : FRASE_DE_FALHA;
    const action_taken = err instanceof FalhaDoModelo ? `turno:falha_do_modelo:${err.motivo}` : "turno:falha_interna";
    if (!(err instanceof FalhaDoModelo)) {
      log.error("turno do agente: erro inesperado", { route: "/api/internal/whatsapp/turno", code: resumirErro(err).name });
      console.error(JSON.stringify({ level: "error", msg: "detalhe", err: resumirErro(err) }));
    }
    if (db && contatoId) {
      // O log não pode trocar a frase de falha por um 500.
      await logOutbound(db, { whatsapp_contact_id: contatoId, content: frase, action_taken, prompt_version: VERSAO_DO_PROMPT }).catch(
        () => undefined,
      );
    }
    return { mensagens: [...mensagens, fixa(frase)], replay: false };
  }
}
