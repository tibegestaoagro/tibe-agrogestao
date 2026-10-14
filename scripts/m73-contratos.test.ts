import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";
import type { z } from "zod";
import { assert, clienteDaApi, falhas, nuncaCheias, type SecaoDeContrato } from "./helpers/contratos";

exigirBancoLocal();

/**
 * Os contratos de `packages/contracts` contra o servidor de verdade.
 * Roda: `npm run test:m73`
 *
 * Monta um tenant próprio PELAS ROTAS DE ESCRITA, com o token do aplicativo,
 * e depois lê cada rota GET coberta pelo pacote. Três provas por resposta:
 *
 * 1. passa no schema;
 * 2. tem exatamente as chaves que o schema declara, em toda a profundidade:
 *    os contratos são `z.object` não estritos (o aplicativo não pode quebrar
 *    quando o servidor ganha um campo), então só o `safeParse` deixaria passar
 *    um campo novo que o pacote não descreve;
 * 3. toda lista, inclusive aninhada, aparece com item ao menos uma vez entre
 *    as respostas daquela rota: um `[]` passa em qualquer schema e não
 *    provaria os campos do item. (Por rota, e não por resposta: a venda de
 *    gado não tem produto e a compra de produto não tem cabeça, e as duas
 *    são o mesmo contrato.)
 *
 * E uma prova à parte: cada enumeração do pacote tem exatamente os valores do
 * enum do Prisma. É a forma de falha que já aconteceu: os contratos ficaram em
 * 5 tipos de alerta com o banco em 8, e um alerta de manutenção quebrava a
 * lista inteira no aplicativo.
 *
 * Limite conhecido: campo que o cenário nunca devolve nulo não prova o
 * `.nullable()` do contrato, nem para mais nem para menos.
 *
 * Mesmo truque da m23: o AsyncLocalStorage precisa existir antes do Next
 * carregar, então o resto é importado dentro de `main()`.
 */
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

