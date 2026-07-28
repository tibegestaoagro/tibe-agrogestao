import { auth } from "@/lib/auth";
import { prismaForTenant, type TenantPrismaClient } from "@/lib/prisma";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Resolução do tenant_id e do client Prisma escopado a partir da sessão NextAuth.
 * O tenant_id NUNCA vem do client: sempre da sessão autenticada no servidor
 * (PRD seção 10.3).
 */

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  tenant_id: string;
  role: AppUserRole;
};

/** Retorna o usuário da sessão atual, ou null se não autenticado. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.tenant_id) return null;
  return session.user as SessionUser;
}

/** Retorna o tenant_id da sessão atual. Lança se não houver sessão válida. */
export async function getCurrentTenantId(): Promise<string> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("Sem sessão autenticada: tenant_id indisponível.");
  }
  return user.tenant_id;
}

/**
 * Retorna o client Prisma escopado ao tenant da sessão atual. Use este client
 * (e nunca o client base) em toda query de negócio de rota autenticada.
 */
export async function getTenantDb(): Promise<TenantPrismaClient> {
  return prismaForTenant(await getCurrentTenantId());
}

export type ProfileType = "fazenda" | "prestador";

/** Tipos de perfil ATIVOS do tenant da sessão (ex: ["fazenda", "prestador"]). */
export async function getActiveProfiles(): Promise<ProfileType[]> {
  const db = await getTenantDb();
  const profiles = await db.tenantProfile.findMany({ where: { active: true } });
  return profiles.map((p) => p.profile_type as ProfileType);
}
