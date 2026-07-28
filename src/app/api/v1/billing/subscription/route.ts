import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { prisma } from "@/lib/prisma";
import { isoOrNull } from "@/lib/serialize";

/**
 * GET /api/v1/billing/subscription (contrato spec 5.9)
 * Acessível mesmo com a conta bloqueada (skipBillingCheck): é a própria
 * página de regularização que depende disso.
 */
export async function GET() {
  const g = await guard("assinatura", "read", { skipBillingCheck: true });
  if ("error" in g) return g.error;

  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: g.user.tenant_id },
      select: { plan: true, status: true, trial_ends_at: true },
    }),
    g.db.subscription.findFirst({}),
  ]);

  return apiOk({
    plan: subscription?.plan ?? tenant?.plan ?? null,
    status: subscription?.status ?? (tenant?.status === "trial" ? "trial" : null),
    next_due_date: isoOrNull(subscription?.next_due_date ?? null),
    trial_ends_at: isoOrNull(tenant?.trial_ends_at ?? null),
  });
}
