import "dotenv/config";
import { randomUUID } from "node:crypto";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { exigirBancoLocal } from "./_banco-local";
import { provisionDefaultAnimalCategories } from "@/lib/actions/animal-categories";
import { provisionDefaultVaccines } from "@/lib/vaccines";
import { listFinancialCategoriesAction } from "@/lib/actions/financial-categories";
import { generateAlertsForTenant } from "@/lib/actions/alerts";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Escreve tenants de demonstracao: nunca contra producao.
 *
 * Este arquivo tinha a PROPRIA copia da regra (`assertLocalDatabase`), que
 * aceitava qualquer URL contendo "55432" ou "tibe_dev" e ensinava a sintaxe do
 * PowerShell. A mesma regra em dois lugares e o padrao que este modulo vem
 * combatendo, e a copia daqui era a mais fraca das duas. Ver `_banco-local.ts`.
 */
exigirBancoLocal();

/**
 * Popula o tenant Da Mata Sementes (dev) com ~2 anos de histórico simulado
 * (rebanho, financeiro, máquinas, lavoura, prestador, Meu Dia), pra validar
 * o novo layout (docs/design/briefing-novo-layout.md) contra uma tela com
 * dado de verdade, não zeros. Roda: `npm run seed:demo`.
 *
 * Escreve direto pelo client BASE (`prisma`) com `tenant_id` explícito, não
 * pelo client escopado: mesmo padrão já usado em scripts/*.test.ts para
 * fixture de teste (ver CLAUDE.md, seção de isolamento). Idempotente: apaga
 * e recria o próprio histórico de demonstração a cada execução.
 */

const TENANT_DOCUMENT = "11222333000181";

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number, decimals = 2) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}
function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
/** ~80% na primeira propriedade, o resto dividido entre as demais. */
function pickPropertyId(propertyIds: string[]): string {
  if (propertyIds.length === 1 || Math.random() < 0.8) return propertyIds[0];
  return pick(propertyIds.slice(1));
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 86_400_000);
}

const BREEDS = ["Nelore", "Angus", "Brahman", "Girolando", "Senepol"] as const;

// entry_type/related_module conventions abaixo espelham exatamente o que
// createLinkedEntry (src/lib/financial.ts) produz nas actions reais
// (animals.ts, machines.ts, animal-batches.ts, service-orders status route):
// mesmo nome de categoria, mesmo mapeamento due_date/paid_at por status.
function linkedEntry(input: {
  entry_type: "income" | "expense";
  category: string;
  amount: number;
  related_module: "rebanho" | "lavoura" | "servico" | "maquinas" | "geral";
  related_id: string;
  occurred_at: Date;
  status?: "pending" | "paid";
  due_date?: Date;
}): Prisma.FinancialEntryCreateManyInput {
  const status = input.status ?? "paid";
  return {
    id: randomUUID(),
    tenant_id: TENANT_ID,
    entry_type: input.entry_type,
    category: input.category,
    amount: input.amount,
    related_module: input.related_module,
    related_id: input.related_id,
    due_date: input.due_date ?? input.occurred_at,
    paid_at: status === "paid" ? input.occurred_at : null,
    status,
    created_at: input.occurred_at,
  };
}

let TENANT_ID = "";

/**
 * ⚠️ A ORDEM aqui e dependencia, nao gosto: `Property` sai por ultimo porque
 * quase tudo aponta para ela.
 *
 * As quatro tabelas do livro-razao (Modulo 30) e de negociacoes (Modulo 31)
 * foram acrescentadas em 2026-08-29, depois que o seed parou de rodar neste
 * ambiente. `HerdMovement` e `HerdStay` apontam para `Property` com
 * `onDelete: Restrict`, de proposito (o comentario no schema explica: "sairam
 * 20 da Fazenda A" perde o sentido se a origem virar nula). Como a limpeza
 * nao as conhecia, `property.deleteMany` batia em chave estrangeira e o seed
 * morria antes de criar qualquer coisa. Efeito colateral: `test:herd` passou
 * a falhar por falta de fixture, dizendo "nenhum tenant com animais".
 *
 * `ConfinementSite` (Modulo 30 fase 3) entrou em 2026-08-31, pelo mesmo
 * motivo: tambem aponta para `Property` com `Restrict`. `Pasture` (Modulo 29)
 * ja existia com o mesmo `Restrict` e nunca tinha entrado nesta lista; nao
 * quebrava porque o seed nunca criou uma linha dela, mas o buraco era o
 * mesmo: bastaria uma `Pasture` do tenant demo criada por fora (uso do app)
 * para o `property.deleteMany` morrer em silencio de novo.
 *
 * Tabela nova que referencie `Property` precisa entrar nesta lista.
 */
