import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardPlatform } from "@/lib/platform-guard";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { isoOrNull } from "@/lib/serialize";
import { createTenantManuallyAction } from "@/lib/actions/platform-tenants";
import { withApi } from "@/lib/route";

/**
 * GET /api/platform/tenants (spec 6.3). "equipe" e "master_admin" têm o
 * mesmo acesso de leitura aqui: só a mudança manual de status (6.9) e a
 * gestão de equipe (6.10) são exclusivas de master_admin.
 *
 * status combina Tenant.status (trial) com Subscription.status (active|
 * overdue|canceled) num único enum, porque é assim que a spec define o
 * filtro: sem assinatura conta como "trial" independente de Tenant.status.
 */
async function GETHandler(request: Request) {
  const g = await guardPlatform();
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const statusFilter = sp.get("status");
  const planFilter = sp.get("plan");
  const q = sp.get("q")?.trim();
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || 20));

  const tenants = await prisma.tenant.findMany({
    where: {
      ...(planFilter ? { plan: planFilter as "campo" | "fazenda" | "grupo" } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { document: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { created_at: "desc" },
    include: {
      profiles: { where: { active: true } },
      subscription: { select: { status: true, next_due_date: true } },
    },
  });

  const mapped = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    document: t.document,
    plan: t.plan,
    status: t.subscription?.status ?? "trial",
    subscription_status: t.subscription?.status ?? null,
    active_profiles: t.profiles.map((p) => p.profile_type),
    created_at: t.created_at.toISOString(),
    next_due_date: isoOrNull(t.subscription?.next_due_date ?? null),
  }));

  const filtered = statusFilter ? mapped.filter((t) => t.status === statusFilter) : mapped;

  const total = filtered.length;
  const start = (page - 1) * limit;
  const data = filtered.slice(start, start + limit);

  return apiOk(data, { total, page, limit });
}

const createSchema = z.object({
  company_name: z.string().trim().min(1),
  document: z.string().trim().min(11),
  phone: z.string().trim().min(8),
  owner_name: z.string().trim().min(1),
  owner_email: z.string().trim().email(),
});

/** POST /api/platform/tenants (spec 2026-07-24): só master_admin. */
async function POSTHandler(request: Request) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const result = await createTenantManuallyAction(parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
