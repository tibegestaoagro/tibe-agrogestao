import type { Intent } from "@/lib/whatsapp-intents";
import type { TenantPrismaClient } from "@/lib/prisma";
import { getRedisConnection } from "@/lib/redis";
import { pedidosAbertos } from "@/lib/actions/pending-store";
import { log } from "@/lib/log";

/**
 * O cursor da conversa (Task 8 da Fase 2): qual pergunta está aberta com o
 * produtor, numa leitura só, para o turno novo mandar "sim", "não" e resposta
 * curta direto à intenção certa, sem reclassificar o assunto do zero.
 *
 * POR QUE MAIS UMA CHAVE, além dos onze `*-pending.ts` e do `AgentFlowState`.
 * Nenhum dos dois diz sozinho qual dos dois (ou de qual dos onze domínios) é o
 * mais recente: é exatamente o problema que `stock-pending.ts` resolve para o
 * estoque contra os outros dez, mas o turno precisa da resposta para QUALQUER
 * domínio, sem varrer todo mundo a cada mensagem. O cursor é o resumo desse
 * resultado, escrito uma vez por chamada, no mesmo lugar sempre.
 *
 * Mesmo TTL dos pendentes (15 min): conversa que esfriou não deve ressuscitar
 * pela pergunta velha.
 */

const TTL_SEGUNDOS = 15 * 60;

/**
 * Nunca deixa o Redis (nem o banco, na leitura do `AgentFlowState`) travarem a
 * resposta do agente. Com o Redis fora do ar, `maxRetriesPerRequest: null`
 * (`redis.ts`) faz um `get`/`mget` que NUNCA resolve, e isso não é um erro:
 * nenhum try/catch pega uma promessa que só fica pendurada. Sem um limite de
 * tempo aqui, a rota na Vercel estoura em 504 e o n8n reexecuta uma gravação
 * que já tinha acontecido (rodada de correção 1, achado do revisor).
 */
const LIMITE_MS = 500;

/** Prefixo sintético do cadastro assistido: não é um dos onze domínios de `pending-store.ts`, mas ocupa o mesmo papel de "pedido aberto" para o cursor. */
const PREFIXO_FLOW = "flow";

export type Cursor = {
  intent: Intent;
  aguardando: string;
  pergunta: string;
  salvo_em: number;
  /** De qual domínio veio (um prefixo de `pending-store.ts`, ou `"flow"`). */
  prefixo: string;
};

function chave(tenantId: string, userId: string): string {
  return `tibe:cursor:${tenantId}:${userId}`;
}

export async function carregarCursor(tenantId: string, userId: string): Promise<Cursor | null> {
  try {
    const redis = getRedisConnection();
    const bruto = await redis.get(chave(tenantId, userId));
    if (!bruto) return null;
    const cursor = JSON.parse(bruto) as Cursor;
    if (!cursor || typeof cursor !== "object" || typeof cursor.aguardando !== "string") return null;
    return cursor;
  } catch {
    return null;
  }
}

export async function limparCursor(tenantId: string, userId: string): Promise<void> {
  try {
    await getRedisConnection().del(chave(tenantId, userId));
  } catch {
    // Redis fora do ar: sem cursor, o turno volta a classificar do zero. Pior, não quebrado.
  }
}

async function salvarCursor(tenantId: string, userId: string, cursor: Cursor): Promise<void> {
  try {
    await getRedisConnection().set(chave(tenantId, userId), JSON.stringify(cursor), "EX", TTL_SEGUNDOS);
  } catch {
    // idem: sem Redis, sem cursor, comportamento anterior.
  }
}

type CandidatoAberto = { prefixo: string; aguardando: string; salvo_em: number };

/**
 * O cadastro assistido como um pedido pendente igual aos outros onze:
 * `pending_field` é o campo aberto (mesmo papel de `aguardando`), e
 * `awaiting_summary` (sem campo, só esperando "sim") é o mesmo papel que
 * `"confirmacao"` tem nos outros domínios. Os dois nunca vêm juntos
 * (`agent-flows.ts` sempre zera um ao ligar o outro).
 */
function flowComoAberto(
  flow: { pending_field: string | null; awaiting_summary: boolean; updated_at: Date } | null,
): CandidatoAberto | null {
  if (!flow) return null;
  const aguardando = flow.pending_field ?? (flow.awaiting_summary ? "confirmacao" : null);
  if (!aguardando) return null;
  return { prefixo: PREFIXO_FLOW, aguardando, salvo_em: flow.updated_at.getTime() };
}

