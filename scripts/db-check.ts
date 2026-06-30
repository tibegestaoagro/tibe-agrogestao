import "dotenv/config";
import { prisma } from "@/lib/prisma";

/**
 * Valida a conexão com o banco (PRD/spec task 0.2).
 * Roda: `npm run db:check`
 */
async function main() {
  const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 as ok`;
  if (result?.[0]?.ok !== 1) {
    throw new Error("Resposta inesperada do banco.");
  }
  const tenants = await prisma.tenant.count();
  console.log("✅ Conexão com o banco OK.");
  console.log(`   Tenants cadastrados: ${tenants}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Falha ao conectar no banco:");
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
