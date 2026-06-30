import { scoped, type TenantPrismaClient } from "@/lib/prisma";

type RelatedModule = "rebanho" | "lavoura" | "servico" | "geral";
type EntryType = "income" | "expense";

/**
 * Cria um FinancialEntry vinculado a um evento de negócio (venda/compra de animal,
 * custo de vacina, insumo de lavoura...). Esses lançamentos automáticos nascem como
 * `paid` (o evento já ocorreu), com paid_at/due_date na data do evento.
 */
export async function createLinkedEntry(
  db: TenantPrismaClient,
  params: {
    entry_type: EntryType;
    category: string;
    amount: number;
    related_module: RelatedModule;
    related_id: string;
    occurred_at: Date;
  },
) {
  return db.financialEntry.create({
    data: scoped({
      entry_type: params.entry_type,
      category: params.category,
      amount: params.amount,
      related_module: params.related_module,
      related_id: params.related_id,
      due_date: params.occurred_at,
      paid_at: params.occurred_at,
      status: "paid" as const,
    }),
  });
}
