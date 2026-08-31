import type { Prisma, NegotiationEntryRole } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";

// Espelha o RelatedModule do Prisma. Alargado em 2026-08-31 (fase 3 do
// Módulo 30, confinamento): `related_module: "confinamento"` precisa passar
// por este mesmo helper, nunca um FinancialEntry criado à mão.
type RelatedModule = "rebanho" | "lavoura" | "servico" | "maquinas" | "geral" | "confinamento";
type EntryType = "income" | "expense";
type EntryStatus = "pending" | "paid" | "overdue";

export type TenantTransactionClient = Prisma.TransactionClient;
export type FinancialEntryCreateClient = {
  financialEntry: {
    create(args: Prisma.FinancialEntryCreateArgs): Promise<{ id: string }>;
  };
};

function isSerializableConflict(error: unknown): boolean {
  const candidate = error as {
    code?: string;
    cause?: { originalCode?: string; kind?: string };
  };
  return (
    candidate.code === "P2034" ||
    candidate.cause?.originalCode === "40001" ||
    candidate.cause?.kind === "TransactionWriteConflict"
  );
}

export async function runSerializableTenantTransaction<T>(
  db: TenantPrismaClient,
  operation: (tx: TenantTransactionClient) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => operation(tx as TenantTransactionClient),
        { isolationLevel: "Serializable" },
      );
    } catch (error) {
      const retryable = isSerializableConflict(error);
      if (!retryable || attempt === maxAttempts) throw error;
    }
  }
  throw new Error("Transação serializável excedeu o limite de tentativas");
}

/**
 * Cria um FinancialEntry vinculado a um evento de negócio (venda/compra de animal,
 * custo de vacina, insumo de lavoura, ordem de serviço faturada...).
 *
 * Default: `paid` (o evento já ocorreu: venda/compra/insumo), com paid_at/due_date
 * na data do evento. Para recebíveis (ex: ordem faturada), passe `status: "pending"`
 * e opcionalmente `due_date`; nesse caso paid_at fica null.
 */
export async function createLinkedEntry(
  db: FinancialEntryCreateClient,
  params: {
    entry_type: EntryType;
    category: string;
    amount: number;
    related_module: RelatedModule;
    related_id: string;
    occurred_at: Date;
    status?: EntryStatus;
    due_date?: Date | null;
    /**
     * Módulo 31: amarra o lançamento ao envelope da negociação, e diz se ele é
     * o valor combinado (`principal`) ou um custo adicional do §15
     * (`custo_adicional`). Sem estes dois campos aqui, o módulo de Negociações
     * teria que criar `FinancialEntry` por fora deste helper, que é justamente
     * o que o CLAUDE.md proíbe.
     */
    negotiation_id?: string | null;
    negotiation_role?: NegotiationEntryRole | null;
  },
) {
  const status = params.status ?? "paid";
  return db.financialEntry.create({
    data: scoped({
      entry_type: params.entry_type,
      category: params.category,
      amount: params.amount,
      related_module: params.related_module,
      related_id: params.related_id,
      due_date: params.due_date ?? params.occurred_at,
      paid_at: status === "paid" ? params.occurred_at : null,
      status,
      negotiation_id: params.negotiation_id ?? null,
      negotiation_role: params.negotiation_role ?? null,
    }),
  });
}
