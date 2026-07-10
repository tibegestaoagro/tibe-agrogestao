import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { ok, type ActionResult } from "@/lib/actions/types";

/** Resolve um "period" (formato "YYYY-MM", opcional) para o intervalo do mês. */
function resolveMonthRange(period?: string | null): { from: Date; to: Date; label: string } {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  if (period && /^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    year = y;
    month = m - 1;
  }

  const from = new Date(year, month, 1);
  const to = new Date(year, month + 1, 1);
  const label = from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return { from, to, label };
}

/**
 * Saldo do período (intenção `consultar_saldo`, spec 3.4): soma de FinancialEntry
 * com status='paid' (movimentação de caixa efetiva) dentro do período, considerando
 * `paid_at`. Default: mês atual.
 */
export async function getBalanceAction(
  db: TenantPrismaClient,
  period?: string | null,
): Promise<
  ActionResult<{ period_label: string; income: number; expense: number; balance: number }>
> {
  const { from, to, label } = resolveMonthRange(period);

  const entries = await db.financialEntry.findMany({
    where: { status: "paid", paid_at: { gte: from, lt: to } },
    select: { entry_type: true, amount: true },
  });

  let income = 0;
  let expense = 0;
  for (const e of entries) {
    const v = decToNum(e.amount) ?? 0;
    if (e.entry_type === "income") income += v;
    else expense += v;
  }

  return ok({
    period_label: label,
    income: Number(income.toFixed(2)),
    expense: Number(expense.toFixed(2)),
    balance: Number((income - expense).toFixed(2)),
  });
}