async function wipeDemoData() {
  const tenant_id = TENANT_ID;
  await prisma.herdMovement.deleteMany({ where: { tenant_id } });
  await prisma.herdStay.deleteMany({ where: { tenant_id } });
  await prisma.stockMovement.deleteMany({ where: { tenant_id } });
  await prisma.negotiation.deleteMany({ where: { tenant_id } });
  await prisma.animalWeightLog.deleteMany({ where: { tenant_id } });
  await prisma.animalVaccination.deleteMany({ where: { tenant_id } });
  await prisma.animalMovement.deleteMany({ where: { tenant_id } });
  await prisma.animalBatch.deleteMany({ where: { tenant_id } });
  await prisma.animalBatch.deleteMany({ where: { tenant_id } });
  await prisma.machineMaintenance.deleteMany({ where: { tenant_id } });
  await prisma.machine.deleteMany({ where: { tenant_id } });
  await prisma.plotInput.deleteMany({ where: { tenant_id } });
  await prisma.cropCycle.deleteMany({ where: { tenant_id } });
  await prisma.plot.deleteMany({ where: { tenant_id } });
  await prisma.serviceOrder.deleteMany({ where: { tenant_id } });
  await prisma.service.deleteMany({ where: { tenant_id } });
  await prisma.serviceClient.deleteMany({ where: { tenant_id } });
  await prisma.alert.deleteMany({ where: { tenant_id } });
  await prisma.task.deleteMany({ where: { tenant_id } });
  await prisma.financialEntry.deleteMany({ where: { tenant_id } });
  await prisma.confinementSite.deleteMany({ where: { tenant_id } });
  await prisma.pasture.deleteMany({ where: { tenant_id } });
  await prisma.property.deleteMany({ where: { tenant_id } });
}

