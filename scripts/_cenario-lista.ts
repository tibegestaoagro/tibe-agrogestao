import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";

/**
 * Monta, no banco LOCAL, o cenario da Lista de Compra para OLHAR a tela
 * (Modulo 36, T11). Nao e suite: e o preparo da validacao ao vivo.
 *
 * ⚠️ Escrito como script, e nao por `curl` no terminal: o Git Bash deste
 * ambiente manda JSON com acento em Windows-1252, e "Oleo" chega ao banco com
 * o caractere trocado. O defeito parece da tela e e do teclado.
 *
 * Idempotente pelo prefixo da descricao.
 */
exigirBancoLocal();

const DOCUMENTO = "11222333000181";
const MARCA = "[T11]";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { document: DOCUMENTO } });
  if (!tenant) {
    console.error("❌ Tenant do seed nao encontrado. Rode `npm run db:seed` primeiro.");
    process.exit(1);
  }
  const db = prismaForTenant(tenant.id);

  await db.shoppingItem.deleteMany({});
  console.log("  lista zerada");

  const fazenda = await db.property.findFirst({ where: { archived_at: null } });

  await db.shoppingItem.createMany({
    data: [
      scoped({
        description: `${MARCA} Sal mineral`,
        quantity: 10,
        unit: "saca",
        priority: "urgente",
        place: "Casa Agropecuária",
        property_id: fazenda?.id ?? null,
      }),
      scoped({
        description: `${MARCA} Óleo para o trator`,
        place: "Posto",
      }),
      scoped({
        description: `${MARCA} Vacina contra clostridiose`,
        quantity: 3,
        unit: "frasco",
        priority: "urgente",
        place: "Casa Agropecuária",
      }),
      scoped({
        description: `${MARCA} Arame liso`,
        quantity: 2,
        unit: "rolo",
      }),
    ],
  });

  const total = await db.shoppingItem.count({ where: { status: "pendente" } });
  console.log(`\n✅ Cenario montado: ${total} itens pendentes.`);
  console.log("   Dois com acento, para conferir que a tela nao os quebra.");
  console.log("   Dois locais de compra, mais um item sem local.");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌", e);
  await prisma.$disconnect();
  process.exit(1);
});
