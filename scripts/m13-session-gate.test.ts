import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import {
  getSessionGateCore,
  requireSessionGateApi,
  requireSessionGateForPage,
  redirectIfGatePassed,
} from "@/lib/session-gate";
import type { SessionUser } from "@/lib/tenant-context";

exigirBancoLocal();


/**
 * Testes do seam de gate de sessão (arquitetura 2026-07-29, candidato #3 do
 * relatório: must_change_password -> plan_confirmed -> perfil ativo, antes
 * duplicado em api-guard.ts, o layout do dashboard e as 3 páginas standalone
 * trocar-senha/escolher-plano/onboarding). Roda: `npm run test:m13`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

/** redirect() do Next lança um Error com .digest = "NEXT_REDIRECT;push;<url>;...". */
async function captureRedirect(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2] ?? null;
    }
    throw e;
  }
}

async function main() {
  console.log("🔒 M13: Seam do gate de sessão (session-gate.ts)\n");

  const tenant = await prisma.tenant.create({
    data: {
      name: "M13 Tenant",
      document: `M13${Date.now()}`.slice(0, 14),
      plan: "fazenda",
      plan_confirmed: false,
    },
  });
  const dbUser = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "M13 User",
      email: `m13-${Date.now()}@teste.local`,
      password_hash: "x",
      role: "OWNER",
      must_change_password: true,
    },
  });
  const user: SessionUser = {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    tenant_id: tenant.id,
    role: "OWNER",
  };

  try {
    // ── Estado 1: must_change_password=true (plan_confirmed=false, irrelevante aqui) ──
    let core = await getSessionGateCore(user);
    assert(core.must_change_password === true, "core: must_change_password=true no estado 1");

    let gate = await requireSessionGateApi(user);
    assert(
      gate !== null && (await gate.error.json()).error.code === "MUST_CHANGE_PASSWORD",
      "requireSessionGateApi: MUST_CHANGE_PASSWORD no estado 1",
    );

    let dest = await captureRedirect(() => requireSessionGateForPage(user));
    assert(dest === "/trocar-senha", "requireSessionGateForPage: redireciona /trocar-senha no estado 1");

    dest = await captureRedirect(() => redirectIfGatePassed(user, "must_change_password"));
    assert(dest === null, "redirectIfGatePassed(must_change_password): renderiza a própria página no estado 1");

    dest = await captureRedirect(() => redirectIfGatePassed(user, "plan_confirmed"));
    assert(dest === "/trocar-senha", "redirectIfGatePassed(plan_confirmed): redireciona /trocar-senha no estado 1");

    dest = await captureRedirect(() => redirectIfGatePassed(user, "profile"));
    assert(dest === "/trocar-senha", "redirectIfGatePassed(profile): redireciona /trocar-senha no estado 1");

    // ── Estado 2: must_change_password=false, plan_confirmed=false ──
    await prisma.user.update({ where: { id: user.id }, data: { must_change_password: false } });

    core = await getSessionGateCore(user);
    assert(
      core.must_change_password === false && core.plan_confirmed === false,
      "core: must_change_password=false, plan_confirmed=false no estado 2",
    );

    gate = await requireSessionGateApi(user);
    assert(
      gate !== null && (await gate.error.json()).error.code === "PLAN_NOT_CONFIRMED",
      "requireSessionGateApi: PLAN_NOT_CONFIRMED no estado 2",
    );

    dest = await captureRedirect(() => requireSessionGateForPage(user));
    assert(dest === "/escolher-plano", "requireSessionGateForPage: redireciona /escolher-plano no estado 2");

    dest = await captureRedirect(() => redirectIfGatePassed(user, "must_change_password"));
    assert(dest === "/dashboard", "redirectIfGatePassed(must_change_password): já resolvido, manda /dashboard no estado 2");

    dest = await captureRedirect(() => redirectIfGatePassed(user, "plan_confirmed"));
    assert(dest === null, "redirectIfGatePassed(plan_confirmed): renderiza a própria página no estado 2");

    dest = await captureRedirect(() => redirectIfGatePassed(user, "profile"));
    assert(dest === "/escolher-plano", "redirectIfGatePassed(profile): redireciona /escolher-plano no estado 2");

    // ── Estado 3: must_change_password=false, plan_confirmed=true, sem perfil ativo ──
    await prisma.tenant.update({ where: { id: tenant.id }, data: { plan_confirmed: true } });

    core = await getSessionGateCore(user);
    assert(
      core.must_change_password === false && core.plan_confirmed === true,
      "core: must_change_password=false, plan_confirmed=true no estado 3",
    );

    gate = await requireSessionGateApi(user);
    assert(gate === null, "requireSessionGateApi: passa (null) no estado 3");

    dest = await captureRedirect(() => requireSessionGateForPage(user));
    assert(dest === "/onboarding", "requireSessionGateForPage: redireciona /onboarding sem perfil ativo (estado 3)");

    dest = await captureRedirect(() => redirectIfGatePassed(user, "must_change_password"));
    assert(dest === "/dashboard", "redirectIfGatePassed(must_change_password): já resolvido no estado 3");

    dest = await captureRedirect(() => redirectIfGatePassed(user, "plan_confirmed"));
    assert(dest === "/dashboard", "redirectIfGatePassed(plan_confirmed): já resolvido no estado 3");

    dest = await captureRedirect(() => redirectIfGatePassed(user, "profile"));
    assert(dest === null, "redirectIfGatePassed(profile): renderiza onboarding no estado 3 (sem perfil ainda)");

    // ── Estado 4: tudo resolvido, com 1 perfil ativo ──
    const scopedDb = prismaForTenant(tenant.id);
    await scopedDb.tenantProfile.create({ data: scoped({ profile_type: "fazenda", active: true }) });

    const page = await requireSessionGateForPage(user);
    assert(
      page.active_profiles.length === 1 && page.active_profiles[0] === "fazenda",
      "requireSessionGateForPage: devolve perfis ativos sem redirecionar no estado 4",
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  }

  console.log(failures === 0 ? "\n✅ M13: 0 falhas." : `\n❌ M13: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
