import "dotenv/config";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { createLinkedEntry } from "@/lib/financial";
import { decToNum } from "@/lib/serialize";

/**
 * Testes do Módulo 2: isolamento (ServiceClient/Service/ServiceOrder), persistência
 * de total_value e lançamento financeiro 'pending' ao faturar.
 * Roda: `npm run test:m2`
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
  console.log("🔒 Módulo 2 — isolamento, total_value e faturamento\n");

  const a = await prisma.tenant.create({
    data: { name: "M2 A", document: "M2A000000001", plan: "campo" },
  });
  const b = await prisma.tenant.create({
    data: { name: "M2 B", document: "M2B000000002", plan: "campo" },
  });
  const dbA = prismaForTenant(a.id);
  const dbB = prismaForTenant(b.id);

  try {
    const client = await dbA.serviceClient.create({ data: scoped({ name: "Cliente A" }) });
    const service = await dbA.service.create({
      data: scoped({ name: "Pulverização", pricing_type: "hour", unit_price: 10 }),
    });
    // total_value calculado na criação (5h * 10 = 50) e PERSISTIDO.
    const order = await dbA.serviceOrder.create({
      data: scoped({
        service_client_id: client.id,
        service_id: service.id,
        quantity: 5,
        total_value: 5 * 10,
        performed_at: new Date(),
        status: "completed",
      }),
    });
    assert(decToNum(order.total_value) === 50, "total_value por hora calculado (5h × 10 = 50)");

    // Isolamento.
    assert((await dbB.serviceClient.findMany()).length === 0, "B não vê clientes de A");
    assert((await dbB.service.findMany()).length === 0, "B não vê serviços de A");
    assert((await dbB.serviceOrder.findMany()).length === 0, "B não vê ordens de A");
    assert(
      (await dbB.serviceOrder.findUnique({ where: { id: order.id } })) === null,
      "findUnique de B pelo id da ordem de A retorna null",
    );
    const del = await dbB.serviceOrder.deleteMany({ where: { id: order.id } });
    assert(del.count === 0, "deleteMany de B sobre ordem de A afeta 0 linhas");

    // Editar preço do serviço NÃO altera total_value de ordem já registrada.
    await dbA.service.update({ where: { id: service.id }, data: { unit_price: 99 } });
    const orderAfter = await dbA.serviceOrder.findUnique({ where: { id: order.id } });
    assert(
      decToNum(orderAfter?.total_value) === 50,
      "editar preço do serviço não muda total_value de ordem antiga",
    );

    // Faturamento gera FinancialEntry de receita 'pending' (a receber).
    await createLinkedEntry(dbA, {
      entry_type: "income",
      category: "Serviço - Pulverização",
      amount: 50,
      related_module: "servico",
      related_id: order.id,
      occurred_at: new Date(),
      status: "pending",
      due_date: new Date(),
    });
    const entry = await dbA.financialEntry.findFirst({
      where: { related_module: "servico", related_id: order.id },
    });
    assert(
      !!entry && entry.entry_type === "income" && entry.status === "pending" && entry.paid_at === null,
      "faturar cria FinancialEntry receita 'pending' (paid_at null)",
    );

    // Isolamento do lançamento financeiro.
    assert(
      (await dbB.financialEntry.findMany()).length === 0,
      "B não vê lançamentos financeiros de A",
    );
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  }

  console.log("");
  if (failures === 0) console.log("✅ Módulo 2: 0 falhas.");
  else console.error(`❌ Módulo 2: ${failures} falha(s).`);
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