async function main() {
  console.log("📜 M73: contratos do pacote contra as rotas reais (todos os domínios de /api/v1 que o pacote cobre)\n");

  const bcrypt = (await import("bcryptjs")).default;
  const c = await import("@tibe/contracts");
  const E = await import("@/generated/prisma/enums");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { signAccessToken } = await import("@/lib/auth-token");
  const { createTestAnimal, registrarNoLivro, deleteTestTenants } = await import("./helpers/herd");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M73 ${stamp}`, document: `M73${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const user = await prisma.user.create({
    data: {
      tenant_id: tenant.id,
      name: "M73 Dono",
      email: `m73-${stamp}@teste.local`,
      password_hash: await bcrypt.hash("SenhaForte#2026", 4),
      role: "OWNER",
    },
  });
  const db = prismaForTenant(tenant.id);
  await db.tenantProfile.create({ data: scoped({ profile_type: "fazenda", active: true }) });
  await db.tenantProfile.create({ data: scoped({ profile_type: "prestador", active: true }) });
  const token = signAccessToken(user.id);

  const { cria, confere } = await clienteDaApi(token);

  const rotas = {
    animals: await import("@/app/api/v1/animals/route"),
    animal: await import("@/app/api/v1/animals/[id]/route"),
    categories: await import("@/app/api/v1/animal-categories/route"),
    pastures: await import("@/app/api/v1/pastures/route"),
    positions: await import("@/app/api/v1/herd/positions/route"),
    movements: await import("@/app/api/v1/herd/movements/route"),
    stays: await import("@/app/api/v1/herd/stays/route"),
    plots: await import("@/app/api/v1/plots/route"),
    plot: await import("@/app/api/v1/plots/[id]/route"),
    cycles: await import("@/app/api/v1/plots/[id]/cycles/route"),
    inputs: await import("@/app/api/v1/cycles/[id]/inputs/route"),
    summary: await import("@/app/api/v1/cycles/[id]/summary/route"),
    clients: await import("@/app/api/v1/service-clients/route"),
    clientSummary: await import("@/app/api/v1/service-clients/[id]/summary/route"),
    services: await import("@/app/api/v1/services/route"),
    orders: await import("@/app/api/v1/service-orders/route"),
    jobs: await import("@/app/api/v1/service-jobs/route"),
    job: await import("@/app/api/v1/service-jobs/[id]/route"),
    jobCosts: await import("@/app/api/v1/service-jobs/[id]/costs/route"),
    negotiations: await import("@/app/api/v1/negotiations/route"),
    negotiation: await import("@/app/api/v1/negotiations/[id]/route"),
    machines: await import("@/app/api/v1/machines/route"),
    machine: await import("@/app/api/v1/machines/[id]/route"),
    maintenances: await import("@/app/api/v1/machines/[id]/maintenances/route"),
  };

  try {
    console.log("0. Cenário, montado pelas rotas de escrita");
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M73", area_hectares: 100 }) });
    const categoria = await cria("categoria", rotas.categories, "/api/v1/animal-categories", { name: "Nelore M73" });
    await cria("pasto", rotas.pastures, "/api/v1/pastures", { name: "Pasto M73", area_hectares: 20, property_id: fazenda.id });
    const lote = await createTestAnimal(db, tenant.id, { ear_tag: "M73-001", property_id: fazenda.id, category_id: categoria, sex: "female" });
    await db.animalVaccination.create({
      data: scoped({ batch_id: lote.id, vaccine_id: (await db.vaccine.create({ data: scoped({ name: "Aftosa M73" }) })).id, applied_at: new Date() }),
    });
    await registrarNoLivro(db, { property_id: fazenda.id, quantity: 50, category_id: "femea_36_mais" });
    await cria("estadia", rotas.stays, "/api/v1/herd/stays", {
      type: "boitel",
      property_id: fazenda.id,
      category_id: "femea_36_mais",
      quantity: 5,
      counterparty_name: "Boitel M73",
      charge_type: "fechado",
      charge_value: 900,
    });
    await cria("venda de gado", rotas.negotiations, "/api/v1/negotiations", {
      type: "venda_gado",
      property_id: fazenda.id,
      itens: [{ category_id: "femea_36_mais", quantity: 5 }],
      amount: 15000,
      contact_name: "Comprador M73",
      pago: false,
      due_date: new Date(Date.now() + 30 * 86400000).toISOString(),
      custos: [{ descricao: "Frete", amount: 300 }],
    });
    const categoriaProduto = await db.productCategory.create({ data: scoped({ name: "Insumos M73" }) });
    const produto = await cria("produto", await import("@/app/api/v1/products/route"), "/api/v1/products", {
      name: "Sal mineral M73",
      category_id: categoriaProduto.id,
      unit: "saca",
    });
    await cria("compra de produto", rotas.negotiations, "/api/v1/negotiations", {
      type: "compra_produto",
      property_id: fazenda.id,
      itens: [{ product_id: produto, quantity: 10 }],
      amount: 1200,
      contact_name: "Fornecedor M73",
      pago: true,
    });
    const talhao = await cria("talhão", rotas.plots, "/api/v1/plots", { name: "Talhão M73", area_hectares: 30, property_id: fazenda.id });
    const ciclo = await cria("ciclo", rotas.cycles, `/api/v1/plots/${talhao}/cycles`, { crop_name: "Soja", planted_at: new Date().toISOString() }, { id: talhao });
    await cria("insumo", rotas.inputs, `/api/v1/cycles/${ciclo}/inputs`, { input_type: "seed", name: "Semente M73", quantity: 10, unit: "sc", cost: 500 }, { id: ciclo });
    const cliente = await cria("cliente", rotas.clients, "/api/v1/service-clients", { name: "Cliente M73", phone: "31999990000" });
    const servico = await cria("serviço do catálogo", rotas.services, "/api/v1/services", { name: "Gradagem M73", pricing_type: "hour", unit_price: 200 });
    await cria("ordem de serviço", rotas.orders, "/api/v1/service-orders", {
      service_client_id: cliente,
      service_id: servico,
      quantity: 3,
      performed_at: new Date().toISOString(),
    });
    const job = await cria("serviço contratado", rotas.jobs, "/api/v1/service-jobs", {
      property_id: fazenda.id,
      occurred_at: new Date().toISOString(),
      description: "Roçada M73",
      pricing: "hora",
      unit_price: 100,
      quantity: 8,
      contact_name: "Prestador M73",
      pago: true,
    });
    await cria("custo do serviço", rotas.jobCosts, `/api/v1/service-jobs/${job}/costs`, { kind: "pedagio", description: "Pedágio da BR", amount: 120 }, { id: job });
    await cria("diário do serviço", await import("@/app/api/v1/service-jobs/[id]/logs/route"), `/api/v1/service-jobs/${job}/logs`, { quantity: 2, notes: "Primeiro dia" }, { id: job });
    const maquina = await cria("máquina", rotas.machines, "/api/v1/machines", { property_id: fazenda.id, name: "Trator M73", type: "trator", hour_meter: 10 });
    await cria("manutenção", rotas.maintenances, `/api/v1/machines/${maquina}/maintenances`, { description: "Troca de óleo", cost: 350 }, { id: maquina });

    console.log("\n1. Rebanho");
    const animais = await confere("GET /animals", rotas.animals, "/api/v1/animals", c.listAnimalsResponseSchema);
    const animalId = animais?.data[0]?.id ?? "";
    await confere("GET /animals/:id", rotas.animal, `/api/v1/animals/${animalId}`, c.getAnimalResponseSchema, { id: animalId });
    await confere("GET /pastures", rotas.pastures, `/api/v1/pastures?property_id=${fazenda.id}`, c.listPasturesResponseSchema);
    await confere("GET /animal-categories", rotas.categories, "/api/v1/animal-categories", c.listAnimalCategoriesResponseSchema);
    await confere("GET /herd/positions", rotas.positions, "/api/v1/herd/positions", c.listHerdPositionsResponseSchema);
    await confere("GET /herd/movements", rotas.movements, "/api/v1/herd/movements", c.listHerdMovementsResponseSchema);
    await confere("GET /herd/stays", rotas.stays, "/api/v1/herd/stays", c.listHerdStaysResponseSchema);

    console.log("\n2. Lavoura");
    await confere("GET /plots", rotas.plots, "/api/v1/plots", c.listPlotsResponseSchema);
    await confere("GET /plots/:id", rotas.plot, `/api/v1/plots/${talhao}`, c.getPlotResponseSchema, { id: talhao });
    await confere("GET /plots/:id/cycles", rotas.cycles, `/api/v1/plots/${talhao}/cycles`, c.listPlotCyclesResponseSchema, { id: talhao });
    await confere("GET /cycles/:id/inputs", rotas.inputs, `/api/v1/cycles/${ciclo}/inputs`, c.listCycleInputsResponseSchema, { id: ciclo });
    await confere("GET /cycles/:id/summary", rotas.summary, `/api/v1/cycles/${ciclo}/summary`, c.getCycleSummaryResponseSchema, { id: ciclo });

    console.log("\n3. Serviços");
    await confere("GET /service-clients", rotas.clients, "/api/v1/service-clients", c.listServiceClientsResponseSchema);
    await confere("GET /service-clients/:id/summary", rotas.clientSummary, `/api/v1/service-clients/${cliente}/summary`, c.serviceClientSummaryResponseSchema, { id: cliente });
    await confere("GET /services", rotas.services, "/api/v1/services", c.listServicesResponseSchema);
    await confere("GET /service-orders", rotas.orders, "/api/v1/service-orders", c.listServiceOrdersResponseSchema);
    await confere("GET /service-jobs", rotas.jobs, "/api/v1/service-jobs", c.listServiceJobsResponseSchema);
    await confere("GET /service-jobs/:id", rotas.job, `/api/v1/service-jobs/${job}`, c.serviceJobDetailResponseSchema, { id: job });
    await confere("GET /service-jobs/:id/costs", rotas.jobCosts, `/api/v1/service-jobs/${job}/costs`, c.serviceCostsResponseSchema, { id: job });

    console.log("\n4. Negociações");
    const negocios = await confere("GET /negotiations", rotas.negotiations, "/api/v1/negotiations", c.listNegotiationsResponseSchema);
    const detalhes = new Map<string, boolean>();
    for (const n of negocios?.data ?? []) {
      await confere(`GET /negotiations/:id (${n.type})`, rotas.negotiation, `/api/v1/negotiations/${n.id}`, c.getNegotiationResponseSchema, { id: n.id }, detalhes);
    }
    const detalheVazio = nuncaCheias(detalhes);
    assert(detalheVazio.length === 0, `GET /negotiations/:id: toda lista apareceu com item${detalheVazio.length ? ` (nunca: ${detalheVazio.join(", ")})` : ""}`);

    console.log("\n5. Máquinas");
    await confere("GET /machines", rotas.machines, "/api/v1/machines", c.listMachinesResponseSchema);
    await confere("GET /machines/:id", rotas.machine, `/api/v1/machines/${maquina}`, c.getMachineResponseSchema, { id: maquina });
  } finally {
    // Ordem das chaves estrangeiras com `onDelete: Restrict`: o que aponta
    // para fazenda, contato e lote sai antes deles.
    const where = { tenant_id: tenant.id };
    await prisma.serviceJobCost.deleteMany({ where });
    await prisma.serviceJobLog.deleteMany({ where });
    await prisma.financialEntry.deleteMany({ where });
    await prisma.serviceJob.deleteMany({ where });
    await prisma.stockMovement.deleteMany({ where });
    await prisma.product.deleteMany({ where });
    await prisma.serviceOrder.deleteMany({ where });
    await prisma.herdMovement.deleteMany({ where });
    await prisma.herdStay.deleteMany({ where });
    await prisma.negotiation.deleteMany({ where });
    await prisma.contact.deleteMany({ where });
    await prisma.machineMaintenance.deleteMany({ where });
    await prisma.machine.deleteMany({ where });
    await prisma.plotInput.deleteMany({ where });
    await prisma.cropCycle.deleteMany({ where });
    await prisma.plot.deleteMany({ where });
    await prisma.pasture.deleteMany({ where });
    await deleteTestTenants([tenant.id]);
  }

  // Desde a dívida 4.1 (14/10/2026), cada domínio novo tem a sua seção, com
  // tenant e limpeza próprios, em `scripts/helpers/contratos/`: todo arquivo
  // da pasta entra sozinho. `-- --so <arquivo>` roda uma seção só (além das
  // de cima, que são do mesmo arquivo).
  const { readdirSync } = await import("node:fs");
  const pasta = new URL("./helpers/contratos/", import.meta.url);
  const so = process.argv.includes("--so") ? process.argv[process.argv.indexOf("--so") + 1] : null;
  const secoes: SecaoDeContrato[] = [];
  for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith(".ts")).sort()) {
    if (so && arquivo !== `${so}.ts`) continue;
    secoes.push(((await import(new URL(arquivo, pasta).href)) as { secao: SecaoDeContrato }).secao);
  }
  for (const [i, secao] of secoes.entries()) {
    console.log(`\n${6 + i}. ${secao.titulo}`);
    await secao.roda();
  }

  console.log("\nPor último: cada enum do pacote tem exatamente os valores do Prisma");
  const pares: [string, z.ZodEnum, Record<string, string>][] = [
    ...secoes.flatMap((s) => s.enums),
    ["MachineStatus", c.machineStatusSchema, E.MachineStatus],
    ["AnimalSex", c.animalSexSchema, E.AnimalSex],
    ["HerdSituation", c.herdSituationSchema, E.HerdSituation],
    ["HerdOwner", c.herdOwnerSchema, E.HerdOwner],
    ["HerdMovementType", c.herdMovementTypeSchema, E.HerdMovementType],
    ["HerdStayType", c.herdStayTypeSchema, E.HerdStayType],
    ["HerdChargeType", c.herdChargeTypeSchema, E.HerdChargeType],
    ["CropCycleStatus", c.cropCycleStatusSchema, E.CropCycleStatus],
    ["InputType", c.inputTypeSchema, E.InputType],
    ["PricingType", c.pricingTypeSchema, E.PricingType],
    ["ServiceOrderStatus", c.serviceOrderStatusSchema, E.ServiceOrderStatus],
    ["ServiceDirection", c.serviceDirectionSchema, E.ServiceDirection],
    ["ServicePricing", c.servicePricingSchema, E.ServicePricing],
    ["ServiceJobStatus", c.serviceJobStatusSchema, E.ServiceJobStatus],
    ["ServiceCostKind", c.serviceCostKindSchema, E.ServiceCostKind],
    ["NegotiationType", c.negotiationTypeSchema, E.NegotiationType],
    ["NegotiationEntryRole", c.negotiationEntryRoleSchema, E.NegotiationEntryRole],
    ["UserRole", c.userRoleSchema, E.UserRole],
    ["EntryType", c.entryTypeSchema, E.EntryType],
    ["RelatedModule", c.relatedModuleSchema, E.RelatedModule],
    ["FinancialEntryStatus", c.financialEntryStatusSchema, E.FinancialEntryStatus],
    ["AlertType", c.alertTypeSchema, E.AlertType],
    ["AlertStatus", c.alertStatusSchema, E.AlertStatus],
    ["PasswordResetChannel", c.passwordResetChannelSchema, E.PasswordResetChannel],
    ["TenantPlan", c.tenantPlanSchema, E.TenantPlan],
  ];
  for (const [nome, contrato, prismaEnum] of pares) {
    const doContrato = contrato.options.map(String).sort();
    const doBanco = Object.values(prismaEnum).sort();
    const falta = doBanco.filter((v) => !doContrato.includes(v));
    const sobra = doContrato.filter((v) => !doBanco.includes(v));
    assert(
      falta.length === 0 && sobra.length === 0,
      `${nome}${falta.length ? `: falta ${falta.join(", ")}` : ""}${sobra.length ? `: sobra ${sobra.join(", ")}` : ""}`,
    );
  }

  await prisma.$disconnect();
  console.log(falhas() === 0 ? "\n✅ M73 passou." : `\n❌ M73: ${falhas()} falha(s).`);
  process.exit(falhas() === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
