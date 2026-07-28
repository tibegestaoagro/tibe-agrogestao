import { platformAuth } from "@/lib/platform-auth";
import type { PlatformSessionRole } from "@/types/next-auth";

/**
 * Resolução da sessão de PlatformUser (Módulo 6): nunca carrega tenant_id,
 * nunca passa pelo client Prisma escopado. Espelha tenant-context.ts, mas
 * para o lado da plataforma.
 */

export type PlatformSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: PlatformSessionRole;
};

/** Retorna o PlatformUser da sessão atual, ou null se não autenticado. */
export async function getPlatformSessionUser(): Promise<PlatformSessionUser | null> {
  const session = await platformAuth();
  if (!session?.user?.platform_user_id) return null;
  return {
    id: session.user.platform_user_id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.platform_role as PlatformSessionRole,
  };
}

/** True se a role for master_admin (única com acesso a ações administrativas). */
export function isMasterAdmin(role: PlatformSessionRole): boolean {
  return role === "MASTER_ADMIN";
}
