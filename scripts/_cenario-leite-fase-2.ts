import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { createMilkSite } from "@/lib/actions/milk-sites";
import {
  storeProduction,
  transferToCollectionPoint,
  receiveFromThirdParty,
} from "@/lib/actions/milk-storage";

/**
 * Monta, no banco LOCAL, o cenário do §20 para OLHAR a tela da fase 2.
 *
 * Não é suíte: é o preparo da validação ao vivo. O cenário é o exemplo
 * literal do documento, porque é ele que o cliente vai conferir:
 *
 *   Tanque Principal: próprio 400, João 300, Carlos 250, físico 950
 *   Ponto São José:   600 de leite NOSSO (§17)
 *
 * | tela                     | o que precisa aparecer                        |
 * |--------------------------|-----------------------------------------------|
 * | /leite, armazenamento    | os quatro números do §34, separados            |
 * | /leite, onde o leite está| três donos no mesmo tanque, e o físico 950     |
 * | /leite, retirada         | os três já preenchidos com o saldo de cada um  |
 * | /leite, retirada         | pedir mais do que existe recusa EMBAIXO do campo |
 * | /leite, cobrança         | a receita entrando no Financeiro                |
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
  const tenant_id = tenant.id;
  const db = prismaForTenant(tenant_id);

  await prisma.tenantProfile.upsert({
    where: { tenant_id_profile_type: { tenant_id, profile_type: "fazenda" } },
    update: {},
    create: { tenant_id, profile_type: "fazenda" },
  });

  const property = await prisma.property.findFirst({
    where: { tenant_id },
    orderBy: { name: "asc" },
  });
  if (!property) {
    console.error("Nenhuma propriedade no seed.");
    process.exit(1);
  }

  if ((await db.milkSite.count()) > 0) {
    console.log("Cenario da fase 2 ja montado. Nada a fazer.");
    return;
  }

  const tanque = await createMilkSite(db, {
    name: "Tanque Principal",
    type: "proprio",
    property_id: property.id,
    capacity: 2000,
  });
  const ponto = await createMilkSite(db, {
    name: "Ponto Sao Jose",
    type: "terceiro",
    counterparty_name: "Cooperativa Sao Jose",
    city: "Uberaba",
  });
  if (!tanque.ok || !ponto.ok) {
    console.error("Falha ao cadastrar os locais.");
    process.exit(1);
  }

  const contato = async (name: string) =>
    (await db.contact.findFirst({ where: { name } })) ??
    (await db.contact.create({ data: scoped({ name, type: "fazendeiro" }) }));

  const joao = await contato("Joao da Silva");
  const carlos = await contato("Carlos Pereira");

  // O §17: 800 no tanque, entrega 600, sobram 200.
  await storeProduction(db, { site_id: tanque.data.id, liters: 800 });
  await transferToCollectionPoint(db, {
    from_site_id: tanque.data.id,
    to_site_id: ponto.data.id,
    liters: 600,
  });
  // Mais 200 para o próprio chegar aos 400 do §20.
  await storeProduction(db, { site_id: tanque.data.id, liters: 200 });

  await receiveFromThirdParty(db, {
    site_id: tanque.data.id,
    owner_id: joao.id,
    liters: 300,
  });
  await receiveFromThirdParty(db, {
    site_id: tanque.data.id,
    owner_id: carlos.id,
    liters: 250,
  });

  console.log(`✅ Cenario da fase 2 montado em "${property.name}".`);
  console.log("   Tanque Principal: proprio 400, Joao 300, Carlos 250, fisico 950.");
  console.log("   Ponto Sao Jose: 600 de leite nosso.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
