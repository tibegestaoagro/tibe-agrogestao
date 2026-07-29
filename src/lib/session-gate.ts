import { redirect } from "next/navigation";
import { prisma, prismaForTenant } from "@/lib/prisma";
import type { SessionUser, ProfileType } from "@/lib/tenant-context";
import { apiError } from "@/lib/api";

/**
 * Seam único do gate de sessão (must_change_password -> plan_confirmed ->
 * perfil ativo), antes reimplementado de forma independente em 5 lugares
 * (api-guard.ts, o layout do dashboard e as 3 páginas standalone abaixo
 * dele na cadeia). `billing_access` fica de fora de propósito: guard() e o
 * layout do dashboard tratam billing com políticas genuinamente diferentes
 * (escrita bloqueada em read_only só na API; só `blocked` redireciona
 * página, com exceção de path), então continuam chamando
 * `getBillingAccess()` diretamente, como sempre fizeram.
 */

export type SessionGateCore = {
  must_change_password: boolean;
  plan_confirmed: boolean;
};

/** As 2 queries que toda checagem de gate precisa, sempre juntas. */
export async function getSessionGateCore(user: SessionUser): Promise<SessionGateCore> {
  const db = prismaForTenant(user.tenant_id);
  const [dbUser, tenant] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { must_change_password: true } }),
    prisma.tenant.findUnique({ where: { id: user.tenant_id }, select: { plan_confirmed: true } }),
  ]);
  return {
    must_change_password: dbUser?.must_change_password ?? false,
    plan_confirmed: tenant?.plan_confirmed ?? true,
  };
}

/** Usado por guard() (api-guard.ts): mesmo gate, no formato de erro de API. */
export async function requireSessionGateApi(
  user: SessionUser,
): Promise<{ error: ReturnType<typeof apiError> } | null> {
  const core = await getSessionGateCore(user);
  if (core.must_change_password) {
    return {
      error: apiError(
        "MUST_CHANGE_PASSWORD",
        "Troque sua senha temporária antes de continuar (acesse /trocar-senha).",
        403,
      ),
    };
  }
  if (!core.plan_confirmed) {
    return {
      error: apiError(
        "PLAN_NOT_CONFIRMED",
        "Escolha seu plano antes de continuar (acesse /escolher-plano).",
        403,
      ),
    };
  }
  return null;
}

/**
 * Usado pelo layout do dashboard: percorre toda a cadeia (inclusive perfil
 * ativo, que só esse caller e `onboarding` precisam) e redireciona no
 * primeiro gate não resolvido. Devolve os perfis ativos pro layout montar a
 * navegação, quando chega ao fim sem redirecionar.
 */
export async function requireSessionGateForPage(
  user: SessionUser,
): Promise<{ active_profiles: ProfileType[] }> {
  const core = await getSessionGateCore(user);
  if (core.must_change_password) redirect("/trocar-senha");
  if (!core.plan_confirmed) redirect("/escolher-plano");

  const db = prismaForTenant(user.tenant_id);
  const profiles = await db.tenantProfile.findMany({ where: { active: true } });
  const active_profiles = profiles.map((p) => p.profile_type as ProfileType);
  if (active_profiles.length === 0) redirect("/onboarding");

  return { active_profiles };
}

/**
 * Usado pelas 3 páginas standalone (trocar-senha, escolher-plano,
 * onboarding), cada uma no estágio da cadeia que ela representa. Redireciona
 * pra trás se um gate anterior ainda não foi resolvido; redireciona pra
 * /dashboard se o gate do próprio estágio já foi resolvido (não faz sentido
 * mais renderizar essa página); senão devolve o estado e deixa a página
 * renderizar.
 *
 * `stage: "profile"` (só onboarding) não tem checagem de "já resolvido"
 * aqui dentro (perfil não faz parte do core, spec 3): a função só garante
 * que os 2 gates anteriores foram passados, e quem chama decide sozinho o
 * que fazer com o próprio perfil.
 */
export async function redirectIfGatePassed(
  user: SessionUser,
  stage: "must_change_password" | "plan_confirmed" | "profile",
): Promise<SessionGateCore> {
  const core = await getSessionGateCore(user);

  if (core.must_change_password) {
    if (stage === "must_change_password") return core;
    redirect("/trocar-senha");
  } else if (stage === "must_change_password") {
    redirect("/dashboard");
  }

  if (!core.plan_confirmed) {
    if (stage === "plan_confirmed") return core;
    redirect("/escolher-plano");
  } else if (stage === "plan_confirmed") {
    redirect("/dashboard");
  }

  return core;
}
