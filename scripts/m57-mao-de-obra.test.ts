import "dotenv/config";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Módulo 33, fase 1: a mão de obra fixa.
 *
 * Prova, por seção do documento do cliente:
 *   1. §5 e §7: a data do próximo pagamento, incluindo o dia 31 em fevereiro.
 *   2. §7 e §40.2: cadastrar fixo cria UMA previsão pendente, e só uma.
 *   3. §13: o eventual NÃO gera previsão (quem paga é a diária).
 *   4. §5: fixo sem valor ou sem frequência é recusado NO CAMPO.
 *   5. §40.8: inativar cancela a previsão pendente e preserva o histórico.
 *   6. A previsão é idempotente: chamar duas vezes não cria duas contas.
 *
 * Roda: `npm run test:m57`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("👷 M57: mão de obra fixa (Módulo 33, fase 1)\n");

async function main() {
  // ── 1. A data do próximo pagamento (§5, §7) ────────────────────────────
  //
  // Função PURA, sem banco: os casos de borda (dia 31 em fevereiro, "a partir
  // do próprio dia de pagamento") são exatamente o que um teste com banco
  // esconderia atrás de fixture.

  console.log("1. A data do próximo pagamento (§5, §7)");
  const { proximaDataDePagamento } = await import("@/lib/mao-de-obra/proxima-data");

  const d = (s: string) => new Date(`${s}T12:00:00.000Z`);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const proxima = (f: Parameters<typeof proximaDataDePagamento>[0], dia: number | null, base: string) =>
    iso(proximaDataDePagamento(f, dia, d(base)));

  check(
    "mensal, dia 5, a partir de 02/09 cai em 05/09",
    proxima("mensal", 5, "2026-09-02") === "2026-09-05",
    proxima("mensal", 5, "2026-09-02"),
  );
  check(
    "mensal, dia 5, a partir do PRÓPRIO dia 5 cai no mês seguinte",
    proxima("mensal", 5, "2026-09-05") === "2026-10-05",
    proxima("mensal", 5, "2026-09-05"),
  );
  check(
    "mensal, dia 5, a partir de 20/09 cai em 05/10",
    proxima("mensal", 5, "2026-09-20") === "2026-10-05",
    proxima("mensal", 5, "2026-09-20"),
  );
  check(
    "mensal, dia 31, em fevereiro cai no ÚLTIMO dia do mês, não em 03/03",
    proxima("mensal", 31, "2026-02-01") === "2026-02-28",
    proxima("mensal", 31, "2026-02-01"),
  );
  check(
    "mensal, dia 31, em ano bissexto respeita o 29",
    proxima("mensal", 31, "2028-02-01") === "2028-02-29",
    proxima("mensal", 31, "2028-02-01"),
  );
  check(
    "mensal, dia 31, em dezembro vira janeiro do ano seguinte",
    proxima("mensal", 31, "2026-12-31") === "2027-01-31",
    proxima("mensal", 31, "2026-12-31"),
  );
  check(
    "semanal soma 7 dias",
    proxima("semanal", null, "2026-09-02") === "2026-09-09",
    proxima("semanal", null, "2026-09-02"),
  );
  check(
    "quinzenal soma 15 dias",
    proxima("quinzenal", null, "2026-09-02") === "2026-09-17",
    proxima("quinzenal", null, "2026-09-02"),
  );
  check(
    "quinzenal IGNORA o dia habitual (não é pagamento do mês)",
    proxima("quinzenal", 5, "2026-09-02") === "2026-09-17",
    proxima("quinzenal", 5, "2026-09-02"),
  );
  check(
    "diaria soma 1 dia",
    proxima("diaria", null, "2026-09-02") === "2026-09-03",
    proxima("diaria", null, "2026-09-02"),
  );
  check(
    "mensal SEM dia habitual soma um mês a partir da data",
    proxima("mensal", null, "2026-09-02") === "2026-10-02",
    proxima("mensal", null, "2026-09-02"),
  );
  check(
    "`outra` se comporta como mensal",
    proxima("outra", 10, "2026-09-02") === "2026-09-10",
    proxima("outra", 10, "2026-09-02"),
  );
  check(
    "o resultado é sempre ESTRITAMENTE depois da data base",
    proximaDataDePagamento("mensal", 5, d("2026-09-05")).getTime() > d("2026-09-05").getTime(),
  );

  await comBanco();
}