async function seedAnimals(propertyIds: string[], categoryByName: Map<string, string>) {
  type Def = { category: string; sex: "male" | "female"; weightRange: [number, number]; ageMonths: [number, number] };
  const DEFS: Def[] = [
    { category: "Bezerro", sex: "male", weightRange: [60, 180], ageMonths: [0, 11] },
    { category: "Bezerra", sex: "female", weightRange: [55, 170], ageMonths: [0, 11] },
    { category: "Garrote", sex: "male", weightRange: [180, 320], ageMonths: [12, 29] },
    { category: "Novilha", sex: "female", weightRange: [180, 340], ageMonths: [12, 34] },
    { category: "Vaca", sex: "female", weightRange: [380, 520], ageMonths: [30, 100] },
    { category: "Boi", sex: "male", weightRange: [400, 560], ageMonths: [24, 48] },
    { category: "Touro", sex: "male", weightRange: [550, 780], ageMonths: [36, 96] },
  ];
  // Pesos de distribuição (soma não precisa ser 1: só proporção relativa).
  const WEIGHTS: Record<string, number> = {
    Vaca: 32, Bezerro: 14, Bezerra: 13, Garrote: 13, Novilha: 13, Boi: 11, Touro: 4,
  };
  const pool: Def[] = [];
  for (const d of DEFS) for (let i = 0; i < WEIGHTS[d.category]; i++) pool.push(d);

  const TOTAL = 260;
  const animals: Prisma.AnimalBatchCreateManyInput[] = [];
  const movements: Prisma.AnimalMovementCreateManyInput[] = [];
  const entries: Prisma.FinancialEntryCreateManyInput[] = [];
  const weightLogs: Prisma.AnimalWeightLogCreateManyInput[] = [];
  const vaccinations: Prisma.AnimalVaccinationCreateManyInput[] = [];

  const vaccines = await prisma.vaccine.findMany({ where: { tenant_id: TENANT_ID } });

  let tagSeq = 1;
  for (let i = 0; i < TOTAL; i++) {
    const def = pick(pool);
    const id = randomUUID();
    const ageMonths = randInt(def.ageMonths[0], def.ageMonths[1]);
    const birth_date = daysAgo(ageMonths * 30 + randInt(0, 29));
    // Distribuição enviesada pra recente: herd crescendo ao longo dos 2 anos.
    const daysSinceRegistered = Math.floor(730 * Math.pow(Math.random(), 1.6));
    const created_at = daysAgo(daysSinceRegistered);
    const weight = randFloat(def.weightRange[0], def.weightRange[1], 1);

    let status: "active" | "sold" | "deceased" = "active";

    // Modelo único (2026-08-04): cada animal identificado é um lote de 1
    // cabeça. `quantity` cai para 0 quando ele sai por venda ou morte (o
    // antigo `status`), mais abaixo.
    animals.push({
      id,
      tenant_id: TENANT_ID,
      property_id: pickPropertyId(propertyIds),
      category_id: categoryByName.get(def.category)!,
      quantity: 1,
      ear_tag: `BV-${String(tagSeq++).padStart(4, "0")}`,
      breed: pick(BREEDS),
      sex: def.sex,
      birth_date,
      average_weight: weight,
      acquired_at: created_at,
      created_at,
    });

    // ~11% vendidos (mais provável em Boi/Garrote/Touro), ~2% mortos.
    const sellable = (def.category === "Boi" || def.category === "Garrote" || def.category === "Touro") ? 0.22 : 0.06;
    const roll = Math.random();
    if (daysSinceRegistered > 45 && roll < sellable) {
      status = "sold";
      const soldDaysAgo = randInt(0, Math.max(daysSinceRegistered - 20, 1));
      const occurred_at = daysAgo(soldDaysAgo);
      const value = Math.round(weight * randFloat(7, 11));
      movements.push({
        id: randomUUID(),
        tenant_id: TENANT_ID,
        batch_id: id,
        movement_type: "sale",
        occurred_at,
        value,
      });
      entries.push(
        linkedEntry({
          entry_type: "income",
          category: "Venda de animal",
          amount: value,
          related_module: "rebanho",
          related_id: id,
          occurred_at,
        }),
      );
    } else if (daysSinceRegistered > 30 && roll > 0.97) {
      status = "deceased";
      const occurred_at = daysAgo(randInt(0, Math.max(daysSinceRegistered - 5, 1)));
      movements.push({
        id: randomUUID(),
        tenant_id: TENANT_ID,
        batch_id: id,
        movement_type: "death",
        occurred_at,
      });
    }
    // Sem `status` no modelo único: saiu por venda ou morte = 0 cabeças.
    if (status !== "active") animals[animals.length - 1].quantity = 0;

    // Pesagens (só ativos, ~45% dos animais, 1-3 registros).
    if (status === "active" && Math.random() < 0.45) {
      const n = randInt(1, 3);
      for (let w = 0; w < n; w++) {
        const measured_at = daysAgo(randInt(5, Math.min(daysSinceRegistered, 700)));
        weightLogs.push({
          id: randomUUID(),
          tenant_id: TENANT_ID,
          batch_id: id,
          weight: randFloat(def.weightRange[0], def.weightRange[1], 1),
          measured_at,
        });
      }
    }

    // Vacinações (70% dos ativos, 1-2 registros; alguns com next_due_at próximo).
    if (status === "active" && vaccines.length > 0 && Math.random() < 0.7) {
      const n = randInt(1, 2);
      for (let v = 0; v < n; v++) {
        const vaccine = pick(vaccines);
        const applied_at = daysAgo(randInt(10, 400));
        const intervalDays = vaccine.default_interval_days ?? 365;
        let next_due_at = new Date(applied_at.getTime() + intervalDays * 86_400_000);
        // ~15% ficam com o próximo reforço nos próximos 20 dias, pra alimentar
        // o card "Próxima vacina" e o alerta vaccine_due.
        if (Math.random() < 0.15) next_due_at = daysFromNow(randInt(1, 20));
        vaccinations.push({
          id: randomUUID(),
          tenant_id: TENANT_ID,
          batch_id: id,
          vaccine_id: vaccine.id,
          applied_at,
          next_due_at,
          cost: Math.random() < 0.4 ? randFloat(15, 60) : null,
        });
        if (vaccinations[vaccinations.length - 1].cost) {
          entries.push(
            linkedEntry({
              entry_type: "expense",
              category: `Vacinação - ${vaccine.name}`,
              amount: Number(vaccinations[vaccinations.length - 1].cost),
              related_module: "rebanho",
              related_id: id,
              occurred_at: applied_at,
            }),
          );
        }
      }
    }
  }

  await prisma.animalBatch.createMany({ data: animals });
  if (movements.length) await prisma.animalMovement.createMany({ data: movements });
  if (weightLogs.length) await prisma.animalWeightLog.createMany({ data: weightLogs });
  if (vaccinations.length) await prisma.animalVaccination.createMany({ data: vaccinations });

  // Um punhado de lotes (Módulo 25), pra não deixar a visão "por categoria" vazia.
  const batches: Prisma.AnimalBatchCreateManyInput[] = [
    { category: "Bezerro", qty: 18, acquiredDaysAgo: 40 },
    { category: "Novilha", qty: 12, acquiredDaysAgo: 210 },
    { category: "Boi", qty: 8, acquiredDaysAgo: 15 },
  ].map((b) => ({
    id: randomUUID(),
    tenant_id: TENANT_ID,
    property_id: propertyIds[0],
    category_id: categoryByName.get(b.category)!,
    quantity: b.qty,
    average_weight: randFloat(120, 420, 1),
    acquisition_cost: randFloat(1800, 3200, 2) * b.qty,
    acquired_at: daysAgo(b.acquiredDaysAgo),
    created_at: daysAgo(b.acquiredDaysAgo),
  }));
  await prisma.animalBatch.createMany({ data: batches });
  for (const b of batches) {
    entries.push(
      linkedEntry({
        entry_type: "expense",
        category: "Compra de lote",
        amount: Number(b.acquisition_cost),
        related_module: "rebanho",
        related_id: b.id!,
        occurred_at: b.acquired_at as Date,
      }),
    );
  }

  return entries;
}

