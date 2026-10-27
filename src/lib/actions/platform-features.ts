import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { FEATURE_KEYS, isFeatureKey } from "@/lib/features";

/**
 * Liberação de recursos por conta (Módulo 39, Q4). Ações da PLATAFORMA: o
 * tenant vem do id recebido (rota atrás de `guardPlatform`), e as tabelas
 * escopadas são acessadas por `prismaForTenant(tenantId)`.
 */

export type TenantFeatureView = { feature_key: string; enabled: boolean; user_ids: string[] };

async function tenantExiste(tenantId: string): Promise<boolean> {
  const t = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
  return !!t;
}

export async function listTenantFeaturesAction(
  tenantId: string,
): Promise<ActionResult<TenantFeatureView[]>> {
  if (!(await tenantExiste(tenantId))) return fail("NOT_FOUND", "Conta não encontrada", 404);

  const db = prismaForTenant(tenantId);
  const linhas = await db.tenantFeature.findMany({
    where: { feature_key: { in: [...FEATURE_KEYS] } },
    include: { users: { select: { user_id: true } } },
  });
  return ok(
    FEATURE_KEYS.map((key) => {
      const l = linhas.find((x) => x.feature_key === key);
      return {
        feature_key: key,
        enabled: l?.enabled ?? false,
        user_ids: l ? l.users.map((u) => u.user_id) : [],
      };
    }),
  );
}

export async function setTenantFeatureAction(params: {
  tenantId: string;
  key: string;
  enabled: boolean;
  user_ids?: string[] | null;
  platformUserId?: string | null;
}): Promise<ActionResult<TenantFeatureView>> {
  if (!isFeatureKey(params.key)) return fail("NOT_FOUND", "Recurso não encontrado", 404);
  const key = params.key;
  if (!(await tenantExiste(params.tenantId))) return fail("NOT_FOUND", "Conta não encontrada", 404);

  const db = prismaForTenant(params.tenantId);
  const userIds = [...new Set(params.user_ids ?? [])];

  if (userIds.length > 0) {
    const validos = await db.user.count({ where: { id: { in: userIds } } });
    if (validos !== userIds.length) {
      return fail("VALIDATION_ERROR", "Algum usuário não pertence a esta conta", 422, "user_ids");
    }
  }

  await db.$transaction(async (tx) => {
    const feature = await tx.tenantFeature.upsert({
      where: { tenant_id_feature_key: { tenant_id: params.tenantId, feature_key: key } },
      create: scoped({
        feature_key: key,
        enabled: params.enabled,
        changed_at: new Date(),
        changed_by_platform_user_id: params.platformUserId ?? null,
      }),
      update: {
        enabled: params.enabled,
        changed_at: new Date(),
        changed_by_platform_user_id: params.platformUserId ?? null,
      },
    });

    await tx.tenantFeatureUser.deleteMany({ where: { tenant_feature_id: feature.id } });
    if (userIds.length > 0) {
      await tx.tenantFeatureUser.createMany({
        data: userIds.map((user_id) => scoped({ tenant_feature_id: feature.id, user_id })),
      });
    }

    if (key === "emporio") {
      await tx.tenantProfile.upsert({
        where: { tenant_id_profile_type: { tenant_id: params.tenantId, profile_type: "emporio" } },
        create: scoped({ profile_type: "emporio", active: params.enabled }),
        update: { active: params.enabled },
      });
    }
  });

  return ok({ feature_key: key, enabled: params.enabled, user_ids: userIds });
}
