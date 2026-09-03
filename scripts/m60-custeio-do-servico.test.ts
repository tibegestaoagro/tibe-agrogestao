import "dotenv/config";
import { exigirBancoLocal, exigirRedisLocal } from "./_banco-local";

exigirBancoLocal();
exigirRedisLocal();

/**
 * Módulo 34, fase 2: o custeio do serviço com máquinas.
 *
 * Prova, por seção do documento de Máquinas:
 *   1. §19 e §20: o serviço que dura vários dias, e a produção acrescentada.
 *
 * ⚠️ A `m58` e a `m59` cobrem o mesmo arquivo e têm que continuar verdes.
 *
 * Roda: `npm run test:m60`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🔧 M60: custeio do serviço (Módulo 34, fase 2)\n");

async function main() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const {
    createServiceJob,
    addServiceJobLog,
    getServiceJobDetail,
    setServiceJobStatus,
    cancelServiceJob,
  } = await import("@/lib/actions/service-jobs");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M60 ${stamp}`, document: `M60${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M60" }) });
    const trator = await db.machine.create({
      data: scoped({
        property_id: fazenda.id,
        name: "Trator Massey",
        type: "Trator",
        hour_meter: 1250,
      }),
    });

    console.log("1. §19: o serviço de três dias, 5 + 7 + 4 = 16 horas");
    const servico = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Gradagem",
      pricing: "hora",
      unit_price: 150,
      quantity: 5,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!servico.ok) throw new Error("createServiceJob falhou");
    check("dia 1: 5 horas", servico.data.quantidade === 5, String(servico.data.quantidade));

    const dia2 = await addServiceJobLog(db, {
      service_job_id: servico.data.id,
      quantity: 7,
      occurred_at: new Date("2026-09-02T12:00:00.000Z"),
    });
    check("dia 2 aceito", dia2.ok, dia2.ok ? "" : dia2.message);
    const dia3 = await addServiceJobLog(db, {
      service_job_id: servico.data.id,
      quantity: 4,
      occurred_at: new Date("2026-09-03T12:00:00.000Z"),
    });
    check("dia 3 aceito", dia3.ok, dia3.ok ? "" : dia3.message);

    check(
      "total trabalhado: 16 horas, o número literal do §19",
      dia3.ok && dia3.data.quantidade === 16,
      dia3.ok ? String(dia3.data.quantidade) : "recusado",
    );
    check(
      "e o total em dinheiro acompanha: 16 x 150 = 2.400",
      dia3.ok && dia3.data.total === 2400,
      dia3.ok ? String(dia3.data.total) : "recusado",
    );

    /**
     * ⚠️ O CASO QUE DISCRIMINA: o §19 diz em letra que "o produtor não deverá
     * criar três serviços diferentes". Uma implementação que criasse um serviço
     * por dia daria os mesmos 16 na soma de uma listagem, e a ficha do §22
     * mostraria três contas a receber de 750, 1.050 e 600 em vez de uma de
     * 2.400. Por isso o teste cobra UM serviço e TRÊS logs.
     */
    check(
      "um serviço só, com três lançamentos de quantidade",
      (await db.serviceJob.count()) === 1 &&
        (await db.serviceJobLog.count({ where: { service_job_id: servico.data.id } })) === 3,
      `${await db.serviceJob.count()} serviços`,
    );

    const detalhe = await getServiceJobDetail(db, servico.data.id);
    check(
      "e a conta a receber acompanhou o total",
      detalhe.ok && detalhe.data.a_receber === 2400,
      detalhe.ok ? String(detalhe.data.a_receber) : "recusado",
    );

    console.log("\n2. §33: o horímetro calcula as horas, e alimenta a máquina");
    const comHorimetro = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-04T12:00:00.000Z"),
      description: "Aração",
      pricing: "hora",
      unit_price: 200,
      quantity: 1,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!comHorimetro.ok) throw new Error("createServiceJob falhou");

    const leitura = await addServiceJobLog(db, {
      service_job_id: comHorimetro.data.id,
      hour_meter_start: 1250,
      hour_meter_end: 1258,
    });
    check("aceito", leitura.ok, leitura.ok ? "" : leitura.message);
    check(
      "1.250 para 1.258 dá 8 horas, o exemplo literal do §33",
      leitura.ok && leitura.data.horas === 8,
      leitura.ok ? String(leitura.data.horas) : "recusado",
    );
    check(
      "e as 8 horas viraram quantidade (1 do cadastro + 8)",
      leitura.ok && leitura.data.quantidade === 9,
      leitura.ok ? String(leitura.data.quantidade) : "recusado",
    );
    check(
      "o horímetro da MÁQUINA foi para 1.258 (decisão 19)",
      Number((await db.machine.findUnique({ where: { id: trator.id } }))?.hour_meter) === 1258,
      String((await db.machine.findUnique({ where: { id: trator.id } }))?.hour_meter),
    );

    console.log("   e as três recusas do horímetro");
    const invertido = await addServiceJobLog(db, {
      service_job_id: comHorimetro.data.id,
      hour_meter_start: 1300,
      hour_meter_end: 1290,
    });
    check(
      "final menor que o inicial é recusado no campo",
      !invertido.ok && invertido.field === "hour_meter_end",
      !invertido.ok ? String(invertido.field) : "aceitou",
    );

    const ambos = await addServiceJobLog(db, {
      service_job_id: comHorimetro.data.id,
      hour_meter_start: 1258,
      hour_meter_end: 1262,
      quantity: 99,
    });
    check(
      "horímetro E quantidade juntos é recusado",
      !ambos.ok && ambos.field === "quantity",
      !ambos.ok ? String(ambos.field) : "aceitou",
    );

    /**
     * ⚠️ O horímetro NÃO ANDA PARA TRÁS. Um serviço lançado fora de ordem
     * (a leitura de ontem digitada hoje) faria a máquina voltar de 1.258 para
     * 1.254, e o §34 passaria a dizer que faltam mais horas para a manutenção
     * do que realmente faltam.
     */
    await addServiceJobLog(db, {
      service_job_id: comHorimetro.data.id,
      hour_meter_start: 1250,
      hour_meter_end: 1254,
    });
    check(
      "e uma leitura antiga não faz a máquina voltar",
      Number((await db.machine.findUnique({ where: { id: trator.id } }))?.hour_meter) === 1258,
      String((await db.machine.findUnique({ where: { id: trator.id } }))?.hour_meter),
    );

    console.log("   e o valor fechado recusa quantidade");
    const empreito = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-05T12:00:00.000Z"),
      description: "Terraplanagem",
      pricing: "fechado",
      agreed_amount: 9000,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    const noEmpreito = await addServiceJobLog(db, {
      service_job_id: empreito.ok ? empreito.data.id : "",
      quantity: 3,
    });
    check("recusado no empreito (§16)", !noEmpreito.ok, "aceitou");

    console.log("\n3. §42: começar e terminar o serviço");
    const doFluxo = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      description: "Subsolagem",
      pricing: "hectare",
      unit_price: 300,
      quantity: 10,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!doFluxo.ok) throw new Error("createServiceJob falhou");
    check("marcado para depois de amanhã, nasce agendado", doFluxo.data.status === "agendado");

    const comecou = await setServiceJobStatus(db, {
      service_job_id: doFluxo.data.id,
      status: "em_andamento",
    });
    check("'comecei hoje' põe em andamento", comecou.ok && comecou.data.status === "em_andamento",
      comecou.ok ? comecou.data.status : "recusado");

    const terminou = await setServiceJobStatus(db, {
      service_job_id: doFluxo.data.id,
      status: "concluido",
    });
    check("'terminei' conclui", terminou.ok && terminou.data.status === "concluido",
      terminou.ok ? terminou.data.status : "recusado");
    check(
      "e devolve o que o §42 manda mostrar: quantidade, total e o que falta receber",
      terminou.ok &&
        terminou.data.quantidade === 10 &&
        terminou.data.total === 3000 &&
        terminou.data.a_receber === 3000,
      terminou.ok
        ? `${terminou.data.quantidade} / ${terminou.data.total} / ${terminou.data.a_receber}`
        : "recusado",
    );

    /**
     * ⚠️ Concluir NÃO mexe no dinheiro. O §42 pergunta "o João já pagou?"
     * DEPOIS de mostrar o resumo, e a resposta é outro passo. Um `concluido`
     * que quitasse sozinho inventaria um recebimento que não aconteceu, e o
     * produtor descobriria no fim do mês, com a conta a receber zerada.
     */
    check(
      "e a conta a receber continua aberta",
      (await db.financialEntry.count({
        where: { related_module: "servico", related_id: doFluxo.data.id, status: "pending" },
      })) === 1,
    );

    const cancelado = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 100,
      quantity: 2,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    await cancelServiceJob(db, { service_job_id: cancelado.ok ? cancelado.data.id : "" });
    const reabrir = await setServiceJobStatus(db, {
      service_job_id: cancelado.ok ? cancelado.data.id : "",
      status: "em_andamento",
    });
    check("serviço cancelado não volta a andar", !reabrir.ok, "aceitou");

    console.log("\n4. §23 e §24: o custo do serviço, e o que ele NÃO mexe");
    const { recordServiceCost, getServiceCosts, cancelServiceCost } = await import(
      "@/lib/actions/service-costs"
    );

    const comCusto = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-06T12:00:00.000Z"),
      description: "Ensilagem",
      pricing: "hectare",
      unit_price: 300,
      quantity: 15,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!comCusto.ok) throw new Error("createServiceJob falhou");
    check("receita de 4.500", comCusto.data.total === 4500, String(comCusto.data.total));

    const operador = await recordServiceCost(db, {
      service_job_id: comCusto.data.id,
      kind: "mao_de_obra",
      description: "Diária do operador",
      amount: 600,
      saiu_do_caixa: true,
    });
    check("custo de operador aceito", operador.ok, operador.ok ? "" : operador.message);
    check("e gerou lançamento", operador.ok && operador.data.gerou_lancamento);

    const pedagio = await recordServiceCost(db, {
      service_job_id: comCusto.data.id,
      kind: "pedagio",
      description: "Pedágio da estrada",
      amount: 200,
      saiu_do_caixa: false,
    });
    check("custo sem saída de caixa aceito", pedagio.ok);
    check("e NÃO gerou lançamento", pedagio.ok && !pedagio.data.gerou_lancamento);

    const custos = await getServiceCosts(db, comCusto.data.id);
    check("dois custos somando 800", custos.total === 800, String(custos.total));
    check(
      "separados por natureza",
      custos.por_natureza.mao_de_obra === 600 && custos.por_natureza.pedagio === 200,
      JSON.stringify(custos.por_natureza),
    );

    /**
     * ⚠️ O CASO QUE DISCRIMINA A FASE INTEIRA, e o motivo da decisão 17.
     *
     * O lançamento do custo aponta para o CUSTO, nunca para o serviço. Se
     * apontasse para o serviço, `serializar` somaria os R$ 600 do operador
     * dentro de `pago`, e a ficha diria "RECEBIDO R$ 600" num serviço em que o
     * João não pagou nada. O produtor cobraria R$ 3.900 de quem devia R$ 4.500.
     *
     * Por isso o teste cobra os três números do serviço DEPOIS de lançar custo.
     */
    const fichaDepois = await getServiceJobDetail(db, comCusto.data.id);
    check(
      "o custo não vira recebimento: recebido continua 0",
      fichaDepois.ok && fichaDepois.data.recebido === 0,
      fichaDepois.ok ? String(fichaDepois.data.recebido) : "recusado",
    );
    check(
      "e a receber continua 4.500",
      fichaDepois.ok && fichaDepois.data.a_receber === 4500,
      fichaDepois.ok ? String(fichaDepois.data.a_receber) : "recusado",
    );
    check(
      "e o lançamento do custo aponta para o CUSTO, não para o serviço",
      (await db.financialEntry.count({
        where: { related_module: "servico", related_id: operador.ok ? operador.data.id : "" },
      })) === 1,
    );

    console.log("   e o cancelamento");
    const antesDoCancel = (await getServiceCosts(db, comCusto.data.id)).total;
    await cancelServiceCost(db, { cost_id: pedagio.ok ? pedagio.data.id : "" });
    const depoisDoCancel = await getServiceCosts(db, comCusto.data.id);
    check(
      "custo cancelado sai da soma",
      antesDoCancel === 800 && depoisDoCancel.total === 600,
      `${antesDoCancel} -> ${depoisDoCancel.total}`,
    );
    check(
      "mas continua no histórico, marcado",
      depoisDoCancel.linhas.some((l) => l.canceled_at !== null),
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M60 verde" : `\n❌ M60: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