async function seedMachines(propertyIds: string[]) {
  const defs = [
    { name: "Trator New Holland TL75", type: "trator", brand: "New Holland", model: "TL75", year: 2019, cost: 180000, maintDays: 10, status: "active" as const },
    { name: "Caminhonete Toyota Hilux", type: "veiculo", brand: "Toyota", model: "Hilux", year: 2021, cost: 220000, maintDays: 42, status: "active" as const },
    { name: "Roçadeira Costal Stihl", type: "implemento", brand: "Stihl", model: "FS220", year: 2022, cost: 3200, maintDays: 55, status: "active" as const },
    { name: "Ordenhadeira Mecânica", type: "equipamento", brand: "DeLaval", model: null, year: 2018, cost: 45000, maintDays: 4, status: "maintenance" as const },
    { name: "Pulverizador Jacto Uniport", type: "implemento", brand: "Jacto", model: "Uniport 2530", year: 2020, cost: 95000, maintDays: 25, status: "active" as const },
  ];

  const machines: Prisma.MachineCreateManyInput[] = [];
  const maintenances: Prisma.MachineMaintenanceCreateManyInput[] = [];
  const entries: Prisma.FinancialEntryCreateManyInput[] = [];

  for (const d of defs) {
    const id = randomUUID();
    const acquired_at = daysAgo(randInt(400, 1000));
    machines.push({
      id,
      tenant_id: TENANT_ID,
      property_id: pickPropertyId(propertyIds),
      name: d.name,
      type: d.type,
      brand: d.brand,
      model: d.model,
      year: d.year,
      acquired_at,
      acquisition_cost: d.cost,
      hour_meter: randFloat(400, 4200, 1),
      status: d.status,
      next_maintenance_at: daysFromNow(d.maintDays),
      created_at: acquired_at,
    });
    entries.push(
      linkedEntry({
        entry_type: "expense",
        category: `Aquisição de máquina - ${d.name}`,
        amount: d.cost,
        related_module: "maquinas",
        related_id: id,
        occurred_at: acquired_at,
      }),
    );

    const nMaint = randInt(3, 5);
    let cursor = acquired_at;
    for (let m = 0; m < nMaint; m++) {
      const performed_at = daysAgo(Math.max(1, Math.floor((Date.now() - cursor.getTime()) / 86_400_000) - randInt(20, 150)));
      cursor = performed_at;
      const maintId = randomUUID();
      const cost = randFloat(280, 3400, 2);
      maintenances.push({
        id: maintId,
        tenant_id: TENANT_ID,
        machine_id: id,
        performed_at,
        description: pick([
          "Troca de óleo e filtros",
          "Revisão geral",
          "Troca de pneus",
          "Manutenção preventiva do motor",
          "Ajuste hidráulico",
        ]),
        cost,
      });
      entries.push(
        linkedEntry({
          entry_type: "expense",
          category: `Manutenção - ${d.name}`,
          amount: cost,
          related_module: "maquinas",
          related_id: maintId,
          occurred_at: performed_at,
        }),
      );
    }
  }

  await prisma.machine.createMany({ data: machines });
  if (maintenances.length) await prisma.machineMaintenance.createMany({ data: maintenances });
  return entries;
}

