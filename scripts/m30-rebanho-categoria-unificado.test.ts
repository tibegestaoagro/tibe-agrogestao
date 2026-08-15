import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { deleteTestTenants } from "./helpers/herd";

exigirBancoLocal();


/**
 * Rebanho por categoria: modelo único de lote (2026-08-04).
 *
 * Prova as garantias que a unificação de `Animal` + `AnimalBatch` prometeu,
 * e que não têm como ser verificadas olhando o schema:
 *
 * - lote sem brinco e lote com brinco convivem no MESMO modelo;
 * - o brinco é único por tenant apenas QUANDO PREENCHIDO (índice parcial):
 *   dois lotes sem brinco não podem colidir entre si, senão o produtor que
 *   trabalha por categoria não conseguiria cadastrar o segundo lote;
 *   e o mesmo brinco não pode ser cadastrado duas vezes;
 * - o histórico (peso, vacina, movimentação) pertence ao LOTE, então quem
 *   trabalha por categoria também tem GMD;
 * - o isolamento por tenant continua valendo no modelo novo.
 *
 * Roda: `npm run test:m30`
 */

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log(`  ✅ ${msg}`);
  } else {
    console.error(`  ❌ ${msg}`);
    failures++;
  }
}

async function main() {
  console.log("🐄 Rebanho por categoria: modelo único de lote\n");

  const stamp = Date.now().toString().slice(-9);
  const tenantA = await prisma.tenant.create({
    data: { name: "M30 A", document: `30${stamp}1`, plan: "fazenda" },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "M30 B", document: `30${stamp}2`, plan: "fazenda" },
  });

  try {
    const dbA = prismaForTenant(tenantA.id);
    const dbB = prismaForTenant(tenantB.id);

    const propA = await dbA.property.create({ data: scoped({ name: "Fazenda A" }) });
    const catA = await dbA.animalCategory.create({ data: scoped({ name: "Bezerro" }) });

    // ── lote por categoria, SEM brinco ────────────────────────────────
    const lote = await dbA.animalBatch.create({
      data: scoped({ property_id: propA.id, category_id: catA.id, quantity: 20 }),
    });
    assert(lote.quantity === 20 && lote.ear_tag === null, "lote de 20 cabeças sem brinco é cadastrado");

    // Um SEGUNDO lote sem brinco: é aqui que um índice único comum (não
    // parcial) quebraria, tratando dois NULL como colisão em alguns bancos.
    const lote2 = await dbA.animalBatch.create({
      data: scoped({ property_id: propA.id, category_id: catA.id, quantity: 15 }),
    });
    assert(lote2.id !== lote.id, "um segundo lote sem brinco convive com o primeiro");

    // ── lote de 1 cabeça, COM brinco ──────────────────────────────────
    const comBrinco = await dbA.animalBatch.create({
      data: scoped({
        property_id: propA.id,
        category_id: catA.id,
        quantity: 1,
        ear_tag: `M30-${stamp}`,
        breed: "Nelore",
        sex: "male",
      }),
    });
    assert(comBrinco.ear_tag === `M30-${stamp}`, "lote de 1 cabeça com brinco é cadastrado");

    let duplicouBrinco = false;
    try {
      await dbA.animalBatch.create({
        data: scoped({
          property_id: propA.id,
          category_id: catA.id,
          quantity: 1,
          ear_tag: `M30-${stamp}`,
        }),
      });
      duplicouBrinco = true;
    } catch {
      // esperado: viola o índice único parcial
    }
    assert(!duplicouBrinco, "o mesmo brinco não pode ser cadastrado duas vezes no tenant");

    // O mesmo brinco em OUTRO tenant continua permitido (o índice é por tenant).
    const propB = await dbB.property.create({ data: scoped({ name: "Fazenda B" }) });
    const catB = await dbB.animalCategory.create({ data: scoped({ name: "Bezerro" }) });
    const mesmoBrincoOutroTenant = await dbB.animalBatch.create({
      data: scoped({
        property_id: propB.id,
        category_id: catB.id,
        quantity: 1,
        ear_tag: `M30-${stamp}`,
      }),
    });
    assert(!!mesmoBrincoOutroTenant.id, "o mesmo brinco é permitido em outro tenant");

    // ── histórico pertence ao LOTE, não só a quem tem brinco ──────────
    const vaccine = await dbA.vaccine.create({ data: scoped({ name: "Aftosa" }) });
    await dbA.animalWeightLog.create({
      data: scoped({ batch_id: lote.id, weight: 180, measured_at: new Date("2026-06-01") }),
    });
    await dbA.animalWeightLog.create({
      data: scoped({ batch_id: lote.id, weight: 210, measured_at: new Date("2026-07-01") }),
    });
    await dbA.animalVaccination.create({
      data: scoped({ batch_id: lote.id, vaccine_id: vaccine.id, applied_at: new Date("2026-06-15") }),
    });
    await dbA.animalMovement.create({
      data: scoped({ batch_id: lote.id, movement_type: "purchase", occurred_at: new Date("2026-05-01") }),
    });

    const pesagens = await dbA.animalWeightLog.findMany({
      where: { batch_id: lote.id },
      orderBy: { measured_at: "asc" },
    });
    assert(pesagens.length === 2, "lote SEM brinco acumula histórico de pesagem (2 registros)");

    // O ganho médio diário é a razão de o histórico existir: sem ele, quem
    // trabalha por categoria não saberia se o lote está engordando.
    const dias =
      (pesagens[1].measured_at.getTime() - pesagens[0].measured_at.getTime()) / 86_400_000;
    const gmd = (Number(pesagens[1].weight) - Number(pesagens[0].weight)) / dias;
    assert(Math.abs(gmd - 1) < 0.001, `GMD do lote calculado (30kg/30d = 1 kg/dia, obtido: ${gmd.toFixed(3)})`);

    assert(
      (await dbA.animalVaccination.count({ where: { batch_id: lote.id } })) === 1,
      "lote SEM brinco registra vacinação",
    );
    assert(
      (await dbA.animalMovement.count({ where: { batch_id: lote.id } })) === 1,
      "lote SEM brinco registra movimentação",
    );

    // ── isolamento continua valendo no modelo novo ────────────────────
    assert(
      (await dbB.animalBatch.findUnique({ where: { id: lote.id } })) === null,
      "tenant B não enxerga lote de A",
    );
    assert(
      (await dbB.animalWeightLog.count({ where: { batch_id: lote.id } })) === 0,
      "tenant B não enxerga o histórico de A",
    );

    // ── apagar o lote leva o histórico junto (Cascade) ────────────────
    await dbA.animalBatch.delete({ where: { id: lote.id } });
    assert(
      (await dbA.animalWeightLog.count({ where: { batch_id: lote.id } })) === 0,
      "apagar o lote apaga o histórico dele (onDelete: Cascade)",
    );
  } finally {
    await deleteTestTenants([tenantA.id, tenantB.id]);
  }

  console.log("");
  if (failures === 0) {
    console.log("✅ Rebanho por categoria: 0 falhas.");
  } else {
    console.error(`❌ Rebanho por categoria: ${failures} falha(s).`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (err) => {
    console.error("❌ Erro inesperado:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
