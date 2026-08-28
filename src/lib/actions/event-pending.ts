import { getRedisConnection } from "@/lib/redis";

/**
 * A remessa de evento que ficou esperando uma resposta (Módulo 31, missão 3).
 *
 * Mesmo mecanismo e mesmos motivos de `negotiation-pending.ts` e
 * `herd-pending.ts`: o pedido guardado manda sobre a reconstrução do
 * classificador, da mensagem seguinte entra SÓ o campo perguntado, e um "sim"
 * sem nada guardado não escreve nada.
 *
 * SEM ESTA ÂNCORA o handler estaria repetindo um defeito já pago em produção:
 * em 2026-08-18, no estoque, o "sim" executou o que o classificador remontou,
 * mostrando 10 sacas e gravando 100. O guia do n8n manda o LLM remontar os
 * parâmetros pelo histórico, e `auxiliary_data` é só SAÍDA: não há por onde
 * receber de volta o que foi mostrado.
 *
 * Chave PRÓPRIA, e não a de `negocio-pending`: um leilão e uma compra de gado
 * são duas conversas diferentes, e dividir a chave faria um "sim" de uma
 * executar a outra.
 *
 * DUPLICAÇÃO DELIBERADA, pelo mesmo argumento escrito em
 * `negotiation-pending.ts`: unificar os stores exigiria mexer em três módulos
 * já validados em produção no meio de outra missão.
 */

const TTL_SEGUNDOS = 15 * 60;

/** O campo que o assistente perguntou e está esperando. */
export type CampoRemessa =
  | "categoria"
  | "quantidade"
  | "evento"
  | "fazenda"
  | "vendidos"
  | "retornados"
  | "valor"
  /** Não é campo: é a remessa inteira esperando um "sim". */
  | "confirmacao";

export type RemessaPendente = {
  parameters: Record<string, unknown>;
  aguardando: CampoRemessa;
  /** Qual das duas conversas está aberta: abrir a remessa ou encerrá-la. */
  gesto: "abrir" | "encerrar";
  /** A remessa sendo encerrada, quando o gesto é `encerrar`. */
  negotiation_id?: string;
  salvo_em?: number;
};

function chave(tenantId: string, userId: string): string {
  return `tibe:remessa-pending:${tenantId}:${userId}`;
}

export async function savePendingEvent(
  tenantId: string,
  userId: string,
  pedido: RemessaPendente,
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

export async function loadPendingEvent(
  tenantId: string,
  userId: string,
): Promise<RemessaPendente | null> {
  try {
    const redis = getRedisConnection();
    const bruto = await redis.get(chave(tenantId, userId));
    if (!bruto) return null;
    const pedido = JSON.parse(bruto) as RemessaPendente;
    if (!pedido || typeof pedido !== "object" || !pedido.parameters) return null;
    return pedido;
  } catch {
    return null;
  }
}

export async function clearPendingEvent(tenantId: string, userId: string): Promise<void> {
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
export function aplicarRespostaRemessa(
  pendente: RemessaPendente,
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
function atalho(campo: CampoRemessa): string {
  if (campo === "categoria") return "category";
  if (campo === "fazenda") return "property";
  if (campo === "quantidade") return "quantity";
  if (campo === "evento") return "event_name";
  if (campo === "valor") return "amount";
  return campo;
}
