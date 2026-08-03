import type { Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";

type RelatedModule = "rebanho" | "lavoura" | "servico" | "maquinas" | "geral";
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
    }),
  });
}
