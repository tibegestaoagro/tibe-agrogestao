import type { Intent } from "@/lib/whatsapp-intents";
import type { TenantPrismaClient } from "@/lib/prisma";
import { getRedisConnection } from "@/lib/redis";
import { pedidosAbertos } from "@/lib/actions/pending-store";

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

export type Cursor = { intent: Intent; aguardando: string; pergunta: string; salvo_em: number };

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

/**
 * Chamada depois de cada roteamento (`executarIntencao`, nunca pelo turno
 * direto: ver o comentário lá).
 *
 * Grava o cursor quando algum pedido foi guardado NESTA chamada (um dos onze
 * domínios de `pending-store.ts`, ou o cadastro assistido em
 * `AgentFlowState`). Se nada foi guardado agora mas ainda sobra pedido aberto
 * em algum lugar (uma pergunta mais antiga, de outro domínio, ainda dentro do
 * TTL dela), o cursor de antes continua valendo e não é tocado: ele já aponta
 * para a pergunta certa. Só apaga quando não sobra pedido aberto NENHUM.
 */
export async function atualizarCursor(input: {
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
  const flowAberto = flow?.pending_field ? { aguardando: flow.pending_field, salvo_em: flow.updated_at.getTime() } : null;

  const frescos = [
    ...abertos.filter((p) => p.salvo_em >= inicio),
    ...(flowAberto && flowAberto.salvo_em >= inicio ? [flowAberto] : []),
  ];

  if (frescos.length > 0) {
    const maisRecente = frescos.reduce((a, b) => (b.salvo_em >= a.salvo_em ? b : a));
    await salvarCursor(tenantId, userId, {
      intent: intentFinal,
      aguardando: maisRecente.aguardando,
      pergunta: resposta,
      salvo_em: Date.now(),
    });
    return;
  }

  const sobraAberto = abertos.length > 0 || !!flowAberto;
  if (!sobraAberto) await limparCursor(tenantId, userId);
}
