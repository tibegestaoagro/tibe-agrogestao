import {
  contactTypeSchema,
  getContactResponseSchema,
  getWorkerResponseSchema,
  listContactsResponseSchema,
  listWorkerLogsResponseSchema,
  listWorkersResponseSchema,
  payFrequencySchema,
  workerEntryKindSchema,
  workerLogKindSchema,
  workerStatusSchema,
  workerTypeSchema,
} from "@tibe/contracts";
import { ContactType, PayFrequency, WorkerEntryKind, WorkerLogKind, WorkerStatus, WorkerType } from "@/generated/prisma/enums";
import { assert, nuncaCheias, tenantDaSecao, type SecaoDeContrato } from "../contratos";

/**
 * Contatos (Módulo 31) e mão de obra (Módulo 33) contra as rotas de verdade.
 * Só roda pelo `npm run test:m73`.
 */

async function roda() {
  const { prisma, scoped } = await import("@/lib/prisma");
  const { deleteTestTenants } = await import("../herd");
  const t = await tenantDaSecao("CTWK");
  const { cria, confere, db, tenant, fazenda } = t;

  try {
    const rotas = {
      contacts: await import("@/app/api/v1/contacts/route"),
      contact: await import("@/app/api/v1/contacts/[id]/route"),
      workers: await import("@/app/api/v1/workers/route"),
      worker: await import("@/app/api/v1/workers/[id]/route"),
      logs: await import("@/app/api/v1/workers/[id]/logs/route"),
      payments: await import("@/app/api/v1/workers/[id]/payments/route"),
      negotiations: await import("@/app/api/v1/negotiations/route"),
      products: await import("@/app/api/v1/products/route"),
      jobs: await import("@/app/api/v1/service-jobs/route"),
    };

    console.log("0. Cenário, montado pelas rotas de escrita");
    const contato = await cria("contato", rotas.contacts, "/api/v1/contacts", {
      name: "João da Ponte CTWK",
      type: "fazendeiro",
      phone: "38999990000",
      city: "Unaí",
      notes: "Compra bezerro",
    });
    // O mesmo nome reaproveita o contato (findOrCreateContact): a ficha ganha
    // negociação e serviço sem outro cadastro.
    const categoria = await db.productCategory.create({ data: scoped({ name: "Insumos CTWK" }) });
    const produto = await cria("produto", rotas.products, "/api/v1/products", { name: "Sal CTWK", category_id: categoria.id, unit: "saca" });
    await cria("compra de produto", rotas.negotiations, "/api/v1/negotiations", {
      type: "compra_produto",
      property_id: fazenda.id,
      itens: [{ product_id: produto, quantity: 10 }],
      amount: 1200,
      contact_name: "João da Ponte CTWK",
      pago: true,
    });
    await cria("serviço contratado", rotas.jobs, "/api/v1/service-jobs", {
      property_id: fazenda.id,
      occurred_at: new Date().toISOString(),
      description: "Roçada CTWK",
      pricing: "hora",
      unit_price: 100,
      quantity: 8,
      contact_name: "João da Ponte CTWK",
      pago: true,
    });
    await cria("contato sem tipo", rotas.contacts, "/api/v1/contacts", { name: "Sem tipo CTWK" });

    const vaqueiro = await cria("trabalhador fixo", rotas.workers, "/api/v1/workers", {
      name: "Vaqueiro CTWK",
      role: "Vaqueiro",
      type: "fixo",
      pay_frequency: "mensal",
      pay_amount: 2500,
      pay_day: 5,
      property_id: fazenda.id,
      phone: "38988880000",
      started_at: new Date().toISOString(),
      notes: "Fixo CTWK",
    });
    await cria("trabalhador eventual", rotas.workers, "/api/v1/workers", { name: "Diarista CTWK", role: "Campeiro", type: "eventual" });
    await cria("adiantamento", rotas.payments, `/api/v1/workers/${vaqueiro}/payments`, { kind: "adiantamento", amount: 500 }, { id: vaqueiro });
    await cria("anotação de atividade", rotas.logs, `/api/v1/workers/${vaqueiro}/logs`, {
      kind: "atividade",
      occurred_at: new Date().toISOString(),
      description: "Conserto de cerca",
      property_id: fazenda.id,
    }, { id: vaqueiro });
    await cria("anotação de falta", rotas.logs, `/api/v1/workers/${vaqueiro}/logs`, { kind: "falta", occurred_at: new Date().toISOString() }, { id: vaqueiro });
    // Não há rota que devolva pasto pronto aqui: o pasto nasce direto no banco.
    const pasto = await db.pasture.create({ data: scoped({ name: "Pasto CTWK", area_hectares: 5, property_id: fazenda.id }) });
    await cria("anotação com pasto", rotas.logs, `/api/v1/workers/${vaqueiro}/logs`, {
      kind: "folga",
      occurred_at: new Date().toISOString(),
      pasture_id: pasto.id,
    }, { id: vaqueiro });

    console.log("\n1. Contatos");
    await confere("GET /contacts", rotas.contacts, "/api/v1/contacts", listContactsResponseSchema);
    const detalhes = new Map<string, boolean>();
    await confere("GET /contacts/:id", rotas.contact, `/api/v1/contacts/${contato}`, getContactResponseSchema, { id: contato }, detalhes);
    const detalheVazio = nuncaCheias(detalhes);
    assert(detalheVazio.length === 0, `GET /contacts/:id: toda lista apareceu com item${detalheVazio.length ? ` (nunca: ${detalheVazio.join(", ")})` : ""}`);

    console.log("\n2. Mão de obra");
    await confere("GET /workers", rotas.workers, "/api/v1/workers", listWorkersResponseSchema);
    await confere("GET /workers/:id", rotas.worker, `/api/v1/workers/${vaqueiro}`, getWorkerResponseSchema, { id: vaqueiro });
    await confere("GET /workers/:id/logs", rotas.logs, `/api/v1/workers/${vaqueiro}/logs`, listWorkerLogsResponseSchema, { id: vaqueiro });
  } finally {
    const where = { tenant_id: tenant.id };
    await prisma.workerLog.deleteMany({ where });
    await prisma.worker.deleteMany({ where });
    await prisma.serviceJobCost.deleteMany({ where });
    await prisma.serviceJobLog.deleteMany({ where });
    await prisma.financialEntry.deleteMany({ where });
    await prisma.serviceJob.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.negotiation.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.contact.deleteMany({ where });
    await prisma.pasture.deleteMany({ where });
    await deleteTestTenants([tenant.id]);
  }
}

export const secao: SecaoDeContrato = {
  titulo: "Contatos e mão de obra",
  roda,
  enums: [
    ["ContactType", contactTypeSchema, ContactType],
    ["WorkerType", workerTypeSchema, WorkerType],
    ["WorkerStatus", workerStatusSchema, WorkerStatus],
    ["PayFrequency", payFrequencySchema, PayFrequency],
    ["WorkerEntryKind", workerEntryKindSchema, WorkerEntryKind],
    ["WorkerLogKind", workerLogKindSchema, WorkerLogKind],
  ],
};
