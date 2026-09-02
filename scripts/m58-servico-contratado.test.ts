import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 33, fase 2: o serviço contratado de terceiro.
 *
 * Prova, por seção do documento do cliente:
 *   1. §14, §15, §17, §18, §19: o total derivado, e as bordas dele.
 *   2. §13 e §14: a diária dos três homens, com log e conta a pagar.
 *   3. §15: o empreito, que não exige quantidade.
 *   4. §21: à vista, futuro, e a contradição entre os dois.
 *   5. As recusas, todas com `field`, e nenhuma deixando órfão.
 *   6. §24: serviço no futuro vira compromisso no Meu Dia; no passado, não.
 *   7. §22: o exemplo literal (10.000, adianta 3.000, sobram 7.000).
 *   8. O fechamento: quitar zera o restante e não deixa pendente sobrando.
 *   9. Pagar MAIS que o restante é recusado, e o saldo nunca fica negativo.
 *  10. Cancelar apaga o pendente, preserva o pago, e mantém os logs.
 *  11. §27: o custo do lote de confinamento passa a somar os serviços dele,
 *      SEM o serviço perder o próprio dinheiro. É a decisão 12 da spec, e a
 *      única desta fase que toca código de outro módulo em produção.
 *  12. §12 e §34: a anotação de atividade e ausência, que NÃO calcula nada.
 *  13. §30: o gasto separado em fixa, eventual e terceirizados, sem sobrepor.
 *
 * Roda: `npm run test:m58`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🔧 M58: serviço contratado (Módulo 33, fase 2)\n");

