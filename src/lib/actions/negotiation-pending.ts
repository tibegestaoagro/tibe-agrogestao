import { getRedisConnection } from "@/lib/redis";

/**
 * O negócio que ficou esperando uma resposta (Módulo 31, registro por
 * WhatsApp).
 *
 * Mesmo mecanismo e mesmos motivos de `herd-pending.ts`, que nasceu de três
 * defeitos reais em produção e cujas lições valem inteiras aqui: o pedido
 * guardado manda sobre a reconstrução do classificador, da mensagem seguinte
 * entra SÓ o campo perguntado, e um "sim" sem nada guardado não escreve nada.
 *
 * Um negócio erra mais caro que uma movimentação: uma linha grava animais no
 * rebanho E parcelas no financeiro de uma vez. Confirmação sem âncora aqui
 * seria assinatura em papel em branco com o rebanho junto.
 *
 * DUPLICAÇÃO DELIBERADA: os ~30 linhas de Redis abaixo são quase iguais às de
 * `herd-pending.ts`. Unificar as duas exigiria mexer num módulo já validado em
 * produção no meio de outra missão, e o risco não paga o ganho. Quando o
 * terceiro domínio precisar disto, aí sim vale extrair um store genérico:
 * dois casos ainda são coincidência, três são um padrão.
 */

const TTL_SEGUNDOS = 15 * 60;

/** O campo que o assistente perguntou e está esperando. */
export type CampoNegocio =
  | "tipo"
  | "categoria"
  | "quantidade"
  | "valor"
  | "fazenda"
  | "pasto"
  | "data"
  | "vencimento"
  /** Não é campo: é o negócio inteiro esperando um "sim". */
  | "confirmacao";

export type NegocioPendente = {
  parameters: Record<string, unknown>;
  aguardando: CampoNegocio;
  /** Quantas vezes o MESMO campo já foi perguntado: trava de laço. */
  tentativas?: number;
};

export const MAX_TENTATIVAS = 3;

function chave(tenantId: string, userId: string): string {
  return `tibe:negocio-pending:${tenantId}:${userId}`;
}

export async function savePendingNegotiation(
  tenantId: string,
  userId: string,
  pedido: NegocioPendente,
): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.set(chave(tenantId, userId), JSON.stringify(pedido), "EX", TTL_SEGUNDOS);
  } catch {
    // Redis fora do ar não pode derrubar o registro: sem o pendente o
    // assistente volta a depender do histórico, que é o comportamento antigo.
  }
}

export async function loadPendingNegotiation(
  tenantId: string,
  userId: string,
): Promise<NegocioPendente | null> {
  try {
    const redis = getRedisConnection();
    const bruto = await redis.get(chave(tenantId, userId));
    if (!bruto) return null;
    const pedido = JSON.parse(bruto) as NegocioPendente;
    if (!pedido || typeof pedido !== "object" || !pedido.parameters) return null;
    return pedido;
  } catch {
    return null;
  }
}

export async function clearPendingNegotiation(tenantId: string, userId: string): Promise<void> {
  try {
    const redis = getRedisConnection();
    await redis.del(chave(tenantId, userId));
  } catch {
    // idem
  }
}

/**
 * Junta a resposta ao negócio guardado: da mensagem nova entra APENAS o campo
 * que estava sendo perguntado. Devolve `null` quando a mensagem não responde
 * ao que foi perguntado (aí é assunto novo, não resposta).
 *
 * Aceita número além de texto porque `quantidade` e `valor` chegam do
 * classificador como número, e exigir string descartaria a resposta certa.
 */
export function aplicarRespostaNegocio(
  pendente: NegocioPendente,
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
 * Nome alternativo que o classificador usa para o mesmo campo. Mesma
 * necessidade de `herd-pending.ts`: o modelo não carrega de volta qual era a
 * pergunta, então responde com o nome mais natural do campo.
 */
function atalho(campo: CampoNegocio): string {
  if (campo === "categoria") return "category";
  if (campo === "fazenda") return "property";
  if (campo === "pasto") return "pasto_origem";
  if (campo === "data") return "date";
  if (campo === "vencimento") return "due_date";
  if (campo === "valor") return "amount";
  if (campo === "quantidade") return "quantity";
  if (campo === "tipo") return "negotiation_type";
  return campo;
}
