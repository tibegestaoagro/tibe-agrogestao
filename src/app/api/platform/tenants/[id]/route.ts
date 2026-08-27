import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardPlatform } from "@/lib/platform-guard";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { isoOrNull } from "@/lib/serialize";
import { updateTenantAction } from "@/lib/actions/platform-tenants";
import { withApi } from "@/lib/route";

/**
 * GET /api/platform/tenants/:id (spec 6.3): detalhe completo: cadastro,
 * histórico de assinatura (via SubscriptionStatusLog) e resumo de uso
 * conforme os perfis ativos. Lookup cross-tenant legítimo (client base,
 * tenant_id explícito): a exceção que dá nome a este módulo inteiro.
 */
async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guardPlatform();
  if ("error" in g) return g.error;

  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    include: {
      profiles: true,
      subscription: {
        include: { status_logs: { orderBy: { created_at: "desc" } } },
      },
    },
  });
  if (!tenant) return apiError(...ApiErrors.NOT_FOUND);

  const activeProfiles = tenant.profiles.filter((p) => p.active).map((p) => p.profile_type);
  const hasFazenda = activeProfiles.includes("fazenda");
  const hasPrestador = activeProfiles.includes("prestador");

  const [animalsCount, plotsCount, ordersCount] = await Promise.all([
    hasFazenda
      ? prisma.animalBatch
          // Soma CABEÇAS, não lotes: um lote vale `quantity` cabeças.
          .aggregate({ where: { tenant_id: tenant.id }, _sum: { quantity: true } })
          .then((a) => a._sum.quantity ?? 0)
      : Promise.resolve(0),
    hasFazenda ? prisma.plot.count({ where: { tenant_id: tenant.id } }) : Promise.resolve(0),
    hasPrestador ? prisma.serviceOrder.count({ where: { tenant_id: tenant.id } }) : Promise.resolve(0),
  ]);

  return apiOk({
    id: tenant.id,
    name: tenant.name,
    document: tenant.document,
    phone: tenant.phone,
    email: tenant.email,
    plan: tenant.plan,
    plan_confirmed: tenant.plan_confirmed,
    archived_at: isoOrNull(tenant.archived_at),
    status: tenant.subscription?.status ?? "trial",
    trial_ends_at: isoOrNull(tenant.trial_ends_at),
    active_profiles: activeProfiles,
    created_at: tenant.created_at.toISOString(),
    lead_source: {
      utm_source: tenant.lead_source_utm_source,
      utm_medium: tenant.lead_source_utm_medium,
      utm_campaign: tenant.lead_source_utm_campaign,
    },
    subscription: tenant.subscription
      ? {
          status: tenant.subscription.status,
          plan: tenant.subscription.plan,
          next_due_date: isoOrNull(tenant.subscription.next_due_date),
          history: tenant.subscription.status_logs.map((l) => ({
            from_status: l.from_status,
            to_status: l.to_status,
            changed_by_platform_user_id: l.changed_by_platform_user_id,
            reason: l.reason,
            created_at: l.created_at.toISOString(),
          })),
        }
      : null,
    usage: { animals: animalsCount, plots: plotsCount, service_orders: ordersCount },
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  document: z.string().trim().min(11).optional(),
  phone: z.string().trim().nullish(),
  email: z.string().trim().email().nullish(),
  plan: z.enum(["campo", "fazenda", "grupo"]).optional(),
});

/** PATCH /api/platform/tenants/:id (spec 2026-07-27): edita dados cadastrais e plano, só master_admin. */
async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await updateTenantAction(params.id, parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
