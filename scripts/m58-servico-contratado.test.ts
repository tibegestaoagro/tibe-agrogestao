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
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M58 verde" : `\n❌ M58: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