async function seedLavoura(propertyIds: string[]) {
  const [mainPropertyId, secondPropertyId = propertyIds[0]] = propertyIds;
  const plots = [
    { name: "Talhão 1 - Soja", area: 85, crop: "Soja", cycles: 4, permanent: false, propertyId: mainPropertyId },
    { name: "Talhão 2 - Milho", area: 60, crop: "Milho", cycles: 3, permanent: false, propertyId: mainPropertyId },
    { name: "Talhão 3 - Pastagem Braquiária", area: 220, crop: "Braquiária", cycles: 1, permanent: true, propertyId: secondPropertyId },
  ];

  const plotRows: Prisma.PlotCreateManyInput[] = [];
  const cycleRows: Prisma.CropCycleCreateManyInput[] = [];
  const inputRows: Prisma.PlotInputCreateManyInput[] = [];
  const entries: Prisma.FinancialEntryCreateManyInput[] = [];

  for (const p of plots) {
    const plotId = randomUUID();
    plotRows.push({
      id: plotId,
      tenant_id: TENANT_ID,
      property_id: p.propertyId,
      name: p.name,
      area_hectares: p.area,
      current_crop: p.crop,
      created_at: daysAgo(720),
    });

    if (p.permanent) {
      cycleRows.push({
        id: randomUUID(),
        tenant_id: TENANT_ID,
        plot_id: plotId,
        crop_name: p.crop,
        planted_at: daysAgo(700),
        status: "growing",
        created_at: daysAgo(700),
      });
      continue;
    }

    // Ciclos sequenciais de ~150 dias, do mais antigo pro mais recente; o
    // último fica em andamento (planted/growing) pra contar como "ativo".
    const cycleLenDays = 150;
    for (let c = 0; c < p.cycles; c++) {
      const isLast = c === p.cycles - 1;
      const plantedDaysAgo = (p.cycles - c) * cycleLenDays;
      const planted_at = daysAgo(plantedDaysAgo);
      const cycleId = randomUUID();
      if (isLast) {
        cycleRows.push({
          id: cycleId,
          tenant_id: TENANT_ID,
          plot_id: plotId,
          crop_name: p.crop,
          planted_at,
          expected_harvest_at: daysFromNow(cycleLenDays - (720 - plantedDaysAgo <= 0 ? 0 : 0) + randInt(20, 60)),
          status: Math.random() < 0.5 ? "growing" : "planted",
          created_at: planted_at,
        });
      } else {
        const harvested_at = daysAgo(Math.max(plantedDaysAgo - cycleLenDays + randInt(-10, 10), 1));
        // Escala pensada pra não dominar o gráfico de 6 meses (a pecuária é o
        // negócio principal desta fazenda-demo, a lavoura é secundária):
        // sacas e preço/saca abaixo do valor de mercado real de propósito.
        const yield_amount = randFloat(p.crop === "Soja" ? 300 : 380, p.crop === "Soja" ? 550 : 680, 0);
        const pricePerSaca = p.crop === "Soja" ? randFloat(110, 145) : randFloat(55, 75);
        cycleRows.push({
          id: cycleId,
          tenant_id: TENANT_ID,
          plot_id: plotId,
          crop_name: p.crop,
          planted_at,
          expected_harvest_at: harvested_at,
          harvested_at,
          yield_amount,
          yield_unit: "sacas",
          status: "harvested",
          created_at: planted_at,
        });
        entries.push(
          linkedEntry({
            entry_type: "income",
            category: "Venda de lote",
            amount: Math.round(yield_amount * pricePerSaca),
            related_module: "lavoura",
            related_id: cycleId,
            occurred_at: harvested_at,
          }),
        );
      }

      const nInputs = randInt(2, 4);
      for (let n = 0; n < nInputs; n++) {
        const input_type = pick(["fertilizer", "pesticide", "seed"] as const);
        const name = input_type === "fertilizer" ? "Adubo NPK" : input_type === "pesticide" ? "Defensivo" : `Semente de ${p.crop}`;
        const applied_at = new Date(planted_at.getTime() + randInt(0, cycleLenDays - 10) * 86_400_000);
        const cost = randFloat(800, 6500, 2);
        const inputId = randomUUID();
        inputRows.push({
          id: inputId,
          tenant_id: TENANT_ID,
          cycle_id: cycleId,
          input_type,
          name,
          quantity: randFloat(50, 900, 1),
          unit: input_type === "seed" ? "kg" : "L",
          cost,
          applied_at,
          created_at: applied_at,
        });
        entries.push(
          linkedEntry({
            entry_type: "expense",
            category: `Insumo (${input_type}) - ${name}`,
            amount: cost,
            related_module: "lavoura",
            related_id: cycleId,
            occurred_at: applied_at,
          }),
        );
      }
    }
  }

  await prisma.plot.createMany({ data: plotRows });
  await prisma.cropCycle.createMany({ data: cycleRows });
  await prisma.plotInput.createMany({ data: inputRows });
  return entries;
}

