import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { createMilkGroup } from "@/lib/actions/milk-groups";
import { recordLactationEntry } from "@/lib/actions/milk-lactation";
import { recordMilkProduction } from "@/lib/actions/milk-production";

/**
 * Monta, no banco LOCAL, o cenário da Área Leite para OLHAR a tela.
 *
 * Não é suíte: é o preparo da validação ao vivo, que é onde os piores defeitos
 * deste projeto apareceram, todos com `tsc`, `lint` e suíte limpos.
 *
 * | tela            | o que precisa aparecer                                    |
 * |-----------------|-----------------------------------------------------------|
 * | /leite          | vacas, litros de hoje e média por vaca, com número        |
 * | /leite          | as seis janelas do §11, com média por vaca por período    |
 * | /leite, produção| "as duas formas juntas" recusado EMBAIXO do campo         |
 * | /leite, lactação| secar mais do que existe, recusa EMBAIXO de "quantidade"  |
 * | /leite          | registro cancelado visível na lista, marcado              |
 *
 * A segunda fazenda ("Sítio Sem Contagem") existe para o caso do traço: ela
 * tem produção e NENHUMA contagem de vacas, então a média precisa aparecer
 * como traço, nunca como zero.
 *
 * Idempotente: pode rodar de novo sem duplicar.
 */
exigirBancoLocal();

const DOCUMENTO = "11222333000181";

/** Dias relativos a hoje, para o cenário não envelhecer. */
function diasAtras(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}

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

  const jaTem = await db.milkProduction.count({ where: { property_id: property.id } });
  if (jaTem > 0) {
    console.log("Cenario do leite ja montado. Nada a fazer.");
    return;
  }

  await createMilkGroup(db, { property_id: property.id, name: "Recem-paridas" });
  await createMilkGroup(db, { property_id: property.id, name: "Vacas de maior producao" });

  // Sete dias de produção, com o rebanho leiteiro CRESCENDO no meio: é o caso
  // que separa a média honesta (litros por vaca/dia) da média ingênua.
  await recordLactationEntry(db, {
    property_id: property.id,
    type: "definir",
    quantity: 30,
    recorded_at: diasAtras(6),
  });

  for (let i = 6; i >= 3; i--) {
    await recordMilkProduction(db, {
      property_id: property.id,
      recorded_at: diasAtras(i),
      dia: 450 + i * 5,
    });
  }

  await recordLactationEntry(db, {
    property_id: property.id,
    type: "entrada",
    quantity: 6,
    recorded_at: diasAtras(2),
  });

  for (let i = 2; i >= 1; i--) {
    await recordMilkProduction(db, {
      property_id: property.id,
      recorded_at: diasAtras(i),
      manha: 320,
      tarde: 210,
    });
  }

  await recordLactationEntry(db, {
    property_id: property.id,
    type: "saida",
    quantity: 4,
    recorded_at: diasAtras(0),
  });

  await recordMilkProduction(db, {
    property_id: property.id,
    recorded_at: diasAtras(0),
    manha: 300,
    tarde: 180,
  });

  // Um registro cancelado, para a lista mostrar o marcado.
  const cancelavel = await recordMilkProduction(db, {
    property_id: property.id,
    recorded_at: diasAtras(0),
    noite: 90,
  });
  if (cancelavel.ok) {
    await db.milkProduction.update({
      where: { id: cancelavel.data[0].id },
      data: { cancelled_at: new Date() },
    });
  }

  // A fazenda sem contagem nenhuma: a média por vaca precisa virar traço.
  const semContagem =
    (await db.property.findFirst({ where: { name: "Sitio Sem Contagem" } })) ??
    (await db.property.create({ data: scoped({ name: "Sitio Sem Contagem" }) }));
  await recordMilkProduction(db, {
    property_id: semContagem.id,
    recorded_at: diasAtras(0),
    dia: 120,
  });

  const contagem = await db.lactationEntry.count({ where: { property_id: property.id } });
  const producoes = await db.milkProduction.count({ where: { property_id: property.id } });
  console.log(`✅ Cenario do leite montado em "${property.name}".`);
  console.log(`   ${contagem} registros de lactacao, ${producoes} de producao.`);
  console.log(`   Fazenda sem contagem: "${semContagem.name}" (media precisa virar traco).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