async function atualizarCursorSemLimite(input: {
  tenantId: string;
  userId: string;
  intentFinal: Intent;
  resposta: string;
  inicio: number;
  db: TenantPrismaClient;
}): Promise<void> {
  const { tenantId, userId, intentFinal, resposta, inicio, db } = input;

  const abertos = await pedidosAbertos(tenantId, userId);
  const flow = await db.agentFlowState.findFirst({
    where: { user_id: userId, expires_at: { gt: new Date() } },
  });
  const flowAberto = flowComoAberto(flow);
  const todosAbertos: CandidatoAberto[] = flowAberto ? [...abertos, flowAberto] : abertos;

  const frescos = todosAbertos.filter((p) => p.salvo_em >= inicio);

  if (frescos.length > 0) {
    // Empate por `salvo_em` (mesmo milissegundo): fica o ÚLTIMO da lista
    // (`reduce` só troca quando o próximo é estritamente maior ou igual).
    // Não há hoje um caso real de dois pedidos nascerem no mesmo milissegundo,
    // então a escolha do lado do empate não muda o comportamento observável.
    const maisRecente = frescos.reduce((a, b) => (b.salvo_em >= a.salvo_em ? b : a));
    await salvarCursor(tenantId, userId, {
      // O cadastro assistido é sempre `cadastrar_animal`, mesmo que a
      // intenção que chegou nesta chamada tenha sido outra (ex: o roteador
      // devolveu a pergunta do formulário para uma intenção que só a
      // interrompeu): quem vence aqui é o formulário, não quem bateu à porta.
      intent: maisRecente.prefixo === PREFIXO_FLOW ? "cadastrar_animal" : intentFinal,
      aguardando: maisRecente.aguardando,
      pergunta: resposta,
      salvo_em: Date.now(),
      prefixo: maisRecente.prefixo,
    });
    return;
  }

  /**
   * Nada fresco: o cursor de antes só continua valendo enquanto o pedido que
   * ELE aponta ainda estiver aberto. Antes bastava "algo aberto em qualquer
   * lugar", e isso deixava o cursor preso na pergunta errada quando o pedido
   * que ele apontava já tinha sido resolvido mas OUTRO domínio, sem relação
   * nenhuma, continuava com pendente antigo (achado da rodada de correção 1:
   * um pendente de estoque de longa data mantinha vivo o cursor de uma
   * pergunta do rebanho que o "sim" já tinha resolvido e apagado).
   */
  const cursorAtual = await carregarCursor(tenantId, userId);
  if (!cursorAtual) return;

  const cursorAindaAberto = todosAbertos.some((p) => p.prefixo === cursorAtual.prefixo);
  if (!cursorAindaAberto) await limparCursor(tenantId, userId);
}

/**
 * Chamada depois de cada roteamento (`executarIntencao`, nunca pelo turno
 * direto: ver o comentário lá), e só DEPOIS do `AgentRequest` ser gravado
 * (rodada de correção 1): o cursor é um atalho de conversa, não faz parte do
 * contrato da resposta, e não pode ser o motivo de uma gravação de negócio
 * não acontecer ou ser refeita.
 *
 * Protegida por tempo limite E por captura de erro: nem uma pendência real do
 * Redis (`LIMITE_MS`, ver comentário acima) nem uma falha do banco derrubam a
 * resposta do agente. Nos dois casos, só loga e segue: o pior resultado
 * possível é o cursor ficar desatualizado por uma rodada, o que o produtor
 * sente como "preciso repetir a frase", nunca como erro.
 */
export async function atualizarCursor(input: {
  tenantId: string;
  userId: string;
  intentFinal: Intent;
  resposta: string;
  inicio: number;
  db: TenantPrismaClient;
}): Promise<void> {
  let limite: NodeJS.Timeout | undefined;
  try {
    const tempoEsgotado = new Promise<"tempo">((resolve) => {
      limite = setTimeout(() => resolve("tempo"), LIMITE_MS);
    });
    const resultado = await Promise.race([
      atualizarCursorSemLimite(input).then(() => "ok" as const),
      tempoEsgotado,
    ]);
    if (resultado === "tempo") {
      log.warn("cursor da conversa: tempo esgotado, resposta segue sem atualizar", {
        tenant_id: input.tenantId,
        user_id: input.userId,
        intent: input.intentFinal,
      });
    }
  } catch (err) {
    log.warn("cursor da conversa: falhou, resposta segue sem atualizar", {
      tenant_id: input.tenantId,
      user_id: input.userId,
      intent: input.intentFinal,
      code: (err as { name?: string })?.name,
    });
  } finally {
    clearTimeout(limite);
  }
}