async function seedPrestador() {
  const clients = ["Fazenda Santa Rita", "Sítio Bela Vista", "Agropecuária Rio Claro", "Fazenda Três Irmãos", "Chácara Esperança", "Fazenda Vale Verde"];
  const services = [
    { name: "Roçagem mecanizada", pricing_type: "hour" as const, unit_price: 180 },
    { name: "Transporte de carga", pricing_type: "fixed" as const, unit_price: 950 },
    { name: "Aplicação de defensivo", pricing_type: "hour" as const, unit_price: 220 },
  ];

  const clientRows: Prisma.ServiceClientCreateManyInput[] = clients.map((name) => ({
    id: randomUUID(),
    tenant_id: TENANT_ID,
    name,
    phone: `+55${randInt(11, 99)}9${randInt(1000, 9999)}${randInt(1000, 9999)}`,
    created_at: daysAgo(randInt(60, 700)),
  }));
  await prisma.serviceClient.createMany({ data: clientRows });

  const serviceRows: Prisma.ServiceCreateManyInput[] = services.map((s) => ({
    id: randomUUID(),
    tenant_id: TENANT_ID,
    name: s.name,
    pricing_type: s.pricing_type,
    unit_price: s.unit_price,
    created_at: daysAgo(720),
  }));
  await prisma.service.createMany({ data: serviceRows });

  const orders: Prisma.ServiceOrderCreateManyInput[] = [];
  const entries: Prisma.FinancialEntryCreateManyInput[] = [];
  const TOTAL_ORDERS = 30;
  for (let i = 0; i < TOTAL_ORDERS; i++) {
    const client = pick(clientRows);
    const service = pick(serviceRows);
    const quantity = randFloat(2, 12, 1);
    const total_value = Math.round(quantity * Number(service.unit_price) * 100) / 100;
    const daysAgoOrder = Math.floor(700 * Math.pow(Math.random(), 1.4));
    const isFuture = i >= TOTAL_ORDERS - 3; // últimas 3: agendadas no futuro
    const id = randomUUID();

    if (isFuture) {
      orders.push({
        id,
        tenant_id: TENANT_ID,
        service_client_id: client.id!,
        service_id: service.id!,
        quantity,
        total_value,
        performed_at: daysFromNow(randInt(1, 12)),
        status: "scheduled",
        created_at: daysAgo(randInt(1, 10)),
      });
      continue;
    }

    const performed_at = daysAgo(daysAgoOrder);
    const recentlyCompletedNotInvoiced = daysAgoOrder < 10 && Math.random() < 0.5;
    const status = recentlyCompletedNotInvoiced ? "completed" : "invoiced";
    orders.push({
      id,
      tenant_id: TENANT_ID,
      service_client_id: client.id!,
      service_id: service.id!,
      quantity,
      total_value,
      performed_at,
      status,
      created_at: performed_at,
    });

    if (status === "invoiced") {
      // Espelha a rota de faturamento: nasce pending, due_date = performed_at.
      // Faturas antigas (> 25 dias) já foram pagas; as recentes seguem em aberto
      // (algumas vencidas, pra alimentar "contas vencidas").
      const paidLater = daysAgoOrder > 25;
      entries.push(
        linkedEntry({
          entry_type: "income",
          category: `Serviço - ${service.name}`,
          amount: total_value,
          related_module: "servico",
          related_id: id,
          occurred_at: performed_at,
          due_date: performed_at,
          status: paidLater ? "paid" : "pending",
        }),
      );
    }
  }
  await prisma.serviceOrder.createMany({ data: orders });
  return entries;
}

