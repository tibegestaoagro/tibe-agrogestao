import { prisma } from "@/lib/prisma";
import { PLAN_PRICES } from "@/lib/asaas";
import type { TenantPlan, SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * KPIs do painel da plataforma (Módulo 6, tasks 6.4-6.7). Tudo calculado sob
 * demanda a partir de Subscription + SubscriptionStatusLog: sem snapshot
 * histórico persistido nesta versão (spec 6.5).
 *
 * MRR sempre usa PLAN_PRICES (preço ATUAL do plano): não há histórico de
 * preço por assinatura no schema, então "valor do plano vigente" (spec 6.4)
 * só pode significar o preço de hoje, aplicado também a meses passados no
 * gráfico de evolução. Documentado: se o preço mudar no futuro, MRR de
 * meses antigos recalcula com o preço novo (limitação aceita para o MVP).
 */

export type Period = "30d" | "90d" | "12m";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function periodStartDate(period: Period, from: Date = new Date()): Date {
  if (period === "30d") return new Date(from.getTime() - 30 * 86_400_000);
  if (period === "90d") return new Date(from.getTime() - 90 * 86_400_000);
  const d = new Date(from);
  d.setMonth(d.getMonth() - 12);
  return d;
}

/**
 * Reconstrói o status de cada Subscription "as of" uma data: o status mais
 * recente registrado em SubscriptionStatusLog com created_at <= asOf. Uma
 * Subscription sem nenhum log até essa data ainda não existia nesse momento.
 */
async function getStatusAsOf(asOf: Date): Promise<Map<string, SubscriptionStatus>> {
  const logs = await prisma.subscriptionStatusLog.findMany({
    where: { created_at: { lte: asOf } },
    orderBy: { created_at: "desc" },
    select: { subscription_id: true, to_status: true },
  });
  const result = new Map<string, SubscriptionStatus>();
  for (const log of logs) {
    if (!result.has(log.subscription_id)) result.set(log.subscription_id, log.to_status);
  }
  return result;
}

export type MrrResult = {
  total_mrr: number;
  by_plan: Record<TenantPlan, number>;
  active_subscriptions_count: number;
};

/** Soma o valor mensal (PLAN_PRICES) de toda Subscription ativa agora (spec 6.4). */
export async function calculateMRR(): Promise<MrrResult> {
  const activeSubs = await prisma.subscription.findMany({
    where: { status: "active" },
    select: { plan: true },
  });
  const by_plan: Record<TenantPlan, number> = { campo: 0, fazenda: 0, grupo: 0 };
  for (const s of activeSubs) {
    by_plan[s.plan] += PLAN_PRICES[s.plan];
  }
  return {
    total_mrr: round2(by_plan.campo + by_plan.fazenda + by_plan.grupo),
    by_plan: { campo: round2(by_plan.campo), fazenda: round2(by_plan.fazenda), grupo: round2(by_plan.grupo) },
    active_subscriptions_count: activeSubs.length,
  };
}

/** Evolução de MRR nos últimos `months` meses, reconstruída via SubscriptionStatusLog (spec 6.8). */
export async function calculateMrrTrend(months = 6): Promise<{ period: string; mrr: number }[]> {
  const now = new Date();
  const points: { period: string; mrr: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const checkpoint = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
    const statusAsOf = await getStatusAsOf(checkpoint);
    const activeIds = Array.from(statusAsOf.entries())
      .filter(([, s]) => s === "active")
      .map(([id]) => id);
    const subs = activeIds.length
      ? await prisma.subscription.findMany({ where: { id: { in: activeIds } }, select: { plan: true } })
      : [];
    const mrr = subs.reduce((sum, s) => sum + PLAN_PRICES[s.plan], 0);
    points.push({
      period: `${checkpoint.getFullYear()}-${String(checkpoint.getMonth() + 1).padStart(2, "0")}`,
      mrr: round2(mrr),
    });
  }
  return points;
}

export type ChurnResult = {
  period: Period;
  customer_churn_pct: number;
  mrr_churn_pct: number;
  canceled_count: number;
};

/**
 * Churn de clientes e de MRR no período (spec 6.5):
 *   customer_churn = cancelados no período / ativos no início do período
 *   mrr_churn      = MRR perdido por cancelamento no período / MRR no início do período
 */
export async function calculateChurn(period: Period): Promise<ChurnResult> {
  const now = new Date();
  const periodStart = periodStartDate(period, now);

  const statusAtStart = await getStatusAsOf(periodStart);
  const activeAtStartIds = Array.from(statusAtStart.entries())
    .filter(([, s]) => s === "active")
    .map(([id]) => id);

  const canceledLogs = await prisma.subscriptionStatusLog.findMany({
    where: { to_status: "canceled", created_at: { gte: periodStart, lte: now } },
    select: { subscription_id: true },
  });
  const canceledIds = Array.from(new Set(canceledLogs.map((l) => l.subscription_id)));

  const [activeAtStartSubs, canceledSubs] = await Promise.all([
    activeAtStartIds.length
      ? prisma.subscription.findMany({ where: { id: { in: activeAtStartIds } }, select: { plan: true } })
      : Promise.resolve([]),
    canceledIds.length
      ? prisma.subscription.findMany({ where: { id: { in: canceledIds } }, select: { plan: true } })
      : Promise.resolve([]),
  ]);

  const mrrAtStart = activeAtStartSubs.reduce((sum, s) => sum + PLAN_PRICES[s.plan], 0);
  const mrrLost = canceledSubs.reduce((sum, s) => sum + PLAN_PRICES[s.plan], 0);

  return {
    period,
    customer_churn_pct: activeAtStartIds.length > 0 ? round2((canceledIds.length / activeAtStartIds.length) * 100) : 0,
    mrr_churn_pct: mrrAtStart > 0 ? round2((mrrLost / mrrAtStart) * 100) : 0,
    canceled_count: canceledIds.length,
  };
}

export type LtvResult = {
  ltv: number | null;
  avg_ticket_mensal: number | null;
  churn_mensal_pct: number | null;
};

/** LTV simplificado (spec 6.6): ticket médio mensal / taxa de churn mensal. */
export async function calculateLTV(): Promise<LtvResult> {
  const mrr = await calculateMRR();
  if (mrr.active_subscriptions_count === 0) {
    return { ltv: null, avg_ticket_mensal: null, churn_mensal_pct: null };
  }
  const avgTicket = mrr.total_mrr / mrr.active_subscriptions_count;
  const churn = await calculateChurn("30d");
  if (churn.customer_churn_pct <= 0) {
    // Sem churn observado ainda: LTV não é calculável (divisão por zero): não é "infinito" de verdade.
    return { ltv: null, avg_ticket_mensal: round2(avgTicket), churn_mensal_pct: 0 };
  }
  const ltv = avgTicket / (churn.customer_churn_pct / 100);
  return { ltv: round2(ltv), avg_ticket_mensal: round2(avgTicket), churn_mensal_pct: churn.customer_churn_pct };
}

export type FunnelResult = {
  period: Period;
  trials_created: number;
  converted_to_paid: number;
  conversion_rate_pct: number;
  avg_days_to_convert: number;
  by_source: { utm_source: string | null; trials_created: number; converted: number; conversion_rate_pct: number }[];
};

const DIRECT_KEY = "__direct__";

/** Funil de conversão trial → pago, com breakdown por UTM source (spec 6.7). */
export async function calculateFunnel(period: Period): Promise<FunnelResult> {
  const now = new Date();
  const periodStart = periodStartDate(period, now);

  const trials = await prisma.tenant.findMany({
    where: { created_at: { gte: periodStart, lte: now } },
    select: { id: true, created_at: true, lead_source_utm_source: true },
  });
  if (trials.length === 0) {
    return { period, trials_created: 0, converted_to_paid: 0, conversion_rate_pct: 0, avg_days_to_convert: 0, by_source: [] };
  }

  const subs = await prisma.subscription.findMany({
    where: { tenant_id: { in: trials.map((t) => t.id) } },
    select: { id: true, tenant_id: true },
  });
  const subByTenant = new Map(subs.map((s) => [s.tenant_id, s.id]));

  const activationLogs = subs.length
    ? await prisma.subscriptionStatusLog.findMany({
        where: { subscription_id: { in: subs.map((s) => s.id) }, to_status: "active" },
        orderBy: { created_at: "asc" },
        select: { subscription_id: true, created_at: true },
      })
    : [];
  const firstActivation = new Map<string, Date>();
  for (const log of activationLogs) {
    if (!firstActivation.has(log.subscription_id)) firstActivation.set(log.subscription_id, log.created_at);
  }

  let converted = 0;
  let totalDaysToConvert = 0;
  const bySource = new Map<string, { trials_created: number; converted: number }>();

  for (const t of trials) {
    const key = t.lead_source_utm_source ?? DIRECT_KEY;
    const bucket = bySource.get(key) ?? { trials_created: 0, converted: 0 };
    bucket.trials_created++;

    const subId = subByTenant.get(t.id);
    const activatedAt = subId ? firstActivation.get(subId) : undefined;
    if (activatedAt) {
      converted++;
      totalDaysToConvert += (activatedAt.getTime() - t.created_at.getTime()) / 86_400_000;
      bucket.converted++;
    }
    bySource.set(key, bucket);
  }

  return {
    period,
    trials_created: trials.length,
    converted_to_paid: converted,
    conversion_rate_pct: round2((converted / trials.length) * 100),
    avg_days_to_convert: converted > 0 ? round2(totalDaysToConvert / converted) : 0,
    by_source: Array.from(bySource.entries()).map(([key, v]) => ({
      utm_source: key === DIRECT_KEY ? null : key,
      trials_created: v.trials_created,
      converted: v.converted,
      conversion_rate_pct: v.trials_created > 0 ? round2((v.converted / v.trials_created) * 100) : 0,
    })),
  };
}
