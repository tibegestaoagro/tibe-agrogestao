import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { createTenantManuallyAction } from "@/lib/actions/platform-tenants";
import { changeOwnPasswordAction } from "@/lib/actions/auth-self";

/**
 * Testes de criação manual de tenant pelo painel (spec 2026-07-24).
 * Roda: `npm run test:m10`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✅ ${msg}`);
  else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

async function main() {
  console.log("🔒 M10 — Criação manual de tenant\n");

  const doc = `M10${Date.now()}`.slice(0, 14);
  const email = `m10-${Date.now()}@teste.local`;

  const result = await createTenantManuallyAction({
    company_name: "M10 Tenant Manual",
    document: doc,
    phone: "22999990000",
    plan: "fazenda",
    owner_name: "Owner M10",
    owner_email: email,
  });
  assert(result.ok, "criação manual funciona");
  if (!result.ok) {
    console.log(failures === 0 ? "\n✅ M10: 0 falhas." : `\n❌ M10: ${failures} falha(s).`);
    process.exit(1);
  }

  assert(!!result.data.temp_password && result.data.temp_password.length >= 8, "devolve senha temporária");

  const tenant = await prisma.tenant.findUnique({ where: { id: result.data.tenant_id } });
  assert(!!tenant && tenant.status === "trial", "tenant nasce em status trial");
  assert(!!tenant?.trial_ends_at, "trial_ends_at preenchido");

  const user = await prisma.user.findUnique({ where: { email } });
  assert(!!user && user.role === "OWNER", "user nasce OWNER");
  assert(user?.must_change_password === true, "user nasce com must_change_password=true");

  const dup = await createTenantManuallyAction({
    company_name: "M10 Duplicado",
    document: doc,
    phone: "22999990001",
    plan: "campo",
    owner_name: "Outro",
    owner_email: `outro-${Date.now()}@teste.local`,
  });
  assert(!dup.ok && dup.code === "DUPLICATE_DOCUMENT", "documento duplicado é rejeitado");

  // ── troca obrigatória de senha ───────────────────────────────
  if (user) {
    const db = prismaForTenant(user.tenant_id);
    const changeResult = await changeOwnPasswordAction(db, user.id, "novaSenha123");
    assert(changeResult.ok, "changeOwnPasswordAction funciona");

    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    assert(updated?.must_change_password === false, "must_change_password vira false após trocar");

    const passwordOk = updated ? await bcrypt.compare("novaSenha123", updated.password_hash) : false;
    assert(passwordOk, "nova senha bate no hash salvo");

    const shortResult = await changeOwnPasswordAction(db, user.id, "curta");
    assert(!shortResult.ok, "senha curta (<8) é rejeitada");
  }

  // limpeza
  if (tenant) await prisma.tenant.delete({ where: { id: tenant.id } }).catch(() => {});

  console.log(failures === 0 ? "\n✅ M10: 0 falhas." : `\n❌ M10: ${failures} falha(s).`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
