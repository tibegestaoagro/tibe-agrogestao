import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import type { FinancialEntryCreateClient } from "@/lib/financial";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lançamentos financeiros manuais (spec 4.2). Sempre `related_module: geral`,
 * com `related_id` opcional para correlação sintética de previsões. Lançamentos
 * vinculados diretamente a outros módulos (venda de animal, insumo, ordem
 * faturada) são criados por `createLinkedEntry` (`src/lib/financial.ts`),
 * nunca por aqui.
 */

export async function createManualEntryAction(
  db: FinancialEntryCreateClient,
  input: {
    entry_type: "income" | "expense";
    category: string;
    amount: number;
    due_date: Date;
    notes?: string | null;
    related_id?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  const entry = await db.financialEntry.create({
    data: scoped({
      entry_type: input.entry_type,
      category: input.category,
      amount: input.amount,
      related_module: "geral" as const,
      related_id: input.related_id ?? null,
      due_date: input.due_date,
      notes: input.notes ?? null,
      status: "pending" as const,
    }),
  });
  return ok({ id: entry.id });
}

/**
 * Edita um lançamento: apenas permitido para `related_module: geral`
 * (manuais). Editar um lançamento gerado automaticamente por outro módulo
 * (ex: "Venda de animal") descolaria o dado da origem (AnimalMovement,
 * ServiceOrder...) e não é permitido.
 */
export async function updateManualEntryAction(
  db: TenantPrismaClient,
  id: string,
  input: {
    category?: string;
    amount?: number;
    due_date?: Date;
    notes?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  const existing = await db.financialEntry.findFirst({ where: { id } });
  if (!existing) return fail("NOT_FOUND", "Lançamento não encontrado", 404);
  if (existing.related_module !== "geral") {
    return fail(
      "NOT_EDITABLE",
      "Este lançamento foi gerado automaticamente por outro módulo e não pode ser editado diretamente",
      422,
    );
  }

  await db.financialEntry.update({
    where: { id },
    data: {
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.due_date !== undefined ? { due_date: input.due_date } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  });
  return ok({ id });
}

/** Marca como pago: permitido para qualquer lançamento, independente da origem. */
export async function markEntryPaidAction(
  db: TenantPrismaClient,
  id: string,
  paidAt?: Date | null,
): Promise<ActionResult<{ id: string; paid_at: Date }>> {
  const existing = await db.financialEntry.findFirst({ where: { id } });
  if (!existing) return fail("NOT_FOUND", "Lançamento não encontrado", 404);
  if (existing.status === "paid") {
    return fail("ALREADY_PAID", "Este lançamento já está marcado como pago", 409);
  }

  const paid_at = paidAt ?? new Date();
  await db.financialEntry.update({
    where: { id },
    data: { status: "paid", paid_at },
  });
  return ok({ id, paid_at });
}

/**
 * Adia o vencimento: permitido para qualquer lançamento pendente,
 * independente da origem (Módulo 28). Diferente de editar (NOT_EDITABLE
 * fora de "geral"): só muda a data, não descola o dado da origem.
 */
export async function postponeEntryDueDateAction(
  db: TenantPrismaClient,
  id: string,
  newDueDate: Date,
): Promise<ActionResult<{ id: string; due_date: Date }>> {
  const existing = await db.financialEntry.findFirst({ where: { id } });
  if (!existing) return fail("NOT_FOUND", "Lançamento não encontrado", 404);
  if (existing.status !== "pending") {
    return fail("NOT_PENDING", "Só é possível adiar o vencimento de um lançamento pendente", 422);
  }

  await db.financialEntry.update({ where: { id }, data: { due_date: newDueDate } });
  return ok({ id, due_date: newDueDate });
}

/**
 * Cancela um lançamento: permitido para qualquer um, independente da
 * origem ou do status atual (Módulo 28). Só muda o status, não apaga nem
 * mexe em valor/categoria: risco bem menor que editar.
 */
export async function cancelEntryAction(
  db: TenantPrismaClient,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const existing = await db.financialEntry.findFirst({ where: { id } });
  if (!existing) return fail("NOT_FOUND", "Lançamento não encontrado", 404);
  if (existing.status === "cancelled") {
    return fail("ALREADY_CANCELLED", "Este lançamento já está cancelado", 409);
  }

  await db.financialEntry.update({ where: { id }, data: { status: "cancelled" } });
  return ok({ id });
}