async function seedTasks() {
  const upcomingTitles = [
    "Vacinar lote de bezerros",
    "Pagar fornecedor de ração",
    "Reunião com comprador de gado",
    "Revisar cerca do Talhão 2",
    "Buscar peças na cidade",
    "Conferir estoque de sal mineral",
    "Ligar para veterinário",
    "Agendar transporte de carga",
    "Verificar bomba d'água",
    "Enviar boleto pro cliente",
  ];
  const pastTitles = [
    "Comprar suplemento mineral",
    "Levar trator pra revisão",
    "Contratar diarista",
    "Fechar contrato de arrendamento",
    "Vistoriar cocho novo",
  ];

  const tasks: Prisma.TaskCreateManyInput[] = [];

  // Próximos 21 dias: mistura pra render calendário/Meu Dia com vida.
  for (let d = 0; d <= 21; d++) {
    if (Math.random() < 0.55) continue; // nem todo dia tem algo
    const n = randInt(1, 2);
    for (let t = 0; t < n; t++) {
      tasks.push({
        id: randomUUID(),
        tenant_id: TENANT_ID,
        title: pick(upcomingTitles),
        due_date: daysFromNow(d),
        status: "pending",
        created_at: daysAgo(randInt(1, 15)),
      });
    }
  }

  // Um par de tarefas já vencidas e ainda pendentes (realismo).
  for (let i = 0; i < 2; i++) {
    tasks.push({
      id: randomUUID(),
      tenant_id: TENANT_ID,
      title: pick(upcomingTitles),
      due_date: daysAgo(randInt(1, 4)),
      status: "pending",
      created_at: daysAgo(randInt(10, 20)),
    });
  }

  // Histórico concluído, últimos 2 anos.
  for (let i = 0; i < 60; i++) {
    const due_date = daysAgo(randInt(22, 720));
    tasks.push({
      id: randomUUID(),
      tenant_id: TENANT_ID,
      title: pick(pastTitles.concat(upcomingTitles)),
      due_date,
      status: Math.random() < 0.9 ? "completed" : "cancelled",
      created_at: due_date,
    });
  }

  await prisma.task.createMany({ data: tasks });
}

async function seedRecurringFinancials() {
  const entries: Prisma.FinancialEntryCreateManyInput[] = [];
  const MONTHS = 24;

  for (let m = 0; m < MONTHS; m++) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setMonth(monthStart.getMonth() - m);

    const dueThisMonth = (day: number) => {
      const d = new Date(monthStart);
      d.setDate(Math.min(day, 28));
      return d;
    };

    const recurring: { category: string; amount: number; day: number }[] = [
      { category: "Ração", amount: randFloat(3000, 6200, 2), day: randInt(5, 10) },
      { category: "Combustível", amount: randFloat(1500, 3600, 2), day: randInt(8, 15) },
      { category: "Mão de obra", amount: randFloat(8500, 14200, 2), day: 5 },
    ];
    if (Math.random() < 0.35) recurring.push({ category: "Outros", amount: randFloat(200, 1400, 2), day: randInt(1, 25) });

    for (const r of recurring) {
      const due_date = dueThisMonth(r.day);
      // Meses mais antigos que 1 já foram pagos; o mês corrente/último tem
      // parte pending (algumas vencidas), pra alimentar "contas vencidas".
      const isCurrentOrLast = m <= 1;
      const overdue = isCurrentOrLast && due_date.getTime() < Date.now() && Math.random() < 0.5;
      const paid = !isCurrentOrLast || (due_date.getTime() < Date.now() && !overdue);
      entries.push(
        linkedEntry({
          entry_type: "expense",
          category: r.category,
          amount: r.amount,
          related_module: "geral",
          related_id: `demo-recorrente-${m}-${r.category}`,
          occurred_at: due_date,
          due_date,
          status: paid ? "paid" : "pending",
        }),
      );
    }
  }

  // Algumas contas a pagar futuras (próximos 20 dias), pra "próximos
  // compromissos"/Meu Dia terem conta prevista de verdade.
  for (let i = 0; i < 4; i++) {
    const due_date = daysFromNow(randInt(1, 18));
    entries.push(
      linkedEntry({
        entry_type: "expense",
        category: pick(["Ração", "Combustível", "Manutenção", "Insumos"]),
        amount: randFloat(400, 3200, 2),
        related_module: "geral",
        related_id: `demo-futura-${i}`,
        occurred_at: due_date,
        due_date,
        status: "pending",
      }),
    );
  }

  await prisma.financialEntry.createMany({ data: entries });
}