async function main() {
  // ── 1. O total derivado (§14, §15, §17, §18, §19) ──────────────────────
  //
  // Função PURA, sem banco. As bordas (empreito sem valor, log cancelado,
  // preço nulo, `worker_count`) são exatamente o que um teste com fixture
  // esconderia atrás de um caso feliz.

  console.log("1. O total derivado (§14, §15, §17, §18, §19)");
  const { totalDoServico, quantidadeTrabalhada } = await import(
    "@/lib/mao-de-obra/total-do-servico"
  );

  const log = (q: number, cancelado = false) => ({
    quantity: q,
    canceled_at: cancelado ? new Date() : null,
  });

  check(
    "§14: 3 homens por 4 dias a 150 dá R$ 1.800 (12 diárias)",
    totalDoServico(
      { pricing: "dia", unit_price: 150, agreed_amount: null, worker_count: 3 },
      [log(4)],
    ) === 1800,
    String(
      totalDoServico(
        { pricing: "dia", unit_price: 150, agreed_amount: null, worker_count: 3 },
        [log(4)],
      ),
    ),
  );
  check(
    "e a QUANTIDADE é 4, não 12: worker_count multiplica o valor, não os dias",
    quantidadeTrabalhada([log(4)]) === 4,
    String(quantidadeTrabalhada([log(4)])),
  );
  check(
    "§15: empreito de R$ 6.000 ignora quantidade e preço unitário",
    totalDoServico(
      { pricing: "fechado", unit_price: null, agreed_amount: 6000, worker_count: 1 },
      [log(999)],
    ) === 6000,
  );
  check(
    "§17: 30 hectares a 120 dá R$ 3.600",
    totalDoServico(
      { pricing: "hectare", unit_price: 120, agreed_amount: null, worker_count: 1 },
      [log(30)],
    ) === 3600,
  );
  check(
    "§18: 12 horas a 250 dá R$ 3.000",
    totalDoServico(
      { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
      [log(12)],
    ) === 3000,
  );
  check(
    "§19: vários dias somam (5 + 7 + 4 horas a 250 dá R$ 4.000)",
    totalDoServico(
      { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
      [log(5), log(7), log(4)],
    ) === 4000,
  );
  check(
    "log CANCELADO não conta",
    totalDoServico(
      { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
      [log(5), log(7, true)],
    ) === 1250,
    String(
      totalDoServico(
        { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
        [log(5), log(7, true)],
      ),
    ),
  );
  check(
    "sem log nenhum, o total é ZERO, não NaN",
    totalDoServico(
      { pricing: "hectare", unit_price: 120, agreed_amount: null, worker_count: 1 },
      [],
    ) === 0,
  );
  check(
    "preço unitário nulo fora do fechado devolve zero, não NaN",
    totalDoServico(
      { pricing: "hectare", unit_price: null, agreed_amount: null, worker_count: 1 },
      [log(30)],
    ) === 0,
  );
  check(
    "fechado SEM valor combinado devolve zero, e NÃO cai no preço unitário",
    totalDoServico(
      { pricing: "fechado", unit_price: 999, agreed_amount: null, worker_count: 1 },
      [log(2)],
    ) === 0,
    String(
      totalDoServico(
        { pricing: "fechado", unit_price: 999, agreed_amount: null, worker_count: 1 },
        [log(2)],
      ),
    ),
  );
  check(
    "decimal não vira dízima: 2,5 horas a 250 dá 625",
    totalDoServico(
      { pricing: "hora", unit_price: 250, agreed_amount: null, worker_count: 1 },
      [log(2.5)],
    ) === 625,
  );
  check(
    "worker_count zero ou negativo conta como 1, nunca zera o serviço",
    totalDoServico(
      { pricing: "dia", unit_price: 150, agreed_amount: null, worker_count: 0 },
      [log(4)],
    ) === 600,
    String(
      totalDoServico(
        { pricing: "dia", unit_price: 150, agreed_amount: null, worker_count: 0 },
        [log(4)],
      ),
    ),
  );

  await comBanco();
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const {
    createServiceJob,
    listServiceJobs,
    getServiceJobDetail,
    recordServiceJobPayment,
    cancelServiceJob,
    SERVICOS_SUGERIDOS,
  } = await import("@/lib/actions/service-jobs");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M58 ${stamp}`, document: `M58${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  const contasDe = (jobId: string) =>
    db.financialEntry.findMany({
      where: { related_module: "servico", related_id: jobId },
      orderBy: { created_at: "asc" },
    });

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M58" }) });

    // ── 2. §13 e §14: a diária dos três homens ────────────────────────────

    console.log("\n2. §13 e §14: a diária dos três homens");
    check(
      "os 19 serviços do §20 estão sugeridos",
      SERVICOS_SUGERIDOS.length === 19 && SERVICOS_SUGERIDOS.includes("Reforma de cerca"),
      String(SERVICOS_SUGERIDOS.length),
    );

    const cerca = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Reforma de cerca",
      pricing: "dia",
      unit_price: 150,
      quantity: 4,
      worker_count: 3,
      contact_name: "Turma da cerca",
    });
    check("cadastro devolve ok", cerca.ok, cerca.ok ? "" : cerca.message);
    if (!cerca.ok) throw new Error("createServiceJob falhou");

    check("a quantidade é 4 DIAS, não 12", cerca.data.quantidade === 4, String(cerca.data.quantidade));
    check("o total é R$ 1.800 (12 diárias)", cerca.data.total === 1800, String(cerca.data.total));
    check("pago 0", cerca.data.pago === 0);
    check("restante 1.800", cerca.data.restante === 1800);
    check(
      "nasceu UM log com a quantidade",
      (await db.serviceJobLog.count({ where: { service_job_id: cerca.data.id } })) === 1,
    );

    const contas = await contasDe(cerca.data.id);
    check("e UMA conta a pagar", contas.length === 1, String(contas.length));
    check("pendente", contas[0]?.status === "pending");
    check("como despesa", contas[0]?.entry_type === "expense");
    check("no valor total", Number(contas[0]?.amount) === 1800);
    check(
      "o contato foi criado pelo nome dito",
      (await db.contact.count({ where: { name: "Turma da cerca" } })) === 1,
    );
    check(
      "e a listagem já traz os quatro números",
      (await listServiceJobs(db, {})).some((j) => j.id === cerca.data.id && j.restante === 1800),
    );

    // ── 3. §15: o empreito ────────────────────────────────────────────────

    console.log("\n3. §15: o empreito não exige quantidade");
    const curral = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Construção de curral",
      pricing: "fechado",
      agreed_amount: 20000,
      contact_name: "Pedro Pedreiro",
    });
    check("cadastro devolve ok", curral.ok, curral.ok ? "" : curral.message);
    if (!curral.ok) throw new Error("createServiceJob falhou");
    check("total 20.000", curral.data.total === 20000, String(curral.data.total));
    check("e a quantidade é zero, não inventada", curral.data.quantidade === 0);
    check(
      "sem log nenhum",
      (await db.serviceJobLog.count({ where: { service_job_id: curral.data.id } })) === 0,
    );

    // ── 4. §21: à vista, futuro, e a contradição ──────────────────────────

    console.log("\n4. §21: à vista, futuro, e a contradição entre os dois");
    const avista = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 120,
      quantity: 30,
      contact_name: "Zé da Roçadeira",
      pago: true,
    });
    check("à vista devolve ok", avista.ok, avista.ok ? "" : avista.message);
    if (!avista.ok) throw new Error("createServiceJob falhou");
    check("total 3.600", avista.data.total === 3600);
    check("pago 3.600", avista.data.pago === 3600, String(avista.data.pago));
    check("restante 0", avista.data.restante === 0, String(avista.data.restante));
    const contasAvista = await contasDe(avista.data.id);
    check("um lançamento só, já quitado", contasAvista.length === 1 && contasAvista[0]?.status === "paid");

    const contradicao = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Gradagem",
      pricing: "hectare",
      unit_price: 100,
      quantity: 10,
      pago: true,
      due_date: new Date("2026-10-01T12:00:00.000Z"),
    });
    check("pago à vista COM vencimento é recusado", !contradicao.ok);
    check(
      "no campo due_date",
      !contradicao.ok && contradicao.field === "due_date",
      !contradicao.ok ? String(contradicao.field) : "aceitou",
    );

    // ── 5. As recusas, todas com `field` ──────────────────────────────────

    console.log("\n5. As recusas, todas com `field`, e nenhuma deixando órfão");
    const antesDasRecusas = await db.serviceJob.count();

    const semDescricao = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "   ",
      pricing: "dia",
      unit_price: 100,
      quantity: 1,
    });
    check("descrição vazia recusada no campo description", !semDescricao.ok && semDescricao.field === "description");

    const semPreco = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Roçada",
      pricing: "hectare",
      quantity: 10,
    });
    check("sem preço unitário recusado no campo unit_price", !semPreco.ok && semPreco.field === "unit_price");

    const fechadoSemValor = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Curral",
      pricing: "fechado",
    });
    check(
      "fechado sem valor recusado no campo agreed_amount",
      !fechadoSemValor.ok && fechadoSemValor.field === "agreed_amount",
      !fechadoSemValor.ok ? String(fechadoSemValor.field) : "aceitou",
    );

    const precoNegativo = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Roçada",
      pricing: "hectare",
      unit_price: -5,
      quantity: 10,
    });
    check("preço negativo recusado no campo unit_price", !precoNegativo.ok && precoNegativo.field === "unit_price");

    const fazendaFantasma = await createServiceJob(db, {
      property_id: "clnaoexiste000000000000",
      occurred_at: new Date(),
      description: "Roçada",
      pricing: "hectare",
      unit_price: 120,
      quantity: 10,
    });
    check("fazenda inexistente recusada", !fazendaFantasma.ok);
    check("com 404 no campo property_id", !fazendaFantasma.ok && fazendaFantasma.status === 404);

    const comMaquina = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date(),
      description: "Manutenção do trator",
      pricing: "fechado",
      agreed_amount: 800,
      machine_id: "clqualquer000000000000",
    });
    check(
      "§29: manutenção de máquina é recusada, e aponta para Máquinas",
      !comMaquina.ok && comMaquina.field === "machine_id",
      !comMaquina.ok ? String(comMaquina.field) : "aceitou",
    );

    check(
      "nenhuma recusa deixou serviço órfão",
      (await db.serviceJob.count()) === antesDasRecusas,
      `${antesDasRecusas} -> ${await db.serviceJob.count()}`,
    );

    // ── 6. §24: o compromisso no Meu Dia ──────────────────────────────────

    console.log("\n6. §24: serviço no FUTURO vira compromisso, no passado não");
    const tarefasAntes = await db.task.count();
    const amanha = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const futuro = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: amanha,
      description: "Gradagem",
      pricing: "hectare",
      unit_price: 200,
      quantity: 20,
      contact_name: "Tratorista da vizinhança",
    });
    check("serviço futuro devolve ok", futuro.ok, futuro.ok ? "" : futuro.message);
    check(
      "e criou UMA tarefa no Meu Dia",
      (await db.task.count()) === tarefasAntes + 1,
      String(await db.task.count()),
    );
    const tarefa = await db.task.findFirst({ orderBy: { created_at: "desc" } });
    check(
      "com o serviço e a contraparte no título",
      (tarefa?.title ?? "").includes("Gradagem") &&
        (tarefa?.title ?? "").includes("Tratorista da vizinhança"),
      String(tarefa?.title),
    );

    const tarefasDepois = await db.task.count();
    await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date("2026-08-01T12:00:00.000Z"),
      description: "Aração",
      pricing: "hectare",
      unit_price: 200,
      quantity: 10,
    });
    check(
      "serviço no PASSADO não cria tarefa nenhuma",
      (await db.task.count()) === tarefasDepois,
      `${tarefasDepois} -> ${await db.task.count()}`,
    );

    const detalhe = await getServiceJobDetail(db, cerca.data.id);
    check("o detalhe devolve ok", detalhe.ok);
    check("com o log", detalhe.ok && detalhe.data.logs.length === 1);
    check("e o lançamento", detalhe.ok && detalhe.data.entries.length === 1);
    check("serviço inexistente devolve 404", !(await getServiceJobDetail(db, "clnaoexiste000000000000")).ok);

    // ── 7. §22: o exemplo literal do documento ────────────────────────────

    console.log("\n7. §22: o exemplo literal (10.000, adianta 3.000, sobram 7.000)");
    const empreito = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Construção de curral",
      pricing: "fechado",
      agreed_amount: 10000,
      contact_name: "Pedreiro do §22",
    });
    if (!empreito.ok) throw new Error("createServiceJob falhou");
    check("total 10.000", empreito.data.total === 10000);
    check("pago 0", empreito.data.pago === 0);
    check("restante 10.000", empreito.data.restante === 10000);

    const parcial = await recordServiceJobPayment(db, {
      service_job_id: empreito.data.id,
      amount: 3000,
    });
    check("o pagamento parcial é aceito", parcial.ok, parcial.ok ? "" : parcial.message);
    check("pago vira 3.000", parcial.ok && parcial.data.pago === 3000, parcial.ok ? String(parcial.data.pago) : "");
    check(
      "restante vira 7.000",
      parcial.ok && parcial.data.restante === 7000,
      parcial.ok ? String(parcial.data.restante) : "",
    );

    const depoisDoParcial = await getServiceJobDetail(db, empreito.data.id);
    check(
      "e o serviço tem DOIS lançamentos: um pago e um pendente",
      depoisDoParcial.ok && depoisDoParcial.data.entries.length === 2,
      depoisDoParcial.ok ? String(depoisDoParcial.data.entries.length) : "recusado",
    );
    check(
      "o total COMBINADO não mudou",
      depoisDoParcial.ok && depoisDoParcial.data.total === 10000,
      depoisDoParcial.ok ? String(depoisDoParcial.data.total) : "recusado",
    );
    check(
      "o pendente encolheu para 7.000",
      depoisDoParcial.ok &&
        depoisDoParcial.data.entries.some((e) => e.status === "pending" && e.amount === 7000),
    );
    check(
      "e existe um pago de 3.000",
      depoisDoParcial.ok &&
        depoisDoParcial.data.entries.some((e) => e.status === "paid" && e.amount === 3000),
    );

    // ── 8. O fechamento ───────────────────────────────────────────────────

    console.log("\n8. Quitar zera o restante e não deixa pendente sobrando");
    const quitacao = await recordServiceJobPayment(db, {
      service_job_id: empreito.data.id,
      amount: 7000,
    });
    check("quitação aceita", quitacao.ok, quitacao.ok ? "" : quitacao.message);
    check("pago 10.000", quitacao.ok && quitacao.data.pago === 10000);
    check("restante 0", quitacao.ok && quitacao.data.restante === 0);
    check(
      "NENHUM lançamento pendente sobrou (nada de conta a pagar de R$ 0,00)",
      (await db.financialEntry.count({
        where: { related_module: "servico", related_id: empreito.data.id, status: "pending" },
      })) === 0,
    );
    check(
      "e os dois pagos continuam lá",
      (await db.financialEntry.count({
        where: { related_module: "servico", related_id: empreito.data.id, status: "paid" },
      })) === 2,
    );

    const jaQuitado = await recordServiceJobPayment(db, {
      service_job_id: empreito.data.id,
      amount: 100,
    });
    check("pagar de novo é recusado", !jaQuitado.ok);
    check("com 409", !jaQuitado.ok && jaQuitado.status === 409, !jaQuitado.ok ? String(jaQuitado.status) : "");

    // ── 9. Pagar mais que o restante ──────────────────────────────────────

    console.log("\n9. Pagar MAIS que o restante é recusado: o saldo nunca fica negativo");
    const outro = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Roçada de beira",
      pricing: "fechado",
      agreed_amount: 700,
      contact_name: "Roçador",
    });
    if (!outro.ok) throw new Error("createServiceJob falhou");

    // O dedo pesado: 700 vira 7000.
    const dedoPesado = await recordServiceJobPayment(db, {
      service_job_id: outro.data.id,
      amount: 7000,
    });
    check("recusado", !dedoPesado.ok);
    check(
      "no campo amount",
      !dedoPesado.ok && dedoPesado.field === "amount",
      !dedoPesado.ok ? String(dedoPesado.field) : "aceitou",
    );
    check(
      "e a mensagem diz quanto falta",
      !dedoPesado.ok && dedoPesado.message.includes("700"),
      !dedoPesado.ok ? dedoPesado.message : "",
    );
    const aindaIntacto = await getServiceJobDetail(db, outro.data.id);
    check(
      "o restante continua 700, nunca negativo",
      aindaIntacto.ok && aindaIntacto.data.restante === 700,
      aindaIntacto.ok ? String(aindaIntacto.data.restante) : "recusado",
    );
    check("valor zero também é recusado no campo amount", !(await recordServiceJobPayment(db, { service_job_id: outro.data.id, amount: 0 })).ok);

    // ── 10. Cancelar ──────────────────────────────────────────────────────

    console.log("\n10. Cancelar apaga o pendente, preserva o pago, e mantém os logs");
    const paraCancelar = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Gradagem cancelada",
      pricing: "hectare",
      unit_price: 100,
      quantity: 20,
      contact_name: "Tratorista sumido",
    });
    if (!paraCancelar.ok) throw new Error("createServiceJob falhou");
    await recordServiceJobPayment(db, { service_job_id: paraCancelar.data.id, amount: 500 });

    const cancelado = await cancelServiceJob(db, {
      service_job_id: paraCancelar.data.id,
      reason: "O tratorista não voltou",
    });
    check("cancelamento devolve ok", cancelado.ok, cancelado.ok ? "" : cancelado.message);
    check(
      "nenhum pendente sobrou",
      (await db.financialEntry.count({
        where: { related_module: "servico", related_id: paraCancelar.data.id, status: "pending" },
      })) === 0,
    );
    check(
      "o que JÁ FOI PAGO continua no financeiro",
      (await db.financialEntry.count({
        where: { related_module: "servico", related_id: paraCancelar.data.id, status: "paid" },
      })) === 1,
    );
    check(
      "os logs continuam lá (§40.8 exige histórico)",
      (await db.serviceJobLog.count({ where: { service_job_id: paraCancelar.data.id } })) === 1,
    );
    check(
      "some da listagem padrão",
      !(await listServiceJobs(db, {})).some((j) => j.id === paraCancelar.data.id),
    );
    check(
      "mas aparece com incluir_cancelados",
      (await listServiceJobs(db, { incluir_cancelados: true })).some(
        (j) => j.id === paraCancelar.data.id,
      ),
    );
    check(
      "e o motivo ficou registrado",
      (await db.serviceJob.findUnique({ where: { id: paraCancelar.data.id } }))?.canceled_reason ===
        "O tratorista não voltou",
    );
    check(
      "pagar num serviço cancelado é recusado",
      !(await recordServiceJobPayment(db, { service_job_id: paraCancelar.data.id, amount: 10 })).ok,
    );

    // ── 11. §27: o custo do lote de confinamento ──────────────────────────
    //
    // A decisão 12 da spec: `related_id` aponta para UMA coisa. O lançamento
    // aponta para o SERVIÇO (senão o §22 quebraria justo no serviço amarrado a
    // lote), e o lote soma por JUNÇÃO. Os dois lados precisam enxergar.

    console.log("\n11. §27: o custo do lote passa a somar os serviços dele");
    const { createConfinementSite, openConfinementStay, getConfinementLotSummary } =
      await import("@/lib/actions/confinement");
    const { recordMovement } = await import("@/lib/actions/herd-ledger");

    const pasto = await db.pasture.create({
      data: scoped({ property_id: fazenda.id, name: "Pasto M58", area_hectares: 40 }),
    });
    // Base para haver de onde tirar as cabeças, no molde da m51.
    await recordMovement(db, {
      movement_type: "saldo_inicial",
      quantity: 100,
      to: {
        category_id: "macho_25_36",
        property_id: fazenda.id,
        pasture_id: pasto.id,
        situation: "presente",
        owner: "proprio",
      },
    });

    const site = await createConfinementSite(db, {
      name: "Curral M58",
      type: "proprio",
      property_id: fazenda.id,
    });
    if (!site.ok) throw new Error(`createConfinementSite falhou: ${site.message}`);

    const aberto = await openConfinementStay(db, {
      confinement_site_id: site.data.id,
      category_id: "macho_25_36",
      quantity: 20,
      property_id: fazenda.id,
      pasture_id: pasto.id,
      started_at: new Date("2026-08-01T12:00:00.000Z"),
    });
    if (!aberto.ok) throw new Error(`openConfinementStay falhou: ${aberto.message}`);
    const lote = aberto.data;

    const custoAntes = await getConfinementLotSummary(db, lote.id);
    check(
      "o lote começa sem custo de serviço",
      custoAntes.ok && custoAntes.data.financial_cost === 0,
      custoAntes.ok ? String(custoAntes.data.financial_cost) : "recusado",
    );

    const tratorista = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date("2026-08-15T12:00:00.000Z"),
      description: "Trato do confinamento",
      pricing: "dia",
      unit_price: 200,
      quantity: 5,
      confinement_stay_id: lote.id,
      contact_name: "Tratorista do lote",
    });
    check("o serviço amarrado ao lote é criado", tratorista.ok, tratorista.ok ? "" : tratorista.message);
    if (!tratorista.ok) throw new Error("createServiceJob falhou");
    check("e custa R$ 1.000", tratorista.data.total === 1000, String(tratorista.data.total));

    const custoDepois = await getConfinementLotSummary(db, lote.id);
    check(
      "o CUSTO DO LOTE passou a incluí-lo (fecha metade da dívida 2.8 §29)",
      custoDepois.ok && custoDepois.data.financial_cost === 1000,
      custoDepois.ok ? String(custoDepois.data.financial_cost) : "recusado",
    );

    // A outra ponta, que é o que a decisão 12 protege: o serviço não pode
    // perder o próprio dinheiro por estar amarrado a um lote.
    const detalheDoTratorista = await getServiceJobDetail(db, tratorista.data.id);
    check(
      "e o SERVIÇO continua achando o próprio lançamento (§22 intacto)",
      detalheDoTratorista.ok && detalheDoTratorista.data.restante === 1000,
      detalheDoTratorista.ok ? String(detalheDoTratorista.data.restante) : "recusado",
    );

    // Pagar o serviço não muda o custo do lote: o custo é o que foi gasto,
    // pago ou a pagar. É o mesmo critério que o confinamento já usava.
    await recordServiceJobPayment(db, { service_job_id: tratorista.data.id, amount: 400 });
    const custoAposPagar = await getConfinementLotSummary(db, lote.id);
    check(
      "pagar parte não muda o custo do lote",
      custoAposPagar.ok && custoAposPagar.data.financial_cost === 1000,
      custoAposPagar.ok ? String(custoAposPagar.data.financial_cost) : "recusado",
    );

    await cancelServiceJob(db, { service_job_id: tratorista.data.id });
    const custoAposCancelar = await getConfinementLotSummary(db, lote.id);
    check(
      "cancelar o serviço deixa no lote só o que já tinha sido pago",
      custoAposCancelar.ok && custoAposCancelar.data.financial_cost === 400,
      custoAposCancelar.ok ? String(custoAposCancelar.data.financial_cost) : "recusado",
    );

    // Um serviço SEM lote não pode aparecer no custo de lote nenhum.
    const semLote = await createServiceJob(db, {
      property_id: fazenda.id,
      occurred_at: new Date("2026-08-16T12:00:00.000Z"),
      description: "Roçada longe do curral",
      pricing: "fechado",
      agreed_amount: 5000,
    });
    if (!semLote.ok) throw new Error("createServiceJob falhou");
    const custoFinal = await getConfinementLotSummary(db, lote.id);
    check(
      "serviço SEM lote não entra no custo do lote",
      custoFinal.ok && custoFinal.data.financial_cost === 400,
      custoFinal.ok ? String(custoFinal.data.financial_cost) : "recusado",
    );

    // ── 12. §12 e §34: a anotação que não calcula nada ────────────────────

    console.log("\n12. §12 e §34: a anotação de atividade e ausência");
    const { createWorkerLog, listWorkerLogs, deleteWorkerLog } = await import(
      "@/lib/actions/worker-logs"
    );
    const { createWorker } = await import("@/lib/actions/workers");

    const joao = await createWorker(db, {
      name: "João do §12",
      role: "Vaqueiro",
      type: "fixo",
      pay_frequency: "mensal",
      pay_amount: 2000,
    });
    if (!joao.ok) throw new Error("createWorker falhou");

    const atividade = await createWorkerLog(db, {
      worker_id: joao.data.id,
      kind: "atividade",
      occurred_at: new Date("2026-09-01T12:00:00.000Z"),
      description: "Conserto de cerca",
    });
    check("atividade devolve ok", atividade.ok, atividade.ok ? "" : atividade.message);

    // O dinheiro do trabalhador ANTES da falta, para comparar depois.
    const dinheiroAntes = await db.financialEntry.count({
      where: { related_module: "mao_de_obra", related_id: joao.data.id },
    });

    const falta = await createWorkerLog(db, {
      worker_id: joao.data.id,
      kind: "falta",
      occurred_at: new Date("2026-09-02T12:00:00.000Z"),
    });
    check("falta devolve ok", falta.ok, falta.ok ? "" : falta.message);

    /**
     * O caso que prova a decisão do documento, e é o que mais importa aqui.
     *
     * O §34 diz que o TIBÉ "não deverá calcular automaticamente consequências
     * trabalhistas". Desconto por falta é exatamente o que apareceria sem
     * decisão de produto, e este teste impede que apareça.
     */
    check(
      "⚠️ a FALTA não gerou lançamento financeiro nenhum (§34)",
      (await db.financialEntry.count({
        where: { related_module: "mao_de_obra", related_id: joao.data.id },
      })) === dinheiroAntes,
      String(
        await db.financialEntry.count({
          where: { related_module: "mao_de_obra", related_id: joao.data.id },
        }),
      ),
    );
    check(
      "e a previsão de pagamento continua no valor cheio",
      (
        await db.financialEntry.findFirst({
          where: { related_module: "mao_de_obra", related_id: joao.data.id, status: "pending" },
        })
      )?.amount?.toString() === "2000",
    );

    const anotacoes = await listWorkerLogs(db, joao.data.id);
    check("a listagem traz as duas", anotacoes.length === 2, String(anotacoes.length));
    check(
      "da mais recente para a mais antiga",
      anotacoes[0]?.kind === "falta" && anotacoes[1]?.kind === "atividade",
      `${anotacoes[0]?.kind}, ${anotacoes[1]?.kind}`,
    );

    check(
      "trabalhador inexistente devolve 404",
      !(
        await createWorkerLog(db, {
          worker_id: "clnaoexiste000000000000",
          kind: "atividade",
          occurred_at: new Date(),
        })
      ).ok,
    );

    // Apagar é apagar, e é a exceção deliberada do módulo: uma anotação errada
    // não é histórico de dinheiro.
    if (!atividade.ok) throw new Error("createWorkerLog falhou");
    const apagada = await deleteWorkerLog(db, atividade.data.id);
    check("apagar devolve ok", apagada.ok);
    check("e a anotação sumiu", (await listWorkerLogs(db, joao.data.id)).length === 1);
    check("apagar de novo devolve 404", !(await deleteWorkerLog(db, atividade.data.id)).ok);

    // ── 13. §30: o gasto separado em três ─────────────────────────────────
    //
    // A regra de classificação NÃO é óbvia, e é por isso que ela tem teste:
    //
    //   fixa          = FinancialEntry pagos com related_module `mao_de_obra`
    //   eventual      = pagos de ServiceJob COM worker_id, ou SEM contraparte
    //                   nenhuma (os três homens sem nome do §14)
    //   terceirizados = pagos de ServiceJob COM contact_id
    //
    // O que as três não podem fazer é contar o mesmo dinheiro duas vezes.

    console.log("\n13. §30: o gasto separado em fixa, eventual e terceirizados");
    const { getLaborSummary } = await import("@/lib/actions/labor-summary");
    const { confirmWorkerPayment, createWorker: novoTrabalhador } = await import(
      "@/lib/actions/workers"
    );

    // Um tenant limpo só para este bloco: os outros doze já sujaram o dinheiro.
    const t2 = await prisma.tenant.create({
      data: { name: `M58b ${stamp}`, document: `M58b${stamp}`.slice(0, 14), plan: "fazenda" },
    });
    const db2 = prismaForTenant(t2.id);
    try {
      const f2 = await db2.property.create({ data: scoped({ name: "Fazenda M58b" }) });

      // FIXA: um trabalhador mensal, pago.
      const vaqueiro = await novoTrabalhador(db2, {
        name: "Vaqueiro do §30",
        role: "Vaqueiro",
        type: "fixo",
        pay_frequency: "mensal",
        pay_amount: 2500,
      });
      if (!vaqueiro.ok) throw new Error("createWorker falhou");
      await confirmWorkerPayment(db2, { worker_id: vaqueiro.data.id });

      // EVENTUAL: um diarista cadastrado, e os três homens sem nome.
      const diarista = await novoTrabalhador(db2, {
        name: "Zé Diarista",
        role: "Serviços gerais",
        type: "eventual",
      });
      if (!diarista.ok) throw new Error("createWorker falhou");
      await createServiceJob(db2, {
        property_id: f2.id,
        occurred_at: new Date("2026-09-01T12:00:00.000Z"),
        description: "Capina",
        pricing: "dia",
        unit_price: 150,
        quantity: 2,
        worker_id: diarista.data.id,
        pago: true,
      });
      await createServiceJob(db2, {
        property_id: f2.id,
        occurred_at: new Date("2026-09-01T12:00:00.000Z"),
        description: "Reforma de cerca",
        pricing: "dia",
        unit_price: 150,
        quantity: 4,
        worker_count: 3,
        pago: true,
      });

      // TERCEIRIZADO: um prestador com contato.
      await createServiceJob(db2, {
        property_id: f2.id,
        occurred_at: new Date("2026-09-01T12:00:00.000Z"),
        description: "Construção de curral",
        pricing: "fechado",
        agreed_amount: 4700,
        contact_name: "Pedreiro do §30",
        pago: true,
      });

      // E uma conta a pagar NÃO paga, que não pode entrar em nenhuma coluna.
      await createServiceJob(db2, {
        property_id: f2.id,
        occurred_at: new Date("2026-09-01T12:00:00.000Z"),
        description: "Gradagem futura",
        pricing: "fechado",
        agreed_amount: 9999,
        contact_name: "Ainda não pago",
      });

      const resumo = await getLaborSummary(db2, {
        de: new Date("2026-09-01T00:00:00.000Z"),
        ate: new Date("2026-09-30T23:59:59.000Z"),
      });

      check("fixa: R$ 2.500", resumo.fixa === 2500, String(resumo.fixa));
      check(
        "eventual: R$ 2.100 (300 do diarista + 1.800 dos três homens)",
        resumo.eventual === 2100,
        String(resumo.eventual),
      );
      check("terceirizados: R$ 4.700", resumo.terceirizados === 4700, String(resumo.terceirizados));
      check(
        "total: R$ 9.300, e as três colunas somam exatamente ele",
        resumo.total === 9300 && resumo.fixa + resumo.eventual + resumo.terceirizados === resumo.total,
        String(resumo.total),
      );
      check(
        "⚠️ a conta A PAGAR de R$ 9.999 NÃO entra: o §30 pergunta quanto está GASTANDO",
        resumo.total === 9300,
      );

      const outroMes = await getLaborSummary(db2, {
        de: new Date("2026-10-01T00:00:00.000Z"),
        ate: new Date("2026-10-31T23:59:59.000Z"),
      });
      check(
        "e o período filtra: outubro está zerado",
        outroMes.total === 0,
        String(outroMes.total),
      );
    } finally {
      await prisma.tenant.delete({ where: { id: t2.id } });
    }
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M58 verde" : `\n❌ M58: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
