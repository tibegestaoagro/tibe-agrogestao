import { perRequestCache } from "@/lib/per-request-cache";
import { redirect } from "next/navigation";
import { prismaForTenant } from "@/lib/prisma";
import { getTenantRecord } from "@/lib/tenant-record";
import { getActiveProfilesForTenant, type SessionUser, type ProfileType } from "@/lib/tenant-context";
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

/**
 * As 2 queries que toda checagem de gate precisa, sempre juntas.
 *
 * Memoizado por request (ver o aviso sobre `cache()` em tenant-context.ts):
 * o layout do dashboard e a página abaixo dele chamavam o gate de forma
 * independente, repetindo as mesmas 2 queries a cada render. A chave do
 * cache é o par de ids em STRING, não o objeto `SessionUser`: `cache()`
 * compara argumentos por identidade, então dois objetos de usuário
 * equivalentes mas distintos seriam 2 entradas diferentes.
 */
const getSessionGateCoreByIds = perRequestCache(async function getSessionGateCoreByIds(
  userId: string,
  tenantId: string,
): Promise<SessionGateCore> {
  const db = prismaForTenant(tenantId);
  const [dbUser, tenant] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { must_change_password: true } }),
    getTenantRecord(tenantId),
  ]);
  return {
    must_change_password: dbUser?.must_change_password ?? false,
    plan_confirmed: tenant?.plan_confirmed ?? true,
  };
});

export async function getSessionGateCore(user: SessionUser): Promise<SessionGateCore> {
  return getSessionGateCoreByIds(user.id, user.tenant_id);
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

  // Reusa a mesma função memoizada que `getActiveProfiles()` usa por baixo,
  // em vez de repetir a query aqui: antes, este gate e a página abaixo dele
  // buscavam a mesma lista de perfis, cada um pelo seu caminho, a cada
  // render. Passa o tenant que já veio por parâmetro, sem voltar à sessão.
  const active_profiles = await getActiveProfilesForTenant(user.tenant_id);
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
