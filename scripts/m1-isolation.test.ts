import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { createTestAnimal , deleteTestTenants } from "./helpers/herd";
import { computeGmd } from "@/lib/livestock";

exigirBancoLocal();


/**
 * Testes do Módulo 1: isolamento dos novos modelos (incl. filhos com tenant_id),
 * unicidade de ear_tag por tenant e cálculo de GMD.
 * Roda: `npm run test:m1`
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
  console.log("🔒 Módulo 1: isolamento, ear_tag e GMD\n");

  const a = await prisma.tenant.create({
    data: { name: "M1 Tenant A", document: "M1A000000001", plan: "fazenda" },
  });
  const b = await prisma.tenant.create({
    data: { name: "M1 Tenant B", document: "M1B000000002", plan: "fazenda" },
  });
  const dbA = prismaForTenant(a.id);
  const dbB = prismaForTenant(b.id);

  try {
    const propA = await dbA.property.create({ data: scoped({ name: "Faz A" }) });
    const animalA = await createTestAnimal(dbA, a.id, { ear_tag: "A001", breed: "Nelore", sex: "male", property_id: propA.id });
    const wlogA = await dbA.animalWeightLog.create({
      data: scoped({ batch_id: animalA.id, weight: 200, measured_at: new Date() }),
    });

    // Isolamento do pai (Animal).
    const bSeesAnimals = await dbB.animalBatch.findMany();
    assert(bSeesAnimals.length === 0, "tenant B não vê animais de A");
    assert(
      (await dbB.animalBatch.findUnique({ where: { id: animalA.id } })) === null,
      "findUnique de B pelo id do animal de A retorna null",
    );

    // Isolamento do FILHO (AnimalWeightLog): novidade do M1.
    const bSeesLogs = await dbB.animalWeightLog.findMany();
    assert(bSeesLogs.length === 0, "tenant B não vê pesagens (filho) de A");
    assert(
      (await dbB.animalWeightLog.findUnique({ where: { id: wlogA.id } })) === null,
      "findUnique de B pelo id da pesagem de A retorna null",
    );
    const delChild = await dbB.animalWeightLog.deleteMany({ where: { id: wlogA.id } });
    assert(delChild.count === 0, "deleteMany de B sobre pesagem de A afeta 0 linhas");

    // Unicidade de ear_tag por tenant.
    let dupRejected = false;
    try {
      await createTestAnimal(dbA, a.id, { ear_tag: "A001", breed: "Angus", sex: "female", property_id: propA.id });
    } catch {
      dupRejected = true;
    }
    assert(dupRejected, "ear_tag duplicado no MESMO tenant é rejeitado");

    // Mesmo ear_tag em OUTRO tenant é permitido.
    const propB = await dbB.property.create({ data: scoped({ name: "Faz B" }) });
    const animalB = await createTestAnimal(dbB, b.id, { ear_tag: "A001", breed: "Nelore", sex: "male", property_id: propB.id });
    assert(!!animalB.id, "mesmo ear_tag em tenant diferente é permitido");

    // GMD entre as duas últimas pesagens.
    const base = new Date("2026-01-01T00:00:00Z");
    const gmd = computeGmd([
      { weight: 200, measured_at: base },
      { weight: 230, measured_at: new Date(base.getTime() + 30 * 86_400_000) },
    ]);
    assert(gmd === 1, `GMD calculado corretamente (30kg/30d = 1 kg/dia) [obtido: ${gmd}]`);
  } finally {
    await deleteTestTenants([a.id, b.id]);
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 1: 0 falhas.");
  else console.error(`❌ Módulo 1: ${failures} falha(s).`);
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
