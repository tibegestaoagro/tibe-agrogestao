import { scoped, type TenantPrismaClient } from "@/lib/prisma";

type RelatedModule = "rebanho" | "lavoura" | "servico" | "geral";
type EntryType = "income" | "expense";
type EntryStatus = "pending" | "paid" | "overdue";

/**
 * Cria um FinancialEntry vinculado a um evento de negócio (venda/compra de animal,
 * custo de vacina, insumo de lavoura, ordem de serviço faturada...).
 *
 * Default: `paid` (o evento já ocorreu: venda/compra/insumo), com paid_at/due_date
 * na data do evento. Para recebíveis (ex: ordem faturada), passe `status: "pending"`
 * e opcionalmente `due_date`; nesse caso paid_at fica null.
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