async function main() {

  const tenant = await prisma.tenant.findUnique({ where: { document: TENANT_DOCUMENT } });
  if (!tenant) {
    console.error("❌ Tenant Da Mata Sementes não encontrado. Rode `npm run db:seed` primeiro.");
    process.exit(1);
  }
  TENANT_ID = tenant.id;

  console.log(`🌱 Semeando dados de demonstração para ${tenant.name} (${tenant.id})...`);
  console.log("   Limpando histórico de demonstração anterior...");
  await wipeDemoData();

  // 2 propriedades (não 1): pra dar o que testar de verdade no seletor de
  // propriedade do topo (briefing de layout, seção 12). ~80% do rebanho/
  // máquinas/talhões fica na principal, ~20% na segunda.
  const property = await prisma.property.create({
    data: { tenant_id: TENANT_ID, name: "Fazenda Boa Vista", area_hectares: 480, created_at: daysAgo(730) },
  });
  const property2 = await prisma.property.create({
    data: { tenant_id: TENANT_ID, name: "Sítio Recanto", area_hectares: 65, created_at: daysAgo(500) },
  });
  const propertyIds = [property.id, property2.id];

  const db = prismaForTenant(TENANT_ID);
  await provisionDefaultAnimalCategories(db);
  await provisionDefaultVaccines(db);
  await listFinancialCategoriesAction(db); // lazy-seed das categorias padrão

  const categories = await prisma.animalCategory.findMany({ where: { tenant_id: TENANT_ID } });
  const categoryByName = new Map(categories.map((c) => [c.name, c.id]));

  console.log("   Rebanho (≈260 animais, 2 anos de movimentação)...");
  const animalEntries = await seedAnimals(propertyIds, categoryByName);

  console.log("   Máquinas e manutenções...");
  const machineEntries = await seedMachines(propertyIds);

  console.log("   Lavoura (talhões, ciclos, insumos)...");
  const lavouraEntries = await seedLavoura(propertyIds);

  console.log("   Prestador de serviço (clientes, ordens)...");
  const prestadorEntries = await seedPrestador();

  console.log("   Tarefas e compromissos (Meu Dia)...");
  await seedTasks();

  console.log("   Financeiro recorrente (24 meses)...");
  await seedRecurringFinancials();

  console.log("   Gravando lançamentos financeiros ligados (rebanho/máquinas/lavoura/prestador)...");
  const linked = [...animalEntries, ...machineEntries, ...lavouraEntries, ...prestadorEntries];
  // createMany em lotes: uma tabela só, mas o total passa de 500 linhas.
  const CHUNK = 500;
  for (let i = 0; i < linked.length; i += CHUNK) {
    await prisma.financialEntry.createMany({ data: linked.slice(i, i + CHUNK) });
  }

  console.log("   Gerando alertas a partir do dado semeado (generateAlertsForTenant)...");
  const alertResult = await generateAlertsForTenant(TENANT_ID);

  const [animalCount, entryCount, machineCount, taskCount, plotCount, clientCount] = await Promise.all([
    // Soma CABEÇAS, não lotes.
    prisma.animalBatch
      .aggregate({ where: { tenant_id: TENANT_ID }, _sum: { quantity: true } })
      .then((a) => a._sum.quantity ?? 0),
    prisma.financialEntry.count({ where: { tenant_id: TENANT_ID } }),
    prisma.machine.count({ where: { tenant_id: TENANT_ID } }),
    prisma.task.count({ where: { tenant_id: TENANT_ID } }),
    prisma.plot.count({ where: { tenant_id: TENANT_ID } }),
    prisma.serviceClient.count({ where: { tenant_id: TENANT_ID } }),
  ]);

  console.log("");
  console.log("✅ Dados de demonstração prontos:");
  console.log(`   Animais ativos: ${animalCount}`);
  console.log(`   Lançamentos financeiros: ${entryCount}`);
  console.log(`   Máquinas: ${machineCount}`);
  console.log(`   Tarefas: ${taskCount}`);
  console.log(`   Talhões: ${plotCount}`);
  console.log(`   Clientes (prestador): ${clientCount}`);
  console.log(`   Alertas gerados nesta rodada: ${alertResult.created}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Falha ao semear dados de demonstração:");
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
