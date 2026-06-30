import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { provisionDefaultVaccines } from "@/lib/vaccines";

/**
 * Seed inicial (spec task 0.4): tenant Da Mata Sementes + usuário owner.
 * Propositalmente NÃO cria TenantProfile, para que o primeiro login caia no
 * onboarding bifurcado (critério de aceitação do Módulo 0).
 *
 * Roda: `npm run db:seed`
 */

const OWNER_EMAIL = "owner@damata.com.br";
const OWNER_PASSWORD = "tibe123"; // apenas dev — trocar em produção
const TENANT_DOCUMENT = "11222333000181"; // CNPJ placeholder da Da Mata Sementes

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { document: TENANT_DOCUMENT },
    update: {},
    create: {
      name: "Da Mata Sementes LTDA",
      document: TENANT_DOCUMENT,
      email: "contato@damata.com.br",
      phone: "+5566000000000",
      plan: "fazenda",
      status: "active",
    },
  });

  const password_hash = await bcrypt.hash(OWNER_PASSWORD, 10);

  const owner = await prisma.user.upsert({
    where: { email: OWNER_EMAIL },
    update: { tenant_id: tenant.id, role: "OWNER", active: true },
    create: {
      tenant_id: tenant.id,
      name: "Owner Da Mata",
      email: OWNER_EMAIL,
      password_hash,
      role: "OWNER",
    },
  });

  // Vacinas padrão para o tenant Da Mata (idempotente).
  await provisionDefaultVaccines(prismaForTenant(tenant.id));

  console.log("✅ Seed concluído.");
  console.log(`   Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`   Owner:  ${owner.email} / senha: ${OWNER_PASSWORD}`);
  console.log("   Vacinas padrão provisionadas (aftosa, brucelose, raiva, clostridiose)");
  console.log("   (sem TenantProfile → primeiro login cai no onboarding)");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Falha no seed:");
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
