import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { recordMovement } from "@/lib/actions/herd-ledger";
import { openStay } from "@/lib/actions/herd-stays";
import { createConfinementSite, openConfinementStay } from "@/lib/actions/confinement";

/**
 * Monta, no banco LOCAL, o cenario exato dos cinco casos que o juiz mandou
 * abrir no navegador depois da onda 7 do Confinamento. Nao e suite: e o
 * preparo para OLHAR a tela, que e onde os piores defeitos deste projeto
 * apareceram.
 *
 * | tela                        | o que precisa aparecer                        |
 * |-----------------------------|-----------------------------------------------|
 * | /confinamento, entrada      | "Por cabeca/dia" aceito, sem 422 calado       |
 * | /confinamento, entrada      | ORIGEM_AMBIGUA visivel EMBAIXO do campo       |
 * | /confinamento, encerrar     | saida parcial de 15 em 40, restam 25          |
 * | /rebanho                    | "Estadias em aberto", rotulo e painel com campo|
 * | /financeiro                 | cancelar apaga a conta; boitel em Confinamento |
 *
 * Idempotente: pode rodar de novo sem duplicar.
 */
exigirBancoLocal();

const DOCUMENTO = "11222333000181";

/** O saldo fica em DOIS pastos da mesma categoria: e isso que torna a origem ambigua. */
const CATEGORIA_AMBIGUA = "macho_13_24";

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

  const property = await prisma.property.findFirst({ where: { tenant_id }, orderBy: { name: "asc" } });
  if (!property) {
    console.error("Nenhuma propriedade no seed.");
    process.exit(1);
  }

  const pasto = async (name: string) =>
    (await db.pasture.findFirst({ where: { property_id: property.id, name } })) ??
    (await db.pasture.create({
      data: scoped({ property_id: property.id, name, area_hectares: 30 }),
    }));

  const baixada = await pasto("Pasto da Baixada");
  const sede = await pasto("Pasto da Sede");

  // Saldo em DOIS pastos da mesma categoria. Sem os dois, `resolverPastoDeOrigem`
  // resolve sozinho e a recusa que queremos ver nunca acontece.
  const jaTemSaldo = await db.herdMovement.findFirst({
    where: { movement_type: "saldo_inicial", to_pasture_id: baixada.id },
  });
  if (!jaTemSaldo) {
    for (const [p, qtd] of [
      [baixada, 60],
      [sede, 40],
    ] as const) {
      const r = await recordMovement(db, {
        movement_type: "saldo_inicial",
        quantity: qtd,
        to: {
          category_id: CATEGORIA_AMBIGUA,
          property_id: property.id,
          pasture_id: p.id,
          situation: "presente",
          owner: "proprio",
        },
      });
      if (!r.ok) console.error(`saldo de ${p.name}: ${r.code} ${r.message}`);
    }
  }

  const site = async (name: string, type: "proprio" | "boitel") => {
    const existente = await db.confinementSite.findFirst({ where: { name } });
    if (existente) return existente;
    const r = await createConfinementSite(db, {
      name,
      type,
      ...(type === "proprio"
        ? { property_id: property.id }
        : { counterparty_name: "Boa Engorda Confinamentos LTDA", city: "Rio Verde" }),
      capacity: 500,
    });
    if (!r.ok) {
      console.error(`site ${name}: ${r.code} ${r.message}`);
      process.exit(1);
    }
    return r.data;
  };

  const proprio = await site("Confinamento da Sede", "proprio");
  const boitel = await site("Boitel Boa Engorda", "boitel");

  // Lote ABERTO de 40, para o encerramento parcial de 15 (restam 25).
  const loteAberto = await db.herdStay.findFirst({
    where: { confinement_site_id: proprio.id, canceled_at: null },
  });
  if (!loteAberto) {
    const r = await openConfinementStay(db, {
      confinement_site_id: proprio.id,
      category_id: CATEGORIA_AMBIGUA,
      quantity: 40,
      property_id: property.id,
      pasture_id: baixada.id,
      charge_type: "por_cabeca_dia",
      charge_value: 12,
    });
    if (!r.ok) console.error(`lote de 40: ${r.code} ${r.message}`);
  }

  // Estadia de BOITEL com cobranca: e a conta dela que precisa aparecer sob
  // "Confinamento" no filtro do Financeiro, e sumir ao cancelar.
  const loteBoitel = await db.herdStay.findFirst({
    where: { confinement_site_id: boitel.id, canceled_at: null },
  });
  if (!loteBoitel) {
    const r = await openStay(db, {
      type: "boitel",
      property_id: property.id,
      category_id: CATEGORIA_AMBIGUA,
      pasture_id: sede.id,
      quantity: 10,
      counterparty_name: "Boa Engorda Confinamentos LTDA",
      confinement_site_id: boitel.id,
      charge_type: "fechado",
      charge_value: 12000,
    });
    if (!r.ok) console.error(`estadia de boitel: ${r.code} ${r.message}`);
  }

  const contas = await db.financialEntry.count({ where: { related_module: "confinamento" } });
  console.log("Cenario pronto.");
  console.log(`  fazenda: ${property.name}`);
  console.log(`  pastos com saldo de ${CATEGORIA_AMBIGUA}: ${baixada.name} (60), ${sede.name} (40)`);
  console.log(`  confinamento proprio: ${proprio.name} | boitel: ${boitel.name}`);
  console.log(`  lancamentos no modulo Confinamento: ${contas}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
