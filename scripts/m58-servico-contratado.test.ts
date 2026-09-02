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
  const { createServiceJob, listServiceJobs, getServiceJobDetail, SERVICOS_SUGERIDOS } =
    await import("@/lib/actions/service-jobs");

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
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M58 verde" : `\n❌ M58: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
