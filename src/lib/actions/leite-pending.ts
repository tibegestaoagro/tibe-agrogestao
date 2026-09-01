import { getRedisConnection } from "@/lib/redis";

/**
 * O pedido de leite que ficou esperando uma resposta (Área Leite, §36).
 *
 * Mesmo mecanismo e mesmos motivos de `confinamento-pending.ts`,
 * `event-pending.ts` e `barter-pending.ts`: o pedido guardado manda sobre a
 * reconstrução do classificador, da mensagem seguinte entra SÓ o campo
 * perguntado, e um "sim" sem nada guardado não escreve nada.
 *
 * SEM ESTA ÂNCORA o handler repetiria o defeito já pago em produção em
 * 2026-08-18: o "sim" executando o que o classificador remontou, não o que foi
 * mostrado. O §36 mostra o TIBÉ confirmando em todas as conversas do leite,
 * então todas passam por aqui.
 *
 * DUPLICAÇÃO DELIBERADA, pelo mesmo argumento escrito em `event-pending.ts`:
 * unificar os stores de pendência exigiria mexer em módulos já validados em
 * produção no meio de outra missão.
 */

const TTL_SEGUNDOS = 15 * 60;

export type GestoLeite = "producao" | "lactacao";

/** O campo que o assistente perguntou e está esperando. */
export type CampoLeite =
  | "litros"
  | "quantidade"
  | "fazenda"
  | "lote"
  | "data"
  /** Não é campo: é o pedido inteiro esperando um "sim". */
  | "confirmacao";

export type LeitePendente = {
  parameters: Record<string, unknown>;
  aguardando: CampoLeite;
  /** Qual das duas conversas está aberta. */
  gesto: GestoLeite;
  salvo_em?: number;
};

function chave(tenantId: string, userId: string): string {
  return `tibe:leite-pending:${tenantId}:${userId}`;
}

export async function savePendingMilk(
  tenantId: string,
  userId: string,
  pedido: LeitePendente,
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

export async function loadPendingMilk(
  tenantId: string,
  userId: string,
): Promise<LeitePendente | null> {
  try {
    const redis = getRedisConnection();
    const bruto = await redis.get(chave(tenantId, userId));
    if (!bruto) return null;
    const pedido = JSON.parse(bruto) as LeitePendente;
    if (!pedido || typeof pedido !== "object" || !pedido.parameters) return null;
    return pedido;
  } catch {
    return null;
  }
}

export async function clearPendingMilk(tenantId: string, userId: string): Promise<void> {
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
export function aplicarRespostaLeite(
  pendente: LeitePendente,
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
function atalho(campo: CampoLeite): string {
  if (campo === "litros") return "liters";
  if (campo === "quantidade") return "quantity";
  if (campo === "fazenda") return "property";
  if (campo === "lote") return "group";
  if (campo === "data") return "date";
  return campo;
}
