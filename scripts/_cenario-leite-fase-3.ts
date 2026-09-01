import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { storeProduction, withdrawFromSite } from "@/lib/actions/milk-storage";

/**
 * Monta, no banco LOCAL, o cenário do §28 para OLHAR a tela da fase 3.
 *
 * Depende do cenário da fase 2 já estar montado (`_cenario-leite-fase-2.ts`),
 * porque é ele que cria o tanque.
 *
 * | tela                        | o que precisa aparecer                        |
 * |-----------------------------|-----------------------------------------------|
 * | /leite, "Entregue e ainda não cobrado" | Laticínio Boa Vida com 1.380 L em 3 entregas |
 * | /leite, "Registrar venda"   | o total calculado ao vivo pelo §25            |
 * | /leite, "Fechar período"    | o período pré-preenchido e o total previsto   |
 *
 * Idempotente: pode rodar de novo sem duplicar.
 */
exigirBancoLocal();

const DOCUMENTO = "11222333000181";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { document: DOCUMENTO } });
  if (!tenant) {
    console.error("Tenant do seed nao encontrado. Rode `npm run db:seed` primeiro.");
    process.exit(1);
  }
  const db = prismaForTenant(tenant.id);

  const tanque = await db.milkSite.findFirst({ where: { type: "proprio" } });
  if (!tanque) {
    console.error("Sem tanque. Rode `scripts/_cenario-leite-fase-2.ts` primeiro.");
    process.exit(1);
  }

  const laticinio =
    (await db.contact.findFirst({ where: { name: "Laticinio Boa Vida" } })) ??
    (await db.contact.create({
      data: scoped({ name: "Laticinio Boa Vida", type: "laticinio", city: "Uberaba" }),
    }));

  const jaTem = await db.milkMovement.count({ where: { buyer_id: laticinio.id } });
  if (jaTem > 0) {
    console.log("Cenario da fase 3 ja montado. Nada a fazer.");
    return;
  }

  // Leite para vender e para entregar.
  await storeProduction(db, { site_id: tanque.id, liters: 3000 });

  // As três entregas do §28, em dias diferentes, somando os 1.380 L do exemplo.
  const hoje = new Date();
  for (const [diasAtras, litros] of [
    [3, 450],
    [2, 470],
    [1, 460],
  ] as const) {
    const quando = new Date(hoje);
    quando.setDate(quando.getDate() - diasAtras);
    quando.setHours(12, 0, 0, 0);
    await withdrawFromSite(db, {
      site_id: tanque.id,
      destination: "laticinio",
      itens: [{ owner_id: null, liters: litros }],
      occurred_at: quando,
      buyer_id: laticinio.id,
    });
  }

  console.log("✅ Cenario da fase 3 montado.");
  console.log("   3.000 L guardados no tanque.");
  console.log("   Tres entregas para o Laticinio Boa Vida, somando 1.380 L em aberto.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
