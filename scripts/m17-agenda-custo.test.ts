import "dotenv/config";
import {
  calculatePendingDaysOverdue,
  listPendingEntries,
  resolvePendingEntriesCalendar,
} from "@/lib/actions/financial-reports";
import { addVaccinationAction } from "@/lib/actions/animal-vaccinations";
import {
  ensureBillDueAlertForEntry,
  generateAlertsForTenant,
} from "@/lib/actions/alerts";
import { routeIntent } from "@/lib/actions/whatsapp-router";
import { supportsThreeDayReminder } from "@/lib/actions/whatsapp-handlers/rebanho";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";

/**
 * Teste de integração do Módulo 17: agenda com custo.
 * Roda: `npm run test:m17` com o DATABASE_URL do Docker local.
 */

let failures = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
  } else {
    console.error(`  ❌ ${message}`);
    failures++;
  }
}

function addUtcCalendarDays(base: Date, days: number): Date {
  return new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate() + days,
      12,
    ),
  );
}

function formatUtcCivilDate(date: Date): string {
  return date.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

async function callResumo(
  db: ReturnType<typeof prismaForTenant>,
  tenantId: string,
  activeProfiles: ("fazenda" | "prestador")[],
  scope: string,
) {
  return routeIntent(db, {
    tenant_id: tenantId,
    role: "OWNER",
    activeProfiles,
    intent: "resumo",
    parameters: { scope },
    confirmed: false,
    explicitNo: false,
  });
}

async function main() {
  console.log("📅 Módulo 17: Agenda com custo\n");

  const calendarAtUtcRollover = resolvePendingEntriesCalendar(
    new Date("2026-08-01T01:30:00.000Z"),
  );
  assert(
    calendarAtUtcRollover.today.toISOString() === "2026-07-31T00:00:00.000Z" &&
      calendarAtUtcRollover.monthEnd.toISOString() === "2026-07-31T23:59:59.999Z",
    "virada UTC ainda usa o dia e o mês de America/Sao_Paulo",
  );
  assert(
    calculatePendingDaysOverdue(
      new Date("2018-11-03T00:00:00.000Z"),
      new Date("2018-11-05T00:00:00.000Z"),
    ) === 2,
    "atraso usa dois dias civis mesmo atravessando mudança histórica de horário",
  );
  assert(
    supportsThreeDayReminder(
      new Date("2026-08-03T00:00:00.000Z"),
      new Date("2026-08-01T01:30:00.000Z"),
    ),
    "promessa de lembrete usa o dia civil de America/Sao_Paulo na virada UTC",
  );

  const now = new Date();
  const currentCalendar = resolvePendingEntriesCalendar(now);
  const dueToday = currentCalendar.today;
  const overdueDate = new Date(
    Date.UTC(
      dueToday.getUTCFullYear(),
      dueToday.getUTCMonth(),
      dueToday.getUTCDate() - 31,
    ),
  );
  const monthFuture = new Date(
    Date.UTC(
      currentCalendar.monthEnd.getUTCFullYear(),
      currentCalendar.monthEnd.getUTCMonth(),
      currentCalendar.monthEnd.getUTCDate(),
    ),
  );
  const nextMonth = new Date(currentCalendar.monthEnd.getTime() + 1);
  const tenantIds: string[] = [];

  try {
    const tenantA = await prisma.tenant.create({
      data: { name: "M17 Tenant A", document: `M17A-${Date.now()}`, plan: "grupo" },
    });
    tenantIds.push(tenantA.id);
    const tenantB = await prisma.tenant.create({
      data: { name: "M17 Tenant B", document: `M17B-${Date.now()}`, plan: "grupo" },
    });
    tenantIds.push(tenantB.id);
    const dbA = prismaForTenant(tenantA.id);
    const dbB = prismaForTenant(tenantB.id);

    const overdue = await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Conta vencida",
        amount: 123.45,
        related_module: "geral",
        related_id: "m17-overdue",
        due_date: overdueDate,
        status: "pending",
      }),
    });
    const today = await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Conta de hoje",
        amount: 200,
        related_module: "servico",
        related_id: "m17-today",
        due_date: dueToday,
        status: "pending",
      }),
    });
    const future = await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Conta futura",
        amount: 300.1,
        related_module: "lavoura",
        related_id: "m17-future",
        due_date: monthFuture,
        status: "pending",
      }),
    });
    await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Fora do período",
        amount: 999,
        due_date: nextMonth,
        status: "pending",
      }),
    });
    await dbA.financialEntry.create({
      data: scoped({
        entry_type: "income",
        category: "Receita pendente",
        amount: 450.75,
        due_date: dueToday,
        status: "pending",
      }),
    });
    await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Despesa paga",
        amount: 700,
        due_date: dueToday,
        status: "paid",
        paid_at: dueToday,
      }),
    });
    await dbB.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Conta do tenant B",
        amount: 888,
        due_date: dueToday,
        status: "pending",
      }),
    });

    const expenses = await listPendingEntries(dbA, {
      entry_type: "expense",
      end: currentCalendar.monthEnd,
    });

    assert(expenses.length === 3, "retorna apenas despesas pendentes até o fim do mês");
    assert(
      expenses.map((entry) => entry.category).join("|") ===
        "Conta vencida|Conta de hoje|Conta futura",
      "ordena por vencimento e inclui pendência de mês anterior",
    );
    assert(
      expenses.map((entry) => entry.id).join("|") ===
        [overdue.id, today.id, future.id].join("|"),
      "retorna os identificadores conhecidos na ordem esperada",
    );
    assert(
      expenses[0]?.amount === 123.45 && typeof expenses[0]?.amount === "number",
      "converte Decimal para o valor numérico literal 123.45",
    );
    assert(expenses[0]?.days_overdue === 31, "calcula 31 dias de atraso");
    assert(expenses[1]?.days_overdue === null, "conta que vence hoje não está vencida");
    assert(expenses[2]?.days_overdue === null, "conta futura não está vencida");
    assert(
      expenses[0]?.due_date instanceof Date &&
        expenses[0].due_date.toISOString() === overdueDate.toISOString(),
      "retorna a data de vencimento conhecida",
    );
    assert(
      expenses[0]?.related_module === "geral" &&
        expenses[0]?.related_id === "m17-overdue",
      "retorna módulo e identificador relacionados",
    );
    assert(
      !expenses.some((entry) => entry.category === "Fora do período"),
      "exclui lançamento posterior ao fim do mês civil",
    );
    assert(
      !expenses.some((entry) => entry.category === "Receita pendente"),
      "filtra pelo tipo expense",
    );
    assert(
      !expenses.some((entry) => entry.category === "Despesa paga"),
      "filtra pelo status pending",
    );
    assert(
      !expenses.some((entry) => entry.category === "Conta do tenant B"),
      "client Prisma escopado preserva o isolamento entre tenants",
    );

    const incomes = await listPendingEntries(dbA, {
      entry_type: "income",
      end: dueToday,
    });
    assert(
      incomes.length === 1 &&
        incomes[0]?.category === "Receita pendente" &&
        incomes[0]?.amount === 450.75,
      "filtra pelo tipo income e respeita o end informado",
    );

    const serviceClient = await dbA.serviceClient.create({
      data: scoped({ name: "Cliente Agenda M17" }),
    });
    const service = await dbA.service.create({
      data: scoped({
        name: "Pulverização M17",
        pricing_type: "fixed",
        unit_price: 100,
      }),
    });
    const isolatedServiceClient = await dbB.serviceClient.create({
      data: scoped({ name: "Cliente Sentinela Tenant B M17" }),
    });
    const isolatedService = await dbB.service.create({
      data: scoped({
        name: "Serviço Sentinela Tenant B M17",
        pricing_type: "fixed",
        unit_price: 909.09,
      }),
    });
    await dbB.serviceOrder.create({
      data: scoped({
        service_client_id: isolatedServiceClient.id,
        service_id: isolatedService.id,
        description: "Agendamento sentinela tenant B",
        quantity: 1,
        total_value: 909.09,
        performed_at: new Date("2026-08-14T00:00:00.000Z"),
        status: "scheduled",
      }),
    });
    await dbB.serviceOrder.create({
      data: scoped({
        service_client_id: isolatedServiceClient.id,
        service_id: isolatedService.id,
        description: "Ordem concluída sentinela tenant B",
        quantity: 1,
        total_value: 8765.43,
        performed_at: new Date("2026-07-19T00:00:00.000Z"),
        status: "completed",
      }),
    });
    const scheduledDates = [
      new Date("2026-08-15T00:00:00.000Z"),
      new Date("2026-08-16T00:00:00.000Z"),
      new Date("2026-08-17T00:00:00.000Z"),
      new Date("2026-08-18T00:00:00.000Z"),
      new Date("2026-08-19T00:00:00.000Z"),
      new Date("2026-08-20T00:00:00.000Z"),
      new Date("2026-08-21T00:00:00.000Z"),
    ];
    for (let index = 0; index < scheduledDates.length; index++) {
      const performedAt = scheduledDates[index]!;
      await dbA.serviceOrder.create({
        data: scoped({
          service_client_id: serviceClient.id,
          service_id: service.id,
          quantity: 1,
          total_value: 100 + index,
          performed_at: performedAt,
          status: "scheduled",
        }),
      });
    }

    const appointments = await callResumo(
      dbA,
      tenantA.id,
      ["fazenda", "prestador"],
      "agendamentos",
    );
    assert(
      appointments.reply_text.includes(
        "Pulverização M17 para Cliente Agenda M17 dia 15/08/2026, R$ 100.00",
      ),
      "agendamentos mostra serviço, cliente, data civil UTC conhecida e valor real",
    );
    assert(
      !appointments.reply_text.includes("dia 20/08/2026") &&
        appointments.reply_text.includes("e mais 2 agendamento(s)"),
      "agendamentos limita a lista a 5 e informa os 2 itens restantes",
    );
    assert(
      !appointments.reply_text.includes("Serviço Sentinela Tenant B M17") &&
        !appointments.reply_text.includes("Cliente Sentinela Tenant B M17") &&
        !appointments.reply_text.includes("909.09") &&
        !appointments.reply_text.includes("e mais 3 agendamento(s)"),
      "agendamentos do tenant A não lista nem conta o sentinela scheduled do tenant B",
    );
    assert(
      appointments.action_taken === "resumo:agendamentos",
      "agendamentos preserva o action_taken do escopo",
    );

    await dbA.serviceOrder.updateMany({
      where: { status: "scheduled" },
      data: { status: "invoiced" },
    });
    const emptyAppointments = await callResumo(
      dbA,
      tenantA.id,
      ["fazenda", "prestador"],
      "agendamentos",
    );
    assert(
      emptyAppointments.reply_text === "Nenhum agendamento pendente no momento.",
      "agendamentos responde o texto de vazio definido na spec",
    );

    await dbA.serviceOrder.create({
      data: scoped({
        service_client_id: serviceClient.id,
        service_id: service.id,
        quantity: 1,
        total_value: 250.5,
        performed_at: new Date("2026-07-20T00:00:00.000Z"),
        status: "completed",
      }),
    });
    const serviceSecondLevel = await callResumo(
      dbA,
      tenantA.id,
      ["fazenda", "prestador"],
      "prestador",
    );
    assert(
      serviceSecondLevel.reply_text.includes("Ordens a faturar") &&
        !serviceSecondLevel.reply_text.includes("Contas a receber"),
      "segundo nível do prestador oferece Ordens a faturar",
    );
    const ordersToInvoice = await callResumo(
      dbA,
      tenantA.id,
      ["fazenda", "prestador"],
      "ordens_a_faturar",
    );
    assert(
      /1 ordem/.test(ordersToInvoice.reply_text) &&
        /250[,.]50/.test(ordersToInvoice.reply_text) &&
        ordersToInvoice.action_taken === "resumo:ordens_a_faturar",
      "ordens_a_faturar preserva contagem e soma das ordens completed",
    );
    assert(
      !/2 ordem/.test(ordersToInvoice.reply_text) &&
        !/8765[,.]43/.test(ordersToInvoice.reply_text) &&
        !/9015[,.]93/.test(ordersToInvoice.reply_text),
      "ordens_a_faturar do tenant A não conta nem soma a ordem completed do tenant B",
    );
    const ordersWithoutProfile = await callResumo(
      dbB,
      tenantB.id,
      ["fazenda"],
      "ordens_a_faturar",
    );
    assert(
      ordersWithoutProfile.action_taken === "resumo:perfil_inativo",
      "ordens_a_faturar continua exigindo o perfil prestador",
    );

    await dbA.financialEntry.createMany({
      data: [
        scoped({
          entry_type: "expense",
          category: "Conta extra 1",
          amount: 10,
          due_date: dueToday,
          status: "pending",
        }),
        scoped({
          entry_type: "expense",
          category: "Conta extra 2",
          amount: 20,
          due_date: dueToday,
          status: "pending",
        }),
        scoped({
          entry_type: "expense",
          category: "Conta extra 3",
          amount: 30,
          due_date: dueToday,
          status: "pending",
        }),
      ],
    });
    const billsToPay = await callResumo(dbA, tenantA.id, ["fazenda"], "contas_a_pagar");
    assert(
      billsToPay.reply_text.includes("⚠️ VENCIDA há 31 dias: Conta vencida, R$ 123.45") &&
        billsToPay.reply_text.includes("venceu") &&
        billsToPay.reply_text.includes("e mais 1 conta(s)"),
      "contas_a_pagar marca vencida de mês anterior e limita a lista a 5",
    );
    assert(
      billsToPay.reply_text.includes("Total a pagar no período: R$ 683.55"),
      "contas_a_pagar totaliza todos os 6 lançamentos do período",
    );
    assert(
      !billsToPay.reply_text.includes("Conta do tenant B"),
      "contas_a_pagar não mistura lançamentos de outro tenant",
    );

    await dbB.financialEntry.create({
      data: scoped({
        entry_type: "income",
        category: "Receita Sentinela Tenant B M17",
        amount: 9876.54,
        due_date: dueToday,
        status: "pending",
      }),
    });
    const billsToReceive = await callResumo(
      dbA,
      tenantA.id,
      ["fazenda"],
      "contas_a_receber",
    );
    assert(
      billsToReceive.reply_text.includes("Receita pendente: R$ 450.75") &&
        billsToReceive.reply_text.includes("Total a receber no período: R$ 450.75"),
      "contas_a_receber usa receitas pendentes de FinancialEntry",
    );
    assert(
      !/ordem\(ns\)|aguardando fatura/i.test(billsToReceive.reply_text),
      "contas_a_receber não usa ordens completed",
    );
    assert(
      !billsToReceive.reply_text.includes("Receita Sentinela Tenant B M17") &&
        !/9876[,.]54/.test(billsToReceive.reply_text) &&
        !/10327[,.]29/.test(billsToReceive.reply_text),
      "contas_a_receber do tenant A não lista nem totaliza a receita do tenant B",
    );

    await dbB.financialEntry.deleteMany();
    const emptyPayables = await callResumo(dbB, tenantB.id, ["fazenda"], "contas_a_pagar");
    const emptyReceivables = await callResumo(
      dbB,
      tenantB.id,
      ["fazenda"],
      "contas_a_receber",
    );
    assert(
      emptyPayables.reply_text === "Nenhuma conta a pagar no período." &&
        emptyPayables.action_taken === "resumo:contas_a_pagar",
      "contas_a_pagar funciona sem perfil prestador e responde vazio",
    );
    assert(
      emptyReceivables.reply_text === "Nenhuma conta a receber no período." &&
        emptyReceivables.action_taken === "resumo:contas_a_receber",
      "contas_a_receber funciona sem perfil prestador e responde vazio",
    );

    const financial = await callResumo(dbA, tenantA.id, ["fazenda"], "financeiro");
    assert(
      financial.action_taken === "resumo:financeiro" &&
        financial.reply_text.startsWith("💰 Financeiro: saldo do mês"),
      "resumo financeiro permanece no comportamento direto existente",
    );

    const propertyA = await dbA.property.create({
      data: scoped({ name: "Fazenda Agenda M17" }),
    });
    const propertyB = await dbB.property.create({
      data: scoped({ name: "Fazenda Isolada M17" }),
    });
    const animals = await Promise.all(
      ["M17-101", "M17-102", "M17-103"].map((earTag) =>
        dbA.animal.create({
          data: scoped({
            property_id: propertyA.id,
            ear_tag: earTag,
            sex: "female",
          }),
        }),
      ),
    );
    const vaccines = await Promise.all(
      ["Aftosa M17", "Brucelose M17", "Clostridial M17"].map((name) =>
        dbA.vaccine.create({ data: scoped({ name }) }),
      ),
    );
    const vaccinationDates = [
      addUtcCalendarDays(now, 5),
      addUtcCalendarDays(now, 10),
      addUtcCalendarDays(now, 15),
    ];
    for (let index = 0; index < animals.length; index++) {
      await dbA.animalVaccination.create({
        data: scoped({
          animal_id: animals[index]!.id,
          vaccine_id: vaccines[index]!.id,
          applied_at: addUtcCalendarDays(now, -20),
          next_due_at: vaccinationDates[index],
        }),
      });
    }
    await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Previsão Aftosa M17",
        amount: 175.5,
        due_date: vaccinationDates[0],
        status: "pending",
        related_module: "geral",
        related_id: `${animals[0]!.id}:${vaccines[0]!.id}`,
      }),
    });

    const isolatedAnimal = await dbB.animal.create({
      data: scoped({
        property_id: propertyB.id,
        ear_tag: "M17-B-999",
        sex: "male",
      }),
    });
    const isolatedVaccine = await dbB.vaccine.create({
      data: scoped({ name: "Vacina Outro Tenant M17" }),
    });
    await dbB.animalVaccination.create({
      data: scoped({
        animal_id: isolatedAnimal.id,
        vaccine_id: isolatedVaccine.id,
        applied_at: addUtcCalendarDays(now, -10),
        next_due_at: addUtcCalendarDays(now, 3),
      }),
    });

    const herdAgenda = await callResumo(dbA, tenantA.id, ["fazenda"], "rebanho");
    assert(
      herdAgenda.reply_text.includes("3 animal(is) ativo(s)") &&
        herdAgenda.reply_text.includes(
          `Aftosa M17 (brinco M17-101) dia ${formatUtcCivilDate(vaccinationDates[0]!)}, previsão R$ 175.50`,
        ),
      "rebanho mantém a contagem e mostra vacina com previsão",
    );
    assert(
      herdAgenda.reply_text.includes(
        `Brucelose M17 (brinco M17-102) dia ${formatUtcCivilDate(vaccinationDates[1]!)}, sem previsão de gasto`,
      ) &&
        herdAgenda.reply_text.includes(
          `Clostridial M17 (brinco M17-103) dia ${formatUtcCivilDate(vaccinationDates[2]!)}, sem previsão de gasto`,
        ),
      "rebanho lista vacinas sem previsão na janela de 30 dias",
    );
    assert(
      herdAgenda.reply_text.includes(
        "Quer registrar um valor previsto para Brucelose M17 (brinco M17-102)? Me diga o valor.",
      ) &&
        !herdAgenda.reply_text.includes(
          "Quer registrar um valor previsto para Clostridial M17",
        ),
      "rebanho oferece registrar somente a primeira previsão ausente",
    );
    assert(
      !herdAgenda.reply_text.includes("Vacina Outro Tenant M17") &&
        !herdAgenda.reply_text.includes("M17-B-999"),
      "agenda de rebanho preserva isolamento multi-tenant",
    );

    await dbA.animalVaccination.updateMany({ data: { next_due_at: null } });
    const emptyHerdAgenda = await callResumo(dbA, tenantA.id, ["fazenda"], "rebanho");
    assert(
      emptyHerdAgenda.reply_text.includes(
        "Nenhuma vacina prevista nos próximos 30 dias.",
      ),
      "rebanho responde vazio para a agenda de 30 dias",
    );

    const plotA = await dbA.plot.create({
      data: scoped({
        property_id: propertyA.id,
        name: "Talhão Colheita M17",
        area_hectares: 12,
      }),
    });
    const harvestDates = Array.from({ length: 7 }, (_, index) =>
      addUtcCalendarDays(now, 40 + index),
    );
    for (let index = 0; index < harvestDates.length; index++) {
      const harvestAt = harvestDates[index]!;
      await dbA.cropCycle.create({
        data: scoped({
          plot_id: plotA.id,
          crop_name: `Cultura M17 ${index + 1}`,
          planted_at: addUtcCalendarDays(now, -30),
          expected_harvest_at: harvestAt,
          status: index % 2 === 0 ? "planted" : "growing",
        }),
      });
    }
    const plotB = await dbB.plot.create({
      data: scoped({
        property_id: propertyB.id,
        name: "Talhão Outro Tenant M17",
      }),
    });
    await dbB.cropCycle.create({
      data: scoped({
        plot_id: plotB.id,
        crop_name: "Cultura Outro Tenant M17",
        expected_harvest_at: addUtcCalendarDays(now, 2),
        status: "growing",
      }),
    });

    const cropAgenda = await callResumo(dbA, tenantA.id, ["fazenda"], "lavoura");
    assert(
      cropAgenda.reply_text.includes("1 talhão(ões) com ciclo ativo") &&
        cropAgenda.reply_text.includes(
          `Cultura M17 1 (talhão Talhão Colheita M17): colheita prevista ${formatUtcCivilDate(harvestDates[0]!)}`,
        ),
      "lavoura mantém a contagem e lista a primeira colheita futura",
    );
    assert(
      cropAgenda.reply_text.includes(
        `Cultura M17 5 (talhão Talhão Colheita M17): colheita prevista ${formatUtcCivilDate(harvestDates[4]!)}`,
      ) &&
        !cropAgenda.reply_text.includes("Cultura M17 6") &&
        cropAgenda.reply_text.includes("e mais 2 colheita(s)"),
      "lavoura limita a agenda a 5 e informa as 2 colheitas restantes",
    );
    assert(
      !cropAgenda.reply_text.includes("R$") &&
        !cropAgenda.reply_text.includes("Cultura Outro Tenant M17") &&
        !cropAgenda.reply_text.includes("Talhão Outro Tenant M17"),
      "lavoura não inventa valor e preserva isolamento multi-tenant",
    );

    await dbA.cropCycle.updateMany({ data: { status: "harvested" } });
    const emptyCropAgenda = await callResumo(dbA, tenantA.id, ["fazenda"], "lavoura");
    assert(
      emptyCropAgenda.reply_text.includes("Nenhuma colheita prevista."),
      "lavoura responde vazio quando não há colheita futura ativa",
    );

    const previsionAnimal = await dbA.animal.create({
      data: scoped({
        property_id: propertyA.id,
        ear_tag: "M17-PREV-101",
        sex: "female",
      }),
    });
    const previsionVaccine = await dbA.vaccine.create({
      data: scoped({ name: "Vacina Previsão M17" }),
    });
    const fallbackDueDate = addUtcCalendarDays(now, 8);
    await dbA.animalVaccination.create({
      data: scoped({
        animal_id: previsionAnimal.id,
        vaccine_id: previsionVaccine.id,
        applied_at: addUtcCalendarDays(now, -60),
        next_due_at: addUtcCalendarDays(now, 20),
      }),
    });
    await dbA.animalVaccination.create({
      data: scoped({
        animal_id: previsionAnimal.id,
        vaccine_id: previsionVaccine.id,
        applied_at: addUtcCalendarDays(now, -30),
        next_due_at: fallbackDueDate,
      }),
    });

    const createdPrevisionReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: previsionAnimal.ear_tag,
        vaccine_name: previsionVaccine.name,
        cost: 210.75,
      },
      confirmed: false,
      explicitNo: false,
    });
    const createdPrevision = await dbA.financialEntry.findFirst({
      where: {
        related_id: `${previsionAnimal.id}:${previsionVaccine.id}`,
        status: "pending",
        entry_type: "expense",
      },
    });
    assert(
      createdPrevision !== null &&
        createdPrevision.related_module === "geral" &&
        createdPrevision.category ===
          "Vacinação prevista - Vacina Previsão M17 (brinco M17-PREV-101)" &&
        Number(createdPrevision.amount) === 210.75 &&
        createdPrevision.due_date?.toISOString() === fallbackDueDate.toISOString(),
      "registrar_previsao_vacina cria despesa pending geral com chave sintética e fallback next_due_at",
    );
    assert(
      createdPrevisionReply.reply_text.includes("Previsão registrada") &&
        createdPrevisionReply.reply_text.includes("R$ 210.75") &&
        createdPrevisionReply.reply_text.includes(formatUtcCivilDate(fallbackDueDate)) &&
        createdPrevisionReply.requires_confirmation === false,
      "registrar_previsao_vacina ecoa valor e data sem confirmação sim ou não",
    );

    const updatedDueDate = addUtcCalendarDays(now, 12);
    const updatedPrevisionReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: previsionAnimal.ear_tag,
        vaccine_name: previsionVaccine.name,
        cost: 275.25,
        due_date: updatedDueDate.toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    const matchingPrevisions = await dbA.financialEntry.findMany({
      where: { related_id: `${previsionAnimal.id}:${previsionVaccine.id}` },
    });
    assert(
      matchingPrevisions.length === 1 &&
        Number(matchingPrevisions[0]?.amount) === 275.25 &&
        matchingPrevisions[0]?.due_date?.toISOString() === updatedDueDate.toISOString(),
      "segunda previsão atualiza valor e data da mesma linha pending",
    );
    assert(
      updatedPrevisionReply.reply_text.includes("Previsão atualizada") &&
        updatedPrevisionReply.reply_text.includes("R$ 275.25") &&
        updatedPrevisionReply.reply_text.includes(formatUtcCivilDate(updatedDueDate)),
      "segunda previsão informa de forma observável que foi atualizada",
    );

    const pendingReconciliationAlert = await dbA.alert.create({
      data: scoped({
        alert_type: "bill_due",
        related_module: "geral",
        related_id: matchingPrevisions[0]!.id,
        message: "Alerta pendente antes da conciliação M17",
        status: "pending",
        scheduled_for: new Date(),
      }),
    });
    const sentReconciliationAlert = await dbA.alert.create({
      data: scoped({
        alert_type: "bill_due",
        related_module: "geral",
        related_id: matchingPrevisions[0]!.id,
        message: "Alerta enviado antes da conciliação M17",
        status: "sent",
        scheduled_for: new Date(),
        sent_at: new Date(),
      }),
    });
    const reconciliation = await addVaccinationAction(dbA, {
      animal_id: previsionAnimal.id,
      vaccine_id: previsionVaccine.id,
      applied_at: addUtcCalendarDays(now, 1),
      cost: 320,
    });
    const reconciledEntries = await dbA.financialEntry.findMany({
      where: {
        OR: [
          { related_id: `${previsionAnimal.id}:${previsionVaccine.id}` },
          { related_module: "rebanho", related_id: previsionAnimal.id },
        ],
      },
    });
    const reconciledTotal = reconciledEntries.reduce(
      (sum, entry) => sum + Number(entry.amount),
      0,
    );
    const pendingReconciliationAlertAfter = await dbA.alert.findFirst({
      where: { id: pendingReconciliationAlert.id },
    });
    const sentReconciliationAlertAfter = await dbA.alert.findFirst({
      where: { id: sentReconciliationAlert.id },
    });
    assert(
      reconciliation.ok &&
        "reconciled" in reconciliation.data &&
        reconciliation.data.reconciled?.previous_amount === 275.25 &&
        reconciliation.data.reconciled?.new_amount === 320,
      "addVaccinationAction informa valor previsto e valor real conciliados",
    );
    assert(
      reconciledEntries.length === 1 &&
        reconciledEntries[0]?.status === "paid" &&
        reconciledEntries[0]?.paid_at instanceof Date &&
        reconciledTotal === 320,
      "conciliação quita a previsão com o custo real sem duplicar o total de despesas",
    );
    assert(
      pendingReconciliationAlertAfter?.status === "dismissed" &&
        sentReconciliationAlertAfter?.status === "sent",
      "conciliação descarta bill_due pendente e preserva alerta já enviado",
    );

    const noCostAnimal = await dbA.animal.create({
      data: scoped({
        property_id: propertyA.id,
        ear_tag: "M17-SEM-CUSTO",
        sex: "male",
      }),
    });
    const noCostVaccine = await dbA.vaccine.create({
      data: scoped({ name: "Vacina Sem Custo M17" }),
    });
    const noCostRelatedId = `${noCostAnimal.id}:${noCostVaccine.id}`;
    const noCostPrevision = await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Previsão sem custo real M17",
        amount: 88.4,
        related_module: "geral",
        related_id: noCostRelatedId,
        due_date: addUtcCalendarDays(now, 5),
        status: "pending",
      }),
    });
    const isolatedSameKeyPrevision = await dbB.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Sentinela mesma chave M17",
        amount: 999.99,
        related_module: "geral",
        related_id: noCostRelatedId,
        due_date: addUtcCalendarDays(now, 5),
        status: "pending",
      }),
    });
    const noCostVaccination = await addVaccinationAction(dbA, {
      animal_id: noCostAnimal.id,
      vaccine_id: noCostVaccine.id,
    });
    const noCostEntryAfter = await dbA.financialEntry.findFirst({
      where: { id: noCostPrevision.id },
    });
    const isolatedEntryAfter = await dbB.financialEntry.findFirst({
      where: { id: isolatedSameKeyPrevision.id },
    });
    const noCostLinkedEntry = await dbA.financialEntry.findFirst({
      where: { related_module: "rebanho", related_id: noCostAnimal.id },
    });
    assert(
      noCostVaccination.ok &&
        noCostVaccination.data.pending_prevision_amount === 88.4 &&
        noCostEntryAfter?.status === "pending" &&
        noCostEntryAfter.paid_at === null &&
        Number(noCostEntryAfter.amount) === 88.4 &&
        noCostLinkedEntry === null,
      "vacina sem custo real mantém a previsão pendente e não cria despesa adicional",
    );
    assert(
      isolatedEntryAfter?.status === "pending" &&
        Number(isolatedEntryAfter.amount) === 999.99,
      "conciliação usa o client escopado e não altera previsão de outro tenant com a mesma chave",
    );

    const handlerAnimal = await dbA.animal.create({
      data: scoped({
        property_id: propertyA.id,
        ear_tag: "M17-HANDLER-REC",
        sex: "female",
      }),
    });
    const handlerVaccine = await dbA.vaccine.create({
      data: scoped({
        name: "Vacina Handler M17",
        default_interval_days: 30,
      }),
    });
    await dbA.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Previsão Handler M17",
        amount: 100,
        related_module: "geral",
        related_id: `${handlerAnimal.id}:${handlerVaccine.id}`,
        due_date: addUtcCalendarDays(now, 6),
        status: "pending",
      }),
    });
    const reconciliationReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_vacina",
      parameters: {
        ear_tag: handlerAnimal.ear_tag,
        vaccine_name: handlerVaccine.name,
        cost: 150,
      },
      confirmed: false,
      explicitNo: false,
    });
    assert(
      reconciliationReply.reply_text.includes(
        "Previsão de R$ 100.00 conciliada com o custo real de R$ 150.00 e marcada como paga.",
      ),
      "registrar_vacina torna a conciliação visível no texto do agente",
    );

    const pendingPrevisionReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_vacina",
      parameters: {
        ear_tag: noCostAnimal.ear_tag,
        vaccine_name: noCostVaccine.name,
      },
      confirmed: false,
      explicitNo: false,
    });
    assert(
      pendingPrevisionReply.reply_text.includes(
        "Você tem uma previsão de R$ 88.40 pendente para essa vacina; me diga o valor real quando quiser que eu quite.",
      ),
      "registrar_vacina avisa sobre previsão pendente quando o custo real não foi informado",
    );

    const regularAnimal = await dbA.animal.create({
      data: scoped({
        property_id: propertyA.id,
        ear_tag: "M17-SEM-PREVISAO",
        sex: "male",
      }),
    });
    const regularVaccine = await dbA.vaccine.create({
      data: scoped({ name: "Vacina Regular M17" }),
    });
    const regularVaccination = await addVaccinationAction(dbA, {
      animal_id: regularAnimal.id,
      vaccine_id: regularVaccine.id,
      applied_at: addUtcCalendarDays(now, 1),
      cost: 45.6,
    });
    const regularEntry = await dbA.financialEntry.findFirst({
      where: { related_module: "rebanho", related_id: regularAnimal.id },
    });
    assert(
      regularVaccination.ok &&
        regularVaccination.data.reconciled === undefined &&
        regularVaccination.data.pending_prevision_amount === undefined &&
        regularEntry?.status === "paid" &&
        Number(regularEntry.amount) === 45.6,
      "vacina sem previsão preserva a criação normal do lançamento vinculado pago",
    );

    const costValidationAnimal = await dbA.animal.create({
      data: scoped({
        property_id: propertyA.id,
        ear_tag: "M17-VALIDA-CUSTO",
        sex: "female",
      }),
    });
    const costValidationVaccine = await dbA.vaccine.create({
      data: scoped({ name: "Vacina Validação Custo M17" }),
    });
    const vaccinationsBeforeInvalidCost = await dbA.animalVaccination.count({
      where: { animal_id: costValidationAnimal.id },
    });
    const negativeVaccination = await addVaccinationAction(dbA, {
      animal_id: costValidationAnimal.id,
      vaccine_id: costValidationVaccine.id,
      cost: -1,
    });
    const negativeVaccinationReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_vacina",
      parameters: {
        ear_tag: costValidationAnimal.ear_tag,
        vaccine_name: costValidationVaccine.name,
        cost: -2,
      },
      confirmed: false,
      explicitNo: false,
    });
    const vaccinationsAfterInvalidCost = await dbA.animalVaccination.count({
      where: { animal_id: costValidationAnimal.id },
    });
    const entriesAfterInvalidCost = await dbA.financialEntry.count({
      where: { related_module: "rebanho", related_id: costValidationAnimal.id },
    });
    assert(
      !negativeVaccination.ok &&
        negativeVaccination.code === "VALIDATION_ERROR" &&
        negativeVaccinationReply.action_taken ===
          "registrar_vacina:falhou:VALIDATION_ERROR" &&
        vaccinationsAfterInvalidCost === vaccinationsBeforeInvalidCost &&
        entriesAfterInvalidCost === 0,
      "vacinação negativa falha antes de qualquer write e o handler propaga o erro",
    );

    const zeroVaccination = await addVaccinationAction(dbA, {
      animal_id: costValidationAnimal.id,
      vaccine_id: costValidationVaccine.id,
      cost: 0,
    });
    const vaccinationsAfterZeroCost = await dbA.animalVaccination.count({
      where: { animal_id: costValidationAnimal.id },
    });
    const entriesAfterZeroCost = await dbA.financialEntry.count({
      where: { related_module: "rebanho", related_id: costValidationAnimal.id },
    });
    assert(
      zeroVaccination.ok &&
        vaccinationsAfterZeroCost === vaccinationsBeforeInvalidCost + 1 &&
        entriesAfterZeroCost === 0,
      "vacinação aceita custo zero sem criar lançamento vinculado",
    );

    const rollbackAnimal = await dbA.animal.create({
      data: scoped({
        property_id: propertyA.id,
        ear_tag: "M17-ROLLBACK-ATOMICO",
        sex: "male",
      }),
    });
    const rollbackVaccine = await dbA.vaccine.create({
      data: scoped({ name: "Vacina Rollback Atômico M17" }),
    });
    let rollbackErrorObserved = false;
    try {
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION m17_fail_linked_entry()
        RETURNS trigger AS $$
        BEGIN
          IF NEW.category = 'Vacinação - Vacina Rollback Atômico M17' THEN
            RAISE EXCEPTION 'm17 induced linked entry failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS m17_fail_linked_entry_trigger ON "FinancialEntry"`,
      );
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER m17_fail_linked_entry_trigger
        BEFORE INSERT ON "FinancialEntry"
        FOR EACH ROW EXECUTE FUNCTION m17_fail_linked_entry()
      `);
      try {
        await addVaccinationAction(dbA, {
          animal_id: rollbackAnimal.id,
          vaccine_id: rollbackVaccine.id,
          cost: 77,
        });
      } catch {
        rollbackErrorObserved = true;
      }
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS m17_fail_linked_entry_trigger ON "FinancialEntry"`,
      );
      await prisma.$executeRawUnsafe(
        `DROP FUNCTION IF EXISTS m17_fail_linked_entry()`,
      );
    }
    const rollbackVaccinations = await dbA.animalVaccination.count({
      where: { animal_id: rollbackAnimal.id },
    });
    const rollbackEntries = await dbA.financialEntry.count({
      where: { related_module: "rebanho", related_id: rollbackAnimal.id },
    });
    assert(
      rollbackErrorObserved &&
        rollbackVaccinations === 0 &&
        rollbackEntries === 0,
      "falha após criar vacinação reverte atomicamente vacinação e lançamento",
    );

    const missingCostReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: noCostAnimal.ear_tag,
        vaccine_name: noCostVaccine.name,
      },
      confirmed: false,
      explicitNo: false,
    });
    assert(
      missingCostReply.action_taken === "clarification_requested" &&
        missingCostReply.reply_text.includes("Qual o valor previsto"),
      "registrar_previsao_vacina pergunta o custo obrigatório ausente",
    );

    const missingDateAnimal = await dbA.animal.create({
      data: scoped({
        property_id: propertyA.id,
        ear_tag: "M17-SEM-DATA",
        sex: "female",
      }),
    });
    const missingDateVaccine = await dbA.vaccine.create({
      data: scoped({ name: "Vacina Sem Data M17" }),
    });
    const missingDateReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: missingDateAnimal.ear_tag,
        vaccine_name: missingDateVaccine.name,
        cost: 60,
      },
      confirmed: false,
      explicitNo: false,
    });
    const invalidDateReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: missingDateAnimal.ear_tag,
        vaccine_name: missingDateVaccine.name,
        cost: 60,
        due_date: "data-invalida",
      },
      confirmed: false,
      explicitNo: false,
    });
    const impossibleDateReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: missingDateAnimal.ear_tag,
        vaccine_name: missingDateVaccine.name,
        cost: 60,
        due_date: "2026-02-30",
      },
      confirmed: false,
      explicitNo: false,
    });
    assert(
      missingDateReply.action_taken === "clarification_requested" &&
        missingDateReply.reply_text.includes("Qual a data prevista"),
      "registrar_previsao_vacina pergunta a data quando não há parâmetro nem next_due_at",
    );
    assert(
      invalidDateReply.action_taken === "clarification_requested" &&
        invalidDateReply.reply_text.includes("Qual a data prevista"),
      "registrar_previsao_vacina rejeita due_date inválido e pergunta a data",
    );
    assert(
      impossibleDateReply.action_taken === "clarification_requested" &&
        impossibleDateReply.reply_text.includes("Qual a data prevista"),
      "registrar_previsao_vacina rejeita dia civil inexistente",
    );
    const zeroPrevisionReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: missingDateAnimal.ear_tag,
        vaccine_name: missingDateVaccine.name,
        cost: 0,
        due_date: addUtcCalendarDays(now, 4).toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    const negativePrevisionReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: missingDateAnimal.ear_tag,
        vaccine_name: missingDateVaccine.name,
        cost: -10,
        due_date: addUtcCalendarDays(now, 4).toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    const invalidCostPrevisions = await dbA.financialEntry.count({
      where: { related_id: `${missingDateAnimal.id}:${missingDateVaccine.id}` },
    });
    assert(
      zeroPrevisionReply.action_taken === "clarification_requested" &&
        zeroPrevisionReply.reply_text.includes("valor positivo") &&
        negativePrevisionReply.action_taken === "clarification_requested" &&
        negativePrevisionReply.reply_text.includes("valor positivo") &&
        invalidCostPrevisions === 0,
      "previsão exige custo positivo e não grava zero ou negativo",
    );

    const initialAlertDueDate = addUtcCalendarDays(now, 2);
    await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: missingDateAnimal.ear_tag,
        vaccine_name: missingDateVaccine.name,
        cost: 61,
        due_date: initialAlertDueDate.toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    const rescheduledEntry = await dbA.financialEntry.findFirst({
      where: {
        related_id: `${missingDateAnimal.id}:${missingDateVaccine.id}`,
        status: "pending",
      },
    });
    await generateAlertsForTenant(tenantA.id);
    const oldScheduleAlert = await dbA.alert.findFirst({
      where: {
        alert_type: "bill_due",
        related_module: "geral",
        related_id: rescheduledEntry!.id,
      },
    });
    assert(
      oldScheduleAlert?.status === "pending",
      "previsão inicial dentro da janela gera bill_due pendente",
    );
    const sentOldScheduleAlert = await dbA.alert.create({
      data: scoped({
        alert_type: "bill_due",
        related_module: "geral",
        related_id: rescheduledEntry!.id,
        message: "Alerta já enviado antes do reagendamento M17",
        status: "sent",
        scheduled_for: new Date(),
        sent_at: new Date(),
      }),
    });
    const dismissedOldScheduleAlert = await dbA.alert.create({
      data: scoped({
        alert_type: "bill_due",
        related_module: "geral",
        related_id: rescheduledEntry!.id,
        message: "Alerta já descartado antes do reagendamento M17",
        status: "dismissed",
        scheduled_for: new Date(),
      }),
    });
    await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: missingDateAnimal.ear_tag,
        vaccine_name: missingDateVaccine.name,
        cost: 61.5,
        due_date: initialAlertDueDate.toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    const alertsAfterAmountOnly = await dbA.alert.findMany({
      where: {
        id: {
          in: [
            oldScheduleAlert!.id,
            sentOldScheduleAlert.id,
            dismissedOldScheduleAlert.id,
          ],
        },
      },
      orderBy: { id: "asc" },
    });
    const pendingAfterAmountOnly = alertsAfterAmountOnly.find(
      (alert) => alert.id === oldScheduleAlert!.id,
    );
    const sentAfterAmountOnly = alertsAfterAmountOnly.find(
      (alert) => alert.id === sentOldScheduleAlert.id,
    );
    const dismissedAfterAmountOnly = alertsAfterAmountOnly.find(
      (alert) => alert.id === dismissedOldScheduleAlert.id,
    );
    assert(
      alertsAfterAmountOnly.length === 3 &&
        alertsAfterAmountOnly.every(
          (alert) => alert.related_id === rescheduledEntry!.id,
        ) &&
        alertsAfterAmountOnly.some(
          (alert) =>
            alert.id === oldScheduleAlert!.id && alert.status === "pending",
        ) &&
        alertsAfterAmountOnly.some(
          (alert) =>
            alert.id === sentOldScheduleAlert.id && alert.status === "sent",
      ),
      "atualização apenas de valor preserva chave e status dos bill_due existentes",
    );
    assert(
      pendingAfterAmountOnly !== undefined &&
        pendingAfterAmountOnly.message.startsWith(
          "💰 Conta a pagar: Vacinação prevista - Vacina Sem Data M17 (brinco M17-SEM-DATA) de R$ 61.50 vence em ",
        ) &&
        sentAfterAmountOnly?.message ===
          "Alerta já enviado antes do reagendamento M17" &&
        dismissedAfterAmountOnly?.message ===
          "Alerta já descartado antes do reagendamento M17",
      "atualização apenas de valor renova mensagem pending e preserva mensagens já finalizadas",
    );

    const rescheduledDueDate = addUtcCalendarDays(now, 7);
    await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: missingDateAnimal.ear_tag,
        vaccine_name: missingDateVaccine.name,
        cost: 62,
        due_date: rescheduledDueDate.toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    const entriesAfterReschedule = await dbA.financialEntry.findMany({
      where: { related_id: `${missingDateAnimal.id}:${missingDateVaccine.id}` },
    });
    const oldScheduleAlertAfter = await dbA.alert.findFirst({
      where: { id: oldScheduleAlert!.id },
    });
    const sentOldScheduleAlertAfter = await dbA.alert.findFirst({
      where: { id: sentOldScheduleAlert.id },
    });
    const dismissedOldScheduleAlertAfter = await dbA.alert.findFirst({
      where: { id: dismissedOldScheduleAlert.id },
    });
    assert(
      entriesAfterReschedule.length === 1 &&
        Number(entriesAfterReschedule[0]?.amount) === 62 &&
        entriesAfterReschedule[0]?.due_date?.toISOString() ===
          rescheduledDueDate.toISOString(),
      "reagendamento mantém uma única previsão e atualiza valor e data",
    );
    assert(
      oldScheduleAlertAfter?.related_id ===
        `${rescheduledEntry!.id}:superseded:${oldScheduleAlert!.id}` &&
        oldScheduleAlertAfter.status === "dismissed",
      "reagendamento preserva o bill_due antigo fora da chave ativa e descarta o pendente",
    );
    assert(
      sentOldScheduleAlertAfter?.related_id ===
        `${rescheduledEntry!.id}:superseded:${sentOldScheduleAlert.id}` &&
        sentOldScheduleAlertAfter.status === "sent" &&
        dismissedOldScheduleAlertAfter?.related_id ===
          `${rescheduledEntry!.id}:superseded:${dismissedOldScheduleAlert.id}` &&
        dismissedOldScheduleAlertAfter.status === "dismissed",
      "reagendamento preserva os status sent e dismissed dos alertas auditáveis",
    );

    await dbA.financialEntry.update({
      where: { id: rescheduledEntry!.id },
      data: { due_date: addUtcCalendarDays(now, 2) },
    });
    await generateAlertsForTenant(tenantA.id);
    const newScheduleAlert = await dbA.alert.findFirst({
      where: {
        alert_type: "bill_due",
        related_module: "geral",
        related_id: rescheduledEntry!.id,
      },
    });
    assert(
      newScheduleAlert !== null &&
        newScheduleAlert.id !== oldScheduleAlert?.id &&
        newScheduleAlert.status === "pending",
      "cron cria novo bill_due na chave original quando a previsão reagendada entra na janela",
    );

    const raceAnimal = await dbA.animal.create({
      data: scoped({
        property_id: propertyA.id,
        ear_tag: "M17-RACE-CRON",
        sex: "female",
      }),
    });
    const raceVaccine = await dbA.vaccine.create({
      data: scoped({ name: "Vacina Race Cron M17" }),
    });
    const raceOldDueDate = addUtcCalendarDays(now, 2);
    await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: raceAnimal.ear_tag,
        vaccine_name: raceVaccine.name,
        cost: 83,
        due_date: raceOldDueDate.toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    const raceEntry = await dbA.financialEntry.findFirst({
      where: { related_id: `${raceAnimal.id}:${raceVaccine.id}` },
    });
    let signalEligibleRead!: () => void;
    let releaseAlertCreation!: () => void;
    const eligibleRead = new Promise<void>((resolve) => {
      signalEligibleRead = resolve;
    });
    const creationRelease = new Promise<void>((resolve) => {
      releaseAlertCreation = resolve;
    });
    const oldBillLimit = new Date(now.getTime() + 3 * 86_400_000);
    const racingAlert = ensureBillDueAlertForEntry(dbA, raceEntry!.id, {
      now,
      billLimit: oldBillLimit,
      afterEligibleRead: async () => {
        signalEligibleRead();
        await creationRelease;
      },
    });
    await eligibleRead;
    const raceNewDueDate = addUtcCalendarDays(now, 8);
    const racingRearm = routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: raceAnimal.ear_tag,
        vaccine_name: raceVaccine.name,
        cost: 84,
        due_date: raceNewDueDate.toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    await racingRearm;
    releaseAlertCreation();
    const racingAlertCreated = await racingAlert;
    const raceEntryAfter = await dbA.financialEntry.findFirst({
      where: { id: raceEntry!.id },
    });
    const raceActiveStaleAlert = await dbA.alert.findFirst({
      where: { alert_type: "bill_due", related_id: raceEntry!.id },
    });
    const raceSupersededAlert = await dbA.alert.findFirst({
      where: {
        alert_type: "bill_due",
        related_id: { startsWith: `${raceEntry!.id}:superseded:` },
      },
    });
    assert(
      racingAlertCreated === false &&
        raceEntryAfter?.due_date?.toISOString() ===
          raceNewDueDate.toISOString() &&
        raceActiveStaleAlert === null &&
        raceSupersededAlert === null,
      "cron em conflito relê reagendamento fora da janela sem criar ou superseder alerta",
    );
    await dbA.financialEntry.update({
      where: { id: raceEntry!.id },
      data: { due_date: addUtcCalendarDays(now, 2) },
    });
    await generateAlertsForTenant(tenantA.id);
    const raceFreshAlert = await dbA.alert.findFirst({
      where: { alert_type: "bill_due", related_id: raceEntry!.id },
    });
    assert(
      raceFreshAlert?.status === "pending" &&
        raceFreshAlert.message.includes("R$ 84.00"),
      "nova data na janela cria bill_due correto após corrida serializada",
    );

    const concurrentAnimal = await dbA.animal.create({
      data: scoped({
        property_id: propertyA.id,
        ear_tag: "M17-CONCORRENTE",
        sex: "male",
      }),
    });
    const concurrentVaccine = await dbA.vaccine.create({
      data: scoped({ name: "Vacina Concorrente M17" }),
    });
    const concurrentRelatedId = `${concurrentAnimal.id}:${concurrentVaccine.id}`;
    const concurrentSentinelB = await dbB.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Sentinela concorrente tenant B M17",
        amount: 999,
        related_module: "geral",
        related_id: concurrentRelatedId,
        due_date: addUtcCalendarDays(now, 9),
        status: "pending",
      }),
    });
    const concurrentDueDate = addUtcCalendarDays(now, 9);
    const concurrentReplies = await Promise.all([
      routeIntent(dbA, {
        tenant_id: tenantA.id,
        role: "OWNER",
        activeProfiles: ["fazenda"],
        intent: "registrar_previsao_vacina",
        parameters: {
          ear_tag: concurrentAnimal.ear_tag,
          vaccine_name: concurrentVaccine.name,
          cost: 101,
          due_date: concurrentDueDate.toISOString(),
        },
        confirmed: false,
        explicitNo: false,
      }),
      routeIntent(dbA, {
        tenant_id: tenantA.id,
        role: "OWNER",
        activeProfiles: ["fazenda"],
        intent: "registrar_previsao_vacina",
        parameters: {
          ear_tag: concurrentAnimal.ear_tag,
          vaccine_name: concurrentVaccine.name,
          cost: 102,
          due_date: concurrentDueDate.toISOString(),
        },
        confirmed: false,
        explicitNo: false,
      }),
    ]);
    const concurrentEntriesA = await dbA.financialEntry.findMany({
      where: {
        related_id: concurrentRelatedId,
        entry_type: "expense",
        status: "pending",
      },
    });
    const concurrentSentinelBAfter = await dbB.financialEntry.findFirst({
      where: { id: concurrentSentinelB.id },
    });
    assert(
      concurrentReplies.every(
        (reply) =>
          reply.action_taken.startsWith("registrar_previsao_vacina:") &&
          !reply.requires_confirmation,
      ) && concurrentEntriesA.length === 1,
      "duas entregas simultâneas concluem e mantêm uma única previsão pending",
    );
    assert(
      concurrentSentinelBAfter?.status === "pending" &&
        Number(concurrentSentinelBAfter.amount) === 999,
      "transação concorrente permanece escopada e não atualiza a mesma chave no tenant B",
    );

    const deniedByRole = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "VISUALIZADOR",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: missingDateAnimal.ear_tag,
        vaccine_name: missingDateVaccine.name,
        cost: 60,
        due_date: addUtcCalendarDays(now, 5).toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    const deniedByProfile = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["prestador"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: missingDateAnimal.ear_tag,
        vaccine_name: missingDateVaccine.name,
        cost: 60,
        due_date: addUtcCalendarDays(now, 5).toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    assert(
      deniedByRole.action_taken === "registrar_previsao_vacina:sem_permissao",
      "registrar_previsao_vacina exige escrita no módulo financeiro",
    );
    assert(
      deniedByProfile.action_taken === "registrar_previsao_vacina:perfil_inativo",
      "registrar_previsao_vacina exige perfil fazenda",
    );

    const isolatedIntentReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: isolatedAnimal.ear_tag,
        vaccine_name: isolatedVaccine.name,
        cost: 70,
        due_date: addUtcCalendarDays(now, 5).toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    assert(
      isolatedIntentReply.action_taken === "clarification_requested" &&
        isolatedIntentReply.reply_text.includes(
          `Não encontrei nenhum animal com o brinco '${isolatedAnimal.ear_tag}'`,
        ),
      "registrar_previsao_vacina não resolve animal de outro tenant",
    );

    assert(
      createdPrevisionReply.reply_text.includes("Vou te lembrar 3 dias antes."),
      "previsão com data civil distante inclui a promessa de lembrete",
    );
    const nearDueDate = addUtcCalendarDays(now, 2);
    const nearDueReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: previsionAnimal.ear_tag,
        vaccine_name: previsionVaccine.name,
        cost: 25,
        due_date: nearDueDate.toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    const nearDueEntry = await dbA.financialEntry.findFirst({
      where: {
        related_id: `${previsionAnimal.id}:${previsionVaccine.id}`,
        status: "pending",
      },
    });
    assert(
      !nearDueReply.reply_text.includes("Vou te lembrar 3 dias antes."),
      "previsão a menos de 3 dias omite a promessa de lembrete",
    );
    assert(nearDueEntry !== null, "previsão próxima permanece persistida");

    const alertsBefore = await dbA.alert.count({
      where: {
        alert_type: "bill_due",
        related_module: "geral",
        related_id: nearDueEntry!.id,
      },
    });
    await generateAlertsForTenant(tenantA.id);
    const alertsAfter = await dbA.alert.count({
      where: {
        alert_type: "bill_due",
        related_module: "geral",
        related_id: nearDueEntry!.id,
      },
    });
    assert(
      alertsBefore === 0 && alertsAfter === 1,
      "previsão pending dentro de 3 dias gera bill_due local sem envio de canais",
    );

    const todayReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: previsionAnimal.ear_tag,
        vaccine_name: previsionVaccine.name,
        cost: 25,
        due_date: dueToday.toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    const overdueReply = await routeIntent(dbA, {
      tenant_id: tenantA.id,
      role: "OWNER",
      activeProfiles: ["fazenda"],
      intent: "registrar_previsao_vacina",
      parameters: {
        ear_tag: previsionAnimal.ear_tag,
        vaccine_name: previsionVaccine.name,
        cost: 25,
        due_date: overdueDate.toISOString(),
      },
      confirmed: false,
      explicitNo: false,
    });
    assert(
      !todayReply.reply_text.includes("Vou te lembrar 3 dias antes.") &&
        !overdueReply.reply_text.includes("Vou te lembrar 3 dias antes."),
      "previsão de hoje ou vencida omite a promessa de lembrete",
    );
  } finally {
    if (tenantIds.length > 0) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
  }

  console.log("");
  if (failures === 0) {
    console.log("✅ Módulo 17: 0 falhas.");
  } else {
    console.error(`❌ Módulo 17: ${failures} falha(s).`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (error) => {
    console.error("❌ Erro inesperado:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
