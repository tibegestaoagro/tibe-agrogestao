import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prismaForTenant, type TenantPrismaClient } from "@/lib/prisma";
import { readBearerToken, resolveSessionUserFromAccessToken } from "@/lib/auth-token";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Resolução do tenant_id e do client Prisma escopado a partir da identidade
 * autenticada. O tenant_id NUNCA vem do client: sempre resolvido no servidor
 * (PRD seção 10.3), tanto pela sessão NextAuth quanto pelo token do aplicativo.
 */

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  tenant_id: string;
  role: AppUserRole;
};

/**
 * Adapter de token (aplicativo). Devolve `null` sempre que não houver um
 * `Authorization: Bearer` válido, deixando o cookie decidir.
 */
async function getBearerSessionUser(): Promise<SessionUser | null> {
  let authorization: string | null = null;
  try {
    authorization = headers().get("authorization");
  } catch (e) {
    // Erros com `digest` são controle de fluxo do Next (ex: DYNAMIC_SERVER_USAGE,
    // que faz uma página cair para render dinâmico): engoli-los mudaria o
    // comportamento de renderização. Só o "fora de request scope" (script,
    // teste, build) é tratado como ausência de token.
    if (typeof (e as { digest?: unknown })?.digest === "string") throw e;
    return null;
  }

  const token = readBearerToken(authorization);
  if (!token) return null;
  return resolveSessionUserFromAccessToken(token);
}

/**
 * Retorna o usuário autenticado, ou null. Este é o ÚNICO ponto do sistema que
 * sabe que existe mais de uma forma de autenticar: `Authorization: Bearer`
 * (aplicativo) primeiro, cookie de sessão NextAuth (painel web) depois. Os
 * dois caminhos devolvem exatamente o mesmo `SessionUser`, e é por isso que as
 * rotas `/api/v1/*` passaram a aceitar o aplicativo sem nenhuma alteração.
 *
 * O token vem primeiro porque um cliente que envia `Authorization` está
 * declarando qual identidade quer usar; cair no cookie nesse caso seria
 * silenciosamente responder por outra pessoa quando os dois estão presentes.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const byToken = await getBearerSessionUser();
  if (byToken) return byToken;

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
