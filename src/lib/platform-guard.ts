import { getPlatformSessionUser, isMasterAdmin, type PlatformSessionUser } from "@/lib/platform-context";
import { apiError, ApiErrors } from "@/lib/api";

/**
 * Guarda padrão para rotas /api/platform/* (Módulo 6). Espelha guard()
 * (api-guard.ts), mas para sessão de PlatformUser: sem tenant_id, sem
 * checagem de módulo/perfil/billing (não se aplicam aqui).
 *
 * `requireMasterAdmin: true` restringe a rota a master_admin. Usado em três
 * categorias (decisão de produto, não literal da spec): as ações
 * administrativas (forçar status 6.9, gerenciar equipe 6.10) e os KPIs
 * financeiros (6.4-6.7, mrr-trend): "equipe" vê tenants (6.3) mas não
 * MRR/churn/LTV/funil.
 */
export async function guardPlatform(
  opts?: { requireMasterAdmin?: boolean },
): Promise<{ error: ReturnType<typeof apiError> } | { platformUser: PlatformSessionUser }> {
  const platformUser = await getPlatformSessionUser();
  if (!platformUser) return { error: apiError(...ApiErrors.UNAUTHORIZED) };
  if (opts?.requireMasterAdmin && !isMasterAdmin(platformUser.role)) {
    return { error: apiError(...ApiErrors.FORBIDDEN) };
  }
  return { platformUser };
}
