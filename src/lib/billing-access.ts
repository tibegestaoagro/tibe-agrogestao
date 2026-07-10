import { prisma } from "@/lib/prisma";

/**
 * Controle de acesso por inadimplência (spec 5.7/5.8), 3 estágios — mesma
 * regra para assinatura em atraso e para trial vencido sem assinatura:
 *
 *   dias em atraso < 5   → acesso total
 *   5 <= dias < 15        → leitura liberada, escrita bloqueada
 *   dias >= 15             → bloqueio total (só a página de assinatura)
 */

export type BillingAccess = "full" | "read_only" | "blocked";

/** Duração do trial self-service (spec 5.11), usada por /api/v1/signup ao criar o Tenant. */
export const TRIAL_DAYS = 14;

const READ_ONLY_AFTER_DAYS = 5;
const BLOCKED_AFTER_DAYS = 15; // 5 + 10, conforme definido com o usuário

function daysSince(date: Date): number {
  return (Date.now() - date.getTime()) / 86_400_000;
}

function tierFromDaysOverdue(days: number): BillingAccess {
  if (days < READ_ONLY_AFTER_DAYS) return "full";
  if (days < BLOCKED_AFTER_DAYS) return "read_only";
  return "blocked";
}

export async function getBillingAccess(tenantId: string): Promise<BillingAccess> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, trial_ends_at: true },
  });
  if (!tenant) return "blocked";

  const subscription = await prisma.subscription.findUnique({
    where: { tenant_id: tenantId },
    select: { status: true, next_due_date: true, created_at: true },
  });

  if (subscription) {
    if (subscription.status === "active") return "full";
    if (subscription.status === "canceled") return "blocked";
    // overdue
    const since = subscription.next_due_date ?? subscription.created_at;
    return tierFromDaysOverdue(daysSince(since));
  }

  // Sem assinatura: regra de trial.
  if (tenant.status === "trial" && tenant.trial_ends_at) {
    if (Date.now() < tenant.trial_ends_at.getTime()) return "full"; // trial ainda vigente
    return tierFromDaysOverdue(daysSince(tenant.trial_ends_at));
  }

  // Sem assinatura e sem trial rastreado (ex: tenant seedado manualmente) — não bloqueia.
  return "full";
}

/** Rotas que continuam acessíveis mesmo com acesso "blocked" (regularização). */
export const BILLING_EXEMPT_PATH_PREFIXES = [
  "/configuracoes/assinatura",
  "/api/v1/billing",
  "/api/webhooks/asaas",
];

export function isBillingExemptPath(pathname: string): boolean {
  return BILLING_EXEMPT_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}
