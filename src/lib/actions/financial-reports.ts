import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";

/**
 * Relatórios financeiros (spec 4.4/4.5/4.6). Convenção de regime adotada:
 * - Fluxo de caixa (cashFlow): regime de CAIXA: só lançamentos `status: paid`,
 *   agrupados por `paid_at` (dinheiro que de fato movimentou).
 * - DRE (dre): regime de COMPETÊNCIA: todos os lançamentos do período
 *   (pending + paid), agrupados por `due_date` (resultado do período,
 *   independente de já ter sido pago).
 * - upcoming: `due_date` nos próximos N dias, `status: pending`.
 */

const RELATED_MODULES = ["rebanho", "lavoura", "servico", "maquinas", "geral"] as const;
const CALENDAR_DAY_MS = 86_400_000;
const pendingEntriesDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function resolvePendingEntriesCalendar(now: Date): {
  today: Date;
  monthEnd: Date;
} {
  const parts = pendingEntriesDateFormatter.formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  return {
    today: new Date(Date.UTC(year, month - 1, day)),
    monthEnd: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
  };
}

function utcCalendarDay(date: Date): number {
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
      CALENDAR_DAY_MS,
  );
}

export function calculatePendingDaysOverdue(
  dueDate: Date,
  today: Date,
): number | null {
  const days = utcCalendarDay(today) - utcCalendarDay(dueDate);
  return days > 0 ? days : null;
}

function defaultMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

export function resolvePeriod(startParam?: string | null, endParam?: string | null) {
  if (startParam && endParam) {
    return { start: new Date(startParam), end: new Date(endParam) };
  }
  return defaultMonthRange();
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}
function monthKey(d: Date) {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

export async function getCashFlow(
  db: TenantPrismaClient,
  params: {
    start: Date;
    end: Date;
    groupBy?: "day" | "month";
    related_module?: (typeof RELATED_MODULES)[number];
  },
) {
  const groupBy = params.groupBy ?? "day";
  const entries = await db.financialEntry.findMany({
    where: {
      status: "paid",
      paid_at: { gte: params.start, lte: params.end },
      ...(params.related_module ? { related_module: params.related_module } : {}),
    },
    select: { entry_type: true, amount: true, paid_at: true },
    orderBy: { paid_at: "asc" },
  });

  const buckets = new Map<string, { income: number; expense: number }>();
  for (const e of entries) {
    const key = groupBy === "month" ? monthKey(e.paid_at!) : dayKey(e.paid_at!);
    const bucket = buckets.get(key) ?? { income: 0, expense: 0 };
    const v = decToNum(e.amount) ?? 0;
    if (e.entry_type === "income") bucket.income += v;
    else bucket.expense += v;
    buckets.set(key, bucket);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, { income, expense }]) => ({
      period,
      income: Number(income.toFixed(2)),
      expense: Number(expense.toFixed(2)),
      balance: Number((income - expense).toFixed(2)),
    }));
}

export async function getDre(db: TenantPrismaClient, params: { start: Date; end: Date }) {
  const entries = await db.financialEntry.findMany({
    /**
     * Cancelado NÃO entra no resultado.
     *
     * A DRE é por competência, então ela ignora se a conta foi paga: o que ela
     * não pode ignorar é uma linha que não representa mais nada. Até
     * 2026-08-13 este `where` só filtrava data, e um lançamento `cancelled`
     * seguia pesando no "Resultado do mês". Ficou latente enquanto cancelar
     * era raro; o Módulo 31 tornou isso comum, porque cancelar uma negociação
     * cancela as contas em aberto dela. Um negócio de R$ 60.000 desfeito
     * continuava derrubando o resultado do mês em R$ 60.000.
     *
     * O fluxo de caixa (`getCashFlow`) nunca teve o problema: ele filtra
     * `status: "paid"`, e cancelado nunca é pago.
     */
    where: {
      due_date: { gte: params.start, lte: params.end },
      status: { not: "cancelled" },
    },
    select: { entry_type: true, amount: true, related_module: true },
  });

  const totals = new Map<string, { income: number; expense: number }>(
    RELATED_MODULES.map((m) => [m, { income: 0, expense: 0 }]),
  );
  for (const e of entries) {
    const mod = e.related_module ?? "geral";
    const bucket = totals.get(mod) ?? { income: 0, expense: 0 };
    const v = decToNum(e.amount) ?? 0;
    if (e.entry_type === "income") bucket.income += v;
    else bucket.expense += v;
    totals.set(mod, bucket);
  }

  const by_module = RELATED_MODULES.map((module) => {
    const t = totals.get(module)!;
    return {
      module,
      total_income: Number(t.income.toFixed(2)),
      total_expense: Number(t.expense.toFixed(2)),
      result: Number((t.income - t.expense).toFixed(2)),
    };
  });

  const total_result = Number(
    by_module.reduce((sum, m) => sum + m.result, 0).toFixed(2),
  );

  return {
    period: { start: params.start.toISOString().slice(0, 10), end: params.end.toISOString().slice(0, 10) },
    by_module,
    total_result,
  };
}

export async function getUpcoming(db: TenantPrismaClient, days: number) {
  const now = new Date();
  const limit = new Date(now.getTime() + days * 86_400_000);
  const entries = await db.financialEntry.findMany({
    where: { status: "pending", due_date: { gte: now, lte: limit } },
    orderBy: { due_date: "asc" },
  });
  return entries.map((e) => ({
    id: e.id,
    entry_type: e.entry_type,
    category: e.category,
    amount: decToNum(e.amount),
    due_date: e.due_date!.toISOString(),
    related_module: e.related_module,
  }));
}

export async function listPendingEntries(
  db: TenantPrismaClient,
  params: { entry_type: "income" | "expense"; end?: Date },
) {
  const calendar = resolvePendingEntriesCalendar(new Date());
  const end = params.end ?? calendar.monthEnd;
  const entries = await db.financialEntry.findMany({
    where: {
      status: "pending",
      entry_type: params.entry_type,
      due_date: { lte: end },
    },
    select: {
      id: true,
      category: true,
      amount: true,
      due_date: true,
      related_module: true,
      related_id: true,
    },
    orderBy: { due_date: "asc" },
  });

  return entries.map((entry) => {
    const dueDate = entry.due_date!;
    return {
      id: entry.id,
      category: entry.category,
      amount: decToNum(entry.amount),
      due_date: dueDate,
      related_module: entry.related_module,
      related_id: entry.related_id,
      days_overdue: calculatePendingDaysOverdue(dueDate, calendar.today),
    };
  });
}
