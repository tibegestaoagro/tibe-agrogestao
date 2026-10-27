import "./_env-local";
import { prisma } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { createTenantWithOwner } from "@/lib/actions/tenants";
import { setTenantFeatureAction } from "@/lib/actions/platform-features";

/**
 * Monta, no banco LOCAL, o cenario da F0 do Meu Empório (Modulo 39) para
 * OLHAR as telas. Nao e suite: e o preparo da validacao ao vivo.
 *
 * Cria uma conta SO de Empório (sem perfil fazenda), como a Plataforma faria
 * pela Q16 da spec, chamando `createTenantWithOwner` direto: o fluxo manual da
 * Plataforma dispara email e WhatsApp de boas-vindas, e isto e so local.
 * A conta do seed NAO e tocada: ligar o recurso nela e o teste do cartao da
 * Plataforma, feito pela tela.
 *
 * Idempotente pelo email do dono.
 */
exigirBancoLocal();

const EMAIL_SO_EMPORIO = "so-emporio@teste.local";

async function main() {
  const owner = await prisma.user.findUnique({ where: { email: "owner@damata.com.br" } });
  if (!owner) throw new Error("O seed nao tem owner@damata.com.br: rode npm run db:seed.");
  const usuarios = await prisma.user.findMany({
    where: { tenant_id: owner.tenant_id },
    select: { email: true, role: true },
  });
  console.log("Conta do seed:", owner.tenant_id);
  console.log("Usuarios dela:", usuarios.map((u) => `${u.email} (${u.role})`).join(", "));

  let dono = await prisma.user.findUnique({ where: { email: EMAIL_SO_EMPORIO } });
  if (!dono) {
    const criado = await createTenantWithOwner({
      company_name: "Empório Só Teste",
      document: "00000000000191",
      phone: "11999990000",
      owner_name: "Dono do Empório",
      owner_email: EMAIL_SO_EMPORIO,
      plan: "campo",
      plan_confirmed: true,
      // Ninguem entra por senha: a sessao vem de `_sessao-local.ts`.
      password: `nao-usada-${Date.now()}`,
      must_change_password: false,
    });
    if (!criado.ok) throw new Error(criado.message);
    dono = await prisma.user.findUnique({ where: { email: EMAIL_SO_EMPORIO } });
  }
  if (!dono) throw new Error("Dono da conta so de Empório nao foi criado.");

  const ligado = await setTenantFeatureAction({
    tenantId: dono.tenant_id,
    key: "emporio",
    enabled: true,
    user_ids: [],
  });
  if (!ligado.ok) throw new Error(ligado.message);

  const perfis = await prisma.tenantProfile.findMany({
    where: { tenant_id: dono.tenant_id },
    select: { profile_type: true, active: true },
  });
  console.log("Conta so de Empório:", dono.tenant_id, EMAIL_SO_EMPORIO);
  console.log("Perfis:", perfis.map((p) => `${p.profile_type}=${p.active}`).join(", "));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
