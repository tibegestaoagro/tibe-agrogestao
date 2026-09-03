import "dotenv/config";
import { exigirBancoLocal, exigirRedisLocal } from "./_banco-local";

exigirBancoLocal();
exigirRedisLocal();

/**
 * Módulo 34, fase 2: o custeio do serviço com máquinas.
 *
 * Prova, por seção do documento de Máquinas:
 *   1. §19 e §20: o serviço que dura vários dias, e a produção acrescentada.
 *   8. §42 pelo WhatsApp: as quatro conversas novas (iniciar, produção,
 *      combustível, encerrar), com o serviço que nunca é escolhido em
 *      silêncio quando há mais de um em andamento.
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

    console.log("\n5. §21, §22 e §35: 80 litros de diesel a R$ 6,00");
    const { recordServiceFuel } = await import("@/lib/actions/service-costs");
    const { getStockBalance, recordStockMovement } = await import("@/lib/actions/stock-ledger");

    const categoria = await db.productCategory.create({
      data: scoped({ name: "Combustíveis" }),
    });
    const diesel = await db.product.create({
      data: scoped({ category_id: categoria.id, name: "Diesel S10", unit: "litro" }),
    });
    await recordStockMovement(db, {
      product_id: diesel.id,
      property_id: fazenda.id,
      movement_type: "compra",
      quantity: 500,
    });
    const saldoAntes = (await getStockBalance(db, { product_id: diesel.id }))[0];
    check("500 litros no estoque", Number(saldoAntes?.quantity) === 500, String(saldoAntes?.quantity));

    const combustivel = await recordServiceFuel(db, {
      service_job_id: comCusto.data.id,
      product_id: diesel.id,
      quantity: 80,
      unit_price: 6,
    });
    check("aceito", combustivel.ok, combustivel.ok ? "" : combustivel.message);
    check(
      "custo de R$ 480, o número literal do §22",
      combustivel.ok && combustivel.data.amount === 480,
      combustivel.ok ? String(combustivel.data.amount) : "recusado",
    );
    check(
      "o estoque caiu para 420 litros (§35)",
      combustivel.ok && combustivel.data.saldo_do_produto === 420,
      combustivel.ok ? String(combustivel.data.saldo_do_produto) : "recusado",
    );
    check(
      "e a movimentação aponta para o serviço",
      (await db.stockMovement.count({
        where: { service_job_id: comCusto.data.id, movement_type: "utilizacao" },
      })) === 1,
    );

    /**
     * ⚠️ E o combustível NÃO gera despesa, que é a decisão 17 em ação. O
     * diesel virou despesa quando foi COMPRADO: um lançamento aqui faria o
     * mesmo dinheiro aparecer duas vezes no DRE do mês, e o produtor veria
     * R$ 3.480 de diesel num mês em que saíram R$ 3.000.
     */
    check(
      "e NÃO gerou lançamento financeiro",
      combustivel.ok && !combustivel.data.gerou_lancamento,
    );

    console.log("   e o §21 literal: 'SE o diesel existir no estoque'");
    const semEstoque = await recordServiceFuel(db, {
      service_job_id: comCusto.data.id,
      description: "Diesel comprado no posto",
      quantity: 40,
      unit: "litro",
      unit_price: 6.5,
    });
    check("sem produto cadastrado, o custo entra assim mesmo", semEstoque.ok,
      semEstoque.ok ? "" : semEstoque.message);
    check(
      "com o valor calculado, e sem baixa de estoque",
      semEstoque.ok && semEstoque.data.amount === 260 && !semEstoque.data.baixou_estoque,
      semEstoque.ok ? `${semEstoque.data.amount} / ${semEstoque.data.baixou_estoque}` : "recusado",
    );

    console.log("   e o §22 é OPCIONAL: sem valor, só a quantidade");
    const semValor = await recordServiceFuel(db, {
      service_job_id: comCusto.data.id,
      product_id: diesel.id,
      quantity: 20,
    });
    check("aceito sem valor", semValor.ok, semValor.ok ? "" : semValor.message);
    check("custo nulo, não zero", semValor.ok && semValor.data.amount === null,
      semValor.ok ? String(semValor.data.amount) : "recusado");
    check(
      "mas o estoque caiu do mesmo jeito, para 400",
      semValor.ok && semValor.data.saldo_do_produto === 400,
      semValor.ok ? String(semValor.data.saldo_do_produto) : "recusado",
    );

    console.log("\n6. §25: receita 4.500, custo 1.600, resultado 2.900");
    const paraOResultado = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-07T12:00:00.000Z"),
      description: "Ensilagem do §25",
      pricing: "hectare",
      unit_price: 300,
      quantity: 15,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!paraOResultado.ok) throw new Error("createServiceJob falhou");

    await recordServiceCost(db, {
      service_job_id: paraOResultado.data.id,
      kind: "combustivel",
      description: "Diesel",
      amount: 800,
    });
    await recordServiceCost(db, {
      service_job_id: paraOResultado.data.id,
      kind: "mao_de_obra",
      description: "Operador",
      amount: 600,
    });
    await recordServiceCost(db, {
      service_job_id: paraOResultado.data.id,
      kind: "outro",
      description: "Outros",
      amount: 200,
    });

    const comResultado = await getServiceJobDetail(db, paraOResultado.data.id);
    check("receita 4.500", comResultado.ok && comResultado.data.total === 4500,
      comResultado.ok ? String(comResultado.data.total) : "recusado");
    check("custo registrado 1.600", comResultado.ok && comResultado.data.custo_total === 1600,
      comResultado.ok ? String(comResultado.data.custo_total) : "recusado");
    check("resultado simples 2.900", comResultado.ok && comResultado.data.resultado === 2900,
      comResultado.ok ? String(comResultado.data.resultado) : "recusado");

    /**
     * ⚠️ O resultado é do SERVIÇO, e o serviço contratado também tem um: ele é
     * NEGATIVO, porque um serviço que a fazenda contratou não tem receita. Uma
     * implementação que só calculasse para o prestado deixaria a ficha do
     * contratado com um campo em branco no lugar de um número verdadeiro.
     */
    const contratadoComCusto = await createServiceJob(db, {
      direction: "contratado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-07T12:00:00.000Z"),
      description: "Roçada contratada",
      pricing: "fechado",
      agreed_amount: 1000,
    });
    await recordServiceCost(db, {
      service_job_id: contratadoComCusto.ok ? contratadoComCusto.data.id : "",
      kind: "pedagio",
      description: "Pedágio",
      amount: 50,
    });
    const fichaContratado = await getServiceJobDetail(
      db,
      contratadoComCusto.ok ? contratadoComCusto.data.id : "",
    );
    check(
      "no contratado o resultado é negativo: 1.000 de custo mais 50",
      fichaContratado.ok && fichaContratado.data.resultado === -1050,
      fichaContratado.ok ? String(fichaContratado.data.resultado) : "recusado",
    );

    console.log("\n7. §41: o resumo do mês");
    const { getServicesSummary } = await import("@/lib/actions/machine-services");
    const resumo = await getServicesSummary(db, {
      de: new Date("2026-09-01T00:00:00.000Z"),
      ate: new Date("2026-09-30T23:59:59.999Z"),
    });
    check("conta os serviços do período", resumo.servicos > 0, String(resumo.servicos));
    check(
      "soma as horas e os hectares SEPARADOS, como o §32",
      typeof resumo.quantidade_por_unidade.hora === "number" &&
        typeof resumo.quantidade_por_unidade.hectare === "number",
      JSON.stringify(resumo.quantidade_por_unidade),
    );
    check(
      "e os três números do dinheiro fecham: valor = recebido + a receber",
      Math.abs(resumo.valor - (resumo.recebido + resumo.a_receber)) < 0.01,
      `${resumo.valor} = ${resumo.recebido} + ${resumo.a_receber}`,
    );

    /**
     * ⚠️ O resumo é do PRESTADO. O §41 diz "Valor dos serviços / Recebido / A
     * receber", e "recebido" não significa nada num serviço que a fazenda
     * contratou: ali o dinheiro sai. Misturar as duas direções faria a despesa
     * de um serviço contratado aparecer como faturamento do mês.
     */
    const soPrestado = await db.serviceJob.count({
      where: {
        direction: "prestado",
        canceled_at: null,
        occurred_at: {
          gte: new Date("2026-09-01T00:00:00.000Z"),
          lte: new Date("2026-09-30T23:59:59.999Z"),
        },
      },
    });
    check(
      "e o contratado NÃO entra na conta",
      resumo.servicos === soPrestado,
      `${resumo.servicos} no resumo, ${soPrestado} prestados`,
    );

    console.log("\n8. §42 pelo WhatsApp: as quatro conversas novas");
    const { routeIntent } = await import("@/lib/actions/whatsapp-router");
    // Usuário de VERDADE, não uma string qualquer: `registrar_combustivel_servico`
    // grava `recorded_by_user_id` no `StockMovement`, que é FK para `User`.
    const usuarioBloco8 = await prisma.user.create({
      data: {
        tenant_id: tenant.id,
        name: "Produtor M60",
        email: `m60-bloco8-${stamp}@teste.local`,
        password_hash: "x",
        role: "OWNER",
      },
    });
    const USER = usuarioBloco8.id;

    /**
     * ESTADO LIMPO PRIMEIRO. Os blocos 1 a 7 deixaram vários serviços PRESTADOS
     * "agendado" (as datas fixas do fixture, 2026-09-04 a 09-07, caem no futuro
     * em relação à data de hoje quando este arquivo roda perto do começo do
     * mês). `resolverServicoEmAndamento` enxerga QUALQUER prestado agendado ou
     * em andamento, e sem esta limpeza os testes de "exatamente um" e
     * "exatamente dois" deste bloco ficariam reféns da data em que a suíte
     * roda. Concluir não mexe em dinheiro (nenhum destes tem pagamento
     * pendente afetado por isso).
     */
    const abertosAntesDoBloco8 = await db.serviceJob.findMany({
      where: { direction: "prestado", canceled_at: null, status: { in: ["agendado", "em_andamento"] } },
      select: { id: true },
    });
    for (const j of abertosAntesDoBloco8) {
      await setServiceJobStatus(db, { service_job_id: j.id, status: "concluido" });
    }

    const falar = (
      intent: string,
      parameters: Record<string, unknown>,
      extra: { confirmed?: boolean; explicitNo?: boolean } = {},
    ) =>
      routeIntent(db, {
        intent: intent as never,
        tenant_id: tenant.id,
        role: "OWNER",
        activeProfiles: ["fazenda"],
        parameters,
        confirmed: extra.confirmed ?? false,
        explicitNo: extra.explicitNo ?? false,
        user_id: USER,
      });

    // UM serviço prestado em andamento, para os casos 1, 3 e 4.
    const servicoA = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-08T12:00:00.000Z"),
      description: "Gradagem",
      pricing: "hectare",
      unit_price: 300,
      quantity: 5,
      machine_id: trator.id,
      contact_name: "João Vizinho",
    });
    if (!servicoA.ok) throw new Error("createServiceJob falhou");
    await setServiceJobStatus(db, { service_job_id: servicoA.data.id, status: "em_andamento" });

    console.log("\n   4. \"não\" cancela nos quatro, e NADA é gravado (a regra 1 do arquivo)");
    const logsAntesDoCancel = await db.serviceJobLog.count();
    const custosAntesDoCancel = await db.serviceJobCost.count();
    for (const intentName of [
      "iniciar_servico",
      "registrar_producao_servico",
      "registrar_combustivel_servico",
      "encerrar_servico",
    ]) {
      const recusado = await falar(intentName, {}, { explicitNo: true });
      check(
        `"${intentName}" cancela`,
        recusado.action_taken === `${intentName}:cancelado`,
        recusado.action_taken,
      );
    }
    check(
      "e nada foi gravado, nem o status mudou",
      (await db.serviceJobLog.count()) === logsAntesDoCancel &&
        (await db.serviceJobCost.count()) === custosAntesDoCancel &&
        (await db.serviceJob.findUnique({ where: { id: servicoA.data.id } }))?.status ===
          "em_andamento",
    );

    console.log("\n   1. \"Fiz 8 hectares hoje\" com UM serviço em andamento");
    const p1 = await falar("registrar_producao_servico", {});
    check(
      "sem quantidade, pergunta quanto foi feito",
      p1.action_taken === "clarification_requested",
      p1.action_taken,
    );

    const p2 = await falar("registrar_producao_servico", { quantidade: 8 });
    check(
      "confirma mostrando 'acrescentar 8 hectares ao serviço de gradagem de João Vizinho'",
      p2.requires_confirmation === true &&
        p2.reply_text.includes("8 hectares") &&
        p2.reply_text.toLowerCase().includes("gradagem de joão vizinho"),
      p2.reply_text,
    );

    const p3 = await falar("registrar_producao_servico", {}, { confirmed: true });
    check(
      "o sim soma via addServiceJobLog",
      p3.action_taken === "registrar_producao_servico:ok",
      p3.action_taken,
    );
    check(
      "dois logs agora (o da criação + o novo)",
      (await db.serviceJobLog.count({ where: { service_job_id: servicoA.data.id } })) === 2,
    );
    const servicoADepois = await getServiceJobDetail(db, servicoA.data.id);
    check(
      "13 hectares (5 + 8), 3.900",
      servicoADepois.ok && servicoADepois.data.quantidade === 13 && servicoADepois.data.total === 3900,
      servicoADepois.ok ? `${servicoADepois.data.quantidade} / ${servicoADepois.data.total}` : "recusado",
    );

    console.log(
      "\n   2. DOIS serviços em andamento e NENHUM nome: PERGUNTA (o caso que discrimina a tarefa)",
    );
    const servicoB = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-08T12:00:00.000Z"),
      description: "Aração",
      pricing: "hora",
      unit_price: 100,
      quantity: 2,
      machine_id: trator.id,
      contact_name: "Maria Fazendeira",
    });
    if (!servicoB.ok) throw new Error("createServiceJob falhou");
    await setServiceJobStatus(db, { service_job_id: servicoB.data.id, status: "em_andamento" });

    const ambiguo = await falar("registrar_producao_servico", { quantidade: 3 });
    check(
      "pergunta, listando os dois, e NÃO escolhe o primeiro em silêncio",
      ambiguo.action_taken === "clarification_requested" &&
        ambiguo.reply_text.includes("Gradagem") &&
        ambiguo.reply_text.includes("Aração"),
      ambiguo.reply_text,
    );
    check(
      // `createServiceJob` já grava o PRIMEIRO log (a quantidade do cadastro).
      // O que este teste cobra é que a pergunta ambígua não acrescente um
      // segundo, silenciosamente, no serviço errado.
      "e não gravou um segundo log no serviço B",
      (await db.serviceJobLog.count({ where: { service_job_id: servicoB.data.id } })) === 1,
    );
    check(
      "nem mexeu de novo no A",
      (await db.serviceJobLog.count({ where: { service_job_id: servicoA.data.id } })) === 2,
    );

    console.log("\n   3. \"Gastei 60 litros de diesel\": confirma, e o sim baixa o estoque");
    const categoriaBloco8 = await db.productCategory.create({
      data: scoped({ name: "Combustíveis do bloco 8" }),
    });
    const dieselBloco8 = await db.product.create({
      data: scoped({ category_id: categoriaBloco8.id, name: "Diesel Comum", unit: "litro" }),
    });
    await recordStockMovement(db, {
      product_id: dieselBloco8.id,
      property_id: fazenda.id,
      movement_type: "compra",
      quantity: 200,
    });

    const f1 = await falar("registrar_combustivel_servico", { quem: "João Vizinho" });
    check(
      "sem produto, pergunta o combustível",
      f1.reply_text.toLowerCase().includes("combust"),
      f1.reply_text,
    );

    const f2 = await falar("registrar_combustivel_servico", { produto: "Diesel Comum" });
    check("com o produto, pergunta a quantidade", f2.reply_text.toLowerCase().includes("gasto"), f2.reply_text);

    const f3 = await falar("registrar_combustivel_servico", { quantidade: 60 });
    check(
      "confirma mostrando o combustível e o serviço",
      f3.requires_confirmation === true &&
        f3.reply_text.includes("60") &&
        f3.reply_text.toLowerCase().includes("diesel comum"),
      f3.reply_text,
    );

    const saldoAntesBloco8 = (await getStockBalance(db, { product_id: dieselBloco8.id }))[0];
    check(
      "200 litros no estoque antes do sim",
      Number(saldoAntesBloco8?.quantity) === 200,
      String(saldoAntesBloco8?.quantity),
    );

    const f4 = await falar("registrar_combustivel_servico", {}, { confirmed: true });
    check("o sim grava", f4.action_taken === "registrar_combustivel_servico:ok", f4.action_taken);
    const saldoDepoisBloco8 = (await getStockBalance(db, { product_id: dieselBloco8.id }))[0];
    check(
      "e o estoque caiu para 140 litros",
      Number(saldoDepoisBloco8?.quantity) === 140,
      String(saldoDepoisBloco8?.quantity),
    );
    check(
      "e o custo aponta para o serviço do João",
      (await db.serviceJobCost.count({
        where: { service_job_id: servicoA.data.id, kind: "combustivel" },
      })) === 1,
    );

    console.log("\n   5. \"Terminei o serviço do João\": quantidade, total e situação do pagamento");
    const e1 = await falar("encerrar_servico", { quem: "João Vizinho" });
    check(
      "confirma antes de concluir",
      e1.requires_confirmation === true && e1.reply_text.toLowerCase().includes("concluído"),
      e1.reply_text,
    );
    const e2 = await falar("encerrar_servico", {}, { confirmed: true });
    check("o sim conclui", e2.action_taken === "encerrar_servico:ok", e2.action_taken);
    check(
      "e devolve quantidade, total e situação do pagamento, os três itens do §42",
      e2.reply_text.includes("13") &&
        e2.reply_text.includes("3.900") &&
        e2.reply_text.toLowerCase().includes("a receber"),
      e2.reply_text,
    );
    const servicoAFinal = await db.serviceJob.findUnique({ where: { id: servicoA.data.id } });
    check("e o status foi para concluido", servicoAFinal?.status === "concluido", servicoAFinal?.status);

    console.log("\n   iniciar_servico: 'Comecei a roçada do Pedro hoje' (fora do mínimo, cobertura à parte)");
    const servicoC = await createServiceJob(db, {
      direction: "prestado",
      property_id: fazenda.id,
      occurred_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 120,
      quantity: 3,
      machine_id: trator.id,
      contact_name: "Pedro Lavrador",
    });
    if (!servicoC.ok) throw new Error("createServiceJob falhou");
    check("nasce agendado", servicoC.data.status === "agendado", servicoC.data.status);

    const i1 = await falar("iniciar_servico", { quem: "Pedro Lavrador" });
    check(
      "confirma antes de iniciar",
      i1.requires_confirmation === true && i1.reply_text.toLowerCase().includes("iniciado"),
      i1.reply_text,
    );
    const i2 = await falar("iniciar_servico", {}, { confirmed: true });
    check("o sim inicia", i2.action_taken === "iniciar_servico:ok", i2.action_taken);
    const servicoCDepois = await db.serviceJob.findUnique({ where: { id: servicoC.data.id } });
    check(
      "e o status foi para em_andamento",
      servicoCDepois?.status === "em_andamento",
      servicoCDepois?.status,
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
