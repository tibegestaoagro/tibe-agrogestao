import { getRedisConnection } from "@/lib/redis";

/**
 * O pedido de confinamento que ficou esperando uma resposta (Módulo 30, fase
 * 3, §26). Mesmo mecanismo e mesmos motivos de `event-pending.ts` e
 * `barter-pending.ts`: o pedido guardado manda sobre a reconstrução do
 * classificador, da mensagem seguinte entra SÓ o campo perguntado, e um "sim"
 * sem nada guardado não escreve nada.
 *
 * SEM ESTA ÂNCORA o handler repetiria o defeito já pago em produção em
 * 2026-08-18: o "sim" executando o que o classificador remontou, não o que foi
 * mostrado.
 *
 * Chave ÚNICA por pessoa, como em `event-pending.ts`: quatro gestos possíveis
 * (entrada em confinamento, envio a boitel, alimentação, saída), e cada
 * handler confere `gesto` antes de usar o que está guardado, para o "sim" de
 * uma conversa não executar a de outra.
 *
 * DUPLICAÇÃO DELIBERADA, pelo mesmo argumento escrito em `event-pending.ts`:
 * unificar os stores de pendência exigiria mexer em módulos já validados em
 * produção no meio de outra missão.
 */

const TTL_SEGUNDOS = 15 * 60;

export type GestoConfinamento = "entrada_confinamento" | "entrada_boitel" | "alimentacao" | "saida";

/** O campo que o assistente perguntou e está esperando. */
export type CampoConfinamento =
  | "categoria"
  | "quantidade"
  | "fazenda"
  | "confinamento"
  | "pasto"
  | "data"
  | "produto"
  | "valor"
  /** Não é campo: é o pedido inteiro esperando um "sim". */
  | "confirmacao";

export type ConfinamentoPendente = {
  parameters: Record<string, unknown>;
  aguardando: CampoConfinamento;
  /** Qual das quatro conversas está aberta. */
  gesto: GestoConfinamento;
  salvo_em?: number;
};

function chave(tenantId: string, userId: string): string {
  return `tibe:confinamento-pending:${tenantId}:${userId}`;
}

export async function savePendingConfinement(
  tenantId: string,
  userId: string,
  pedido: ConfinamentoPendente,
): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(
      chave(tenantId, userId),
      JSON.stringify({ ...pedido, salvo_em: pedido.salvo_em ?? Date.now() }),
      "EX",
      TTL_SEGUNDOS,
    );
  } catch {
    // Redis fora do ar não pode derrubar o registro: sem o pendente o
    // assistente volta a depender do histórico, que é o comportamento antigo.
  }
}

export async function loadPendingConfinement(
  tenantId: string,
  userId: string,
): Promise<ConfinamentoPendente | null> {
  try {
    const redis = getRedisConnection();
    const bruto = await redis.get(chave(tenantId, userId));
    if (!bruto) return null;
    const pedido = JSON.parse(bruto) as ConfinamentoPendente;
    if (!pedido || typeof pedido !== "object" || !pedido.parameters) return null;
    return pedido;
  } catch {
    return null;
  }
}

export async function clearPendingConfinement(tenantId: string, userId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.del(chave(tenantId, userId));
  } catch {
    // idem
  }
}

/**
 * Junta a resposta ao pedido guardado: da mensagem nova entra APENAS o campo
 * que estava sendo perguntado. Devolve `null` quando a mensagem não responde
 * ao que foi perguntado, porque aí é assunto novo, não resposta.
 */
export function aplicarRespostaConfinamento(
  pendente: ConfinamentoPendente,
  novos: Record<string, unknown>,
): Record<string, unknown> | null {
  const bruto = novos[pendente.aguardando] ?? novos[atalho(pendente.aguardando)];

  if (typeof bruto === "number" && Number.isFinite(bruto)) {
    return { ...pendente.parameters, [pendente.aguardando]: bruto };
  }
  if (typeof bruto === "string" && bruto.trim() !== "") {
    return { ...pendente.parameters, [pendente.aguardando]: bruto.trim() };
  }
  return null;
}

/**
 * O nome alternativo que o classificador usa para o mesmo campo: ele não
 * carrega de volta qual era a pergunta, então responde com o nome mais natural.
 */
function atalho(campo: CampoConfinamento): string {
  if (campo === "categoria") return "category";
  if (campo === "fazenda") return "property";
  if (campo === "quantidade") return "quantity";
  if (campo === "produto") return "product";
  if (campo === "pasto") return "pasture";
  if (campo === "data") return "date";
  if (campo === "valor") return "amount";
  return campo;
}
