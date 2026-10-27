import { notFound } from "next/navigation";
import { perRequestCache } from "@/lib/per-request-cache";
import { prismaForTenant } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { getSessionUser, type SessionUser } from "@/lib/tenant-context";

/**
 * Liberação por conta de recursos em rollout (Módulo 39, Q4 da spec). Só a
 * Plataforma liga um recurso (`TenantFeature`); o cliente nunca ativa sozinho.
 * Um recurso aparece para um usuário quando:
 *   1. existe `TenantFeature` habilitada para o tenant;
 *   2. a lista de usuários da feature está vazia (conta inteira) OU o usuário
 *      está nela;
 *   3. para `emporio`, o `TenantProfile` `emporio` do tenant está ativo.
 */
export const FEATURE_KEYS = ["emporio"] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export function isFeatureKey(k: string): k is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(k);
}

/** Memoizado por request; a chave é só de strings. */
export const isFeatureVisibleForUser = perRequestCache(async function isFeatureVisibleForUser(
  tenantId: string,
  userId: string,
  key: FeatureKey,
): Promise<boolean> {
  const db = prismaForTenant(tenantId);
  const feature = await db.tenantFeature.findFirst({
    where: { feature_key: key, enabled: true },
    select: { id: true },
  });
  if (!feature) return false;

  const restritos = await db.tenantFeatureUser.findMany({
    where: { tenant_feature_id: feature.id },
    select: { user_id: true },
  });
  if (restritos.length > 0 && !restritos.some((r) => r.user_id === userId)) return false;

  if (key === "emporio") {
    const perfil = await db.tenantProfile.findFirst({
      where: { profile_type: "emporio", active: true },
      select: { id: true },
    });
    if (!perfil) return false;
  }
  return true;
});

/** `{ error }` com 404 quando o recurso não é visível, como se a rota não existisse. */
export async function requireFeatureApi(
  user: SessionUser,
  key: FeatureKey,
): Promise<{ error: ReturnType<typeof apiError> } | null> {
  if (await isFeatureVisibleForUser(user.tenant_id, user.id, key)) return null;
  return { error: apiError("NOT_FOUND", "Recurso não encontrado", 404) };
}

/** Para páginas: 404 do Next quando o recurso não é visível para a sessão. */
export async function requireFeaturePage(key: FeatureKey): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || !(await isFeatureVisibleForUser(user.tenant_id, user.id, key))) notFound();
  return user;
}