async function comBanco() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { createWorker, listWorkers, setWorkerStatus, getWorkerDetail, FUNCOES_SUGERIDAS } =
    await import("@/lib/actions/workers");

  const stamp = Date.now();
  const tenant = await prisma.tenant.create({
    data: { name: `M57 ${stamp}`, document: `M57${stamp}`.slice(0, 14), plan: "fazenda" },
  });
  const db = prismaForTenant(tenant.id);

  const previsoesDe = (workerId: string) =>
    db.financialEntry.findMany({
      where: { related_module: "mao_de_obra", related_id: workerId, status: "pending" },
    });

  try {
    const fazenda = await db.property.create({ data: scoped({ name: "Fazenda M57" }) });

    // ── 2. O cadastro do fixo cria UMA previsão (§7, §40.2) ────────────────

    console.log("\n2. Cadastro de trabalhador fixo cria UMA previsão (§7, §40.2)");
    check(
      "as dez funções do §6 estão sugeridas",
      FUNCOES_SUGERIDAS.length === 10 && FUNCOES_SUGERIDAS.includes("Vaqueiro"),
      String(FUNCOES_SUGERIDAS.length),
    );

    const joao = await createWorker(db, {
      name: "João",
      role: "Vaqueiro",
      type: "fixo",
      pay_frequency: "mensal",
      pay_amount: 2500,
      pay_day: 5,
      property_id: fazenda.id,
    });
    check("cadastro devolve ok", joao.ok, joao.ok ? "" : joao.message);
    if (!joao.ok) throw new Error("createWorker falhou");

    const previsoes = await previsoesDe(joao.data.id);
    check("nasceu exatamente UMA previsão", previsoes.length === 1, String(previsoes.length));
    check("no valor combinado", Number(previsoes[0]?.amount) === 2500);
    check("como DESPESA", previsoes[0]?.entry_type === "expense");
    check("pendente, nunca paga sozinha (§40.3)", previsoes[0]?.status === "pending");
    check(
      "marcada como pagamento, não como adiantamento",
      previsoes[0]?.worker_entry_kind === "pagamento",
      String(previsoes[0]?.worker_entry_kind),
    );
    check(
      "com vencimento no dia habitual",
      previsoes[0]?.due_date?.getUTCDate() === 5,
      String(previsoes[0]?.due_date?.toISOString()),
    );
    check(
      "a listagem já traz o próximo pagamento (§38)",
      (await listWorkers(db)).find((w) => w.id === joao.data.id)?.proximo_pagamento?.amount === 2500,
    );

    // ── 3. O eventual não gera previsão (§13) ──────────────────────────────

    console.log("\n3. O eventual NÃO gera previsão (§13: quem paga é a diária)");
    const ze = await createWorker(db, { name: "Zé", role: "Serviços gerais", type: "eventual" });
    check("cadastro do eventual devolve ok", ze.ok, ze.ok ? "" : ze.message);
    if (!ze.ok) throw new Error("createWorker falhou");
    const semNada = await db.financialEntry.count({
      where: { related_module: "mao_de_obra", related_id: ze.data.id },
    });
    check("nenhum lançamento para o eventual", semNada === 0, String(semNada));

    // ── 4. Recusa NO CAMPO (§5) ────────────────────────────────────────────

    console.log("\n4. Fixo sem valor ou sem frequência é recusado NO CAMPO");
    const semValor = await createWorker(db, {
      name: "X",
      role: "Caseiro",
      type: "fixo",
      pay_frequency: "mensal",
    });
    check("sem valor é recusado", !semValor.ok);
    check(
      "no campo pay_amount",
      !semValor.ok && semValor.field === "pay_amount",
      !semValor.ok ? String(semValor.field) : "aceitou",
    );

    const semFreq = await createWorker(db, {
      name: "Y",
      role: "Caseiro",
      type: "fixo",
      pay_amount: 1000,
    });
    check("sem frequência é recusado", !semFreq.ok);
    check(
      "no campo pay_frequency",
      !semFreq.ok && semFreq.field === "pay_frequency",
      !semFreq.ok ? String(semFreq.field) : "aceitou",
    );

    const semNome = await createWorker(db, { name: "  ", role: "Caseiro", type: "eventual" });
    check("nome vazio é recusado no campo name", !semNome.ok && semNome.field === "name");

    const diaImpossivel = await createWorker(db, {
      name: "Z",
      role: "Caseiro",
      type: "fixo",
      pay_frequency: "mensal",
      pay_amount: 1000,
      pay_day: 45,
    });
    check(
      "dia 45 é recusado no campo pay_day",
      !diaImpossivel.ok && diaImpossivel.field === "pay_day",
      !diaImpossivel.ok ? String(diaImpossivel.field) : "aceitou",
    );

    check(
      "nada disso deixou trabalhador órfão no banco",
      (await db.worker.count()) === 2,
      String(await db.worker.count()),
    );

    // ── 5. Inativar cancela a previsão, e preserva o histórico (§40.8) ─────

    console.log("\n5. Inativar cancela a previsão pendente, e preserva o pago");
    await db.financialEntry.create({
      data: scoped({
        entry_type: "expense",
        category: "Mão de obra fixa",
        amount: 2500,
        related_module: "mao_de_obra",
        related_id: joao.data.id,
        status: "paid",
        paid_at: new Date("2026-08-05"),
        due_date: new Date("2026-08-05"),
        worker_entry_kind: "pagamento",
      }),
    });

    const inativado = await setWorkerStatus(db, joao.data.id, "inativo");
    check("inativar devolve ok", inativado.ok);
    check("nenhuma previsão pendente sobrou", (await previsoesDe(joao.data.id)).length === 0);
    check(
      "e o pagamento JÁ FEITO continua no histórico",
      (await db.financialEntry.count({
        where: { related_id: joao.data.id, status: "paid" },
      })) === 1,
    );

    const reativado = await setWorkerStatus(db, joao.data.id, "ativo");
    check("reativar devolve ok", reativado.ok);
    check(
      "e recria a previsão, uma só",
      (await previsoesDe(joao.data.id)).length === 1,
      String((await previsoesDe(joao.data.id)).length),
    );

    // ── 6. A previsão é idempotente ───────────────────────────────────────

    console.log("\n6. A previsão é idempotente (clique duplo não cria duas contas)");
    await setWorkerStatus(db, joao.data.id, "ativo");
    await setWorkerStatus(db, joao.data.id, "ativo");
    check(
      "continua UMA depois de três reativações",
      (await previsoesDe(joao.data.id)).length === 1,
      String((await previsoesDe(joao.data.id)).length),
    );

    const detalhe = await getWorkerDetail(db, joao.data.id);
    check("o detalhe devolve ok", detalhe.ok);
    check(
      "com os dois lançamentos (o pago e o previsto)",
      detalhe.ok && detalhe.data.entries.length === 2,
      detalhe.ok ? String(detalhe.data.entries.length) : "recusado",
    );
    check(
      "trabalhador inexistente devolve 404",
      !(await getWorkerDetail(db, "clnaoexiste000000000000")).ok,
    );
  } finally {
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.$disconnect();
  }
}

main().then(() => {
  console.log(falhas === 0 ? "\n✅ M57 verde" : `\n❌ M57: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
});
