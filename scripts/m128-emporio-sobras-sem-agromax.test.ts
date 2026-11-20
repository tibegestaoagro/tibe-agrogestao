import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório): as sobras das dívidas 5.23, 5.25, 5.28 e 5.30 que não dependem da Agromax.
 * Roda: `npm run test:m128`
 *
 * Seção 1: o extrato e o saldo da conta respeitam "hoje em Brasília" com `agora` injetável
 * (abertura sem parcela futura, Agendados só até o fim do período, virada às 03:00 UTC).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;
const DIA = 86_400_000;
const j = (x: unknown) => JSON.stringify(x);

let falhas = 0;
let total = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  total += 1;
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function secao1() {
  console.log("\n1. Extrato e saldo com `agora` (5.30)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const { fimDeHojeEmBrasilia } = await import("@/lib/emporio/data-da-baixa");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");
  const X: Dado = await import("@/lib/actions/emporio-caixa");
  const F: Dado = await import("@/lib/actions/emporio-financeiro");
  const cru = prisma as Dado;

  const hoje = hojeEmBrasilia();
  const somar = (d: Date, k: number) => new Date(d.getTime() + k * DIA);
  const meioDia = (d: Date) => new Date(d.getTime() + 15 * 3_600_000);
  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M128 ${stamp}`, document: `M128${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M128 dono", email: `m128-${stamp}@teste.local`, password_hash: "x", role: "OWNER" },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const db: Dado = prismaForTenant(t.id);
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M128 Loja", kind: "ponto_venda" })).data;
    const conta = await db.bankAccount.create({ data: scoped({ name: `M128 Conta ${stamp}` }) });
    const contaVirada = await db.bankAccount.create({ data: scoped({ name: `M128 Virada ${stamp}` }) });

    const venda = await cru.emporioSale.create({
      data: { tenant_id: t.id, establishment_id: loja.id, operation_key: `m128-${stamp}`, number: 1, sold_at: new Date(), net_amount: 80 },
    });
    const pgto = await cru.emporioSalePayment.create({ data: { tenant_id: t.id, sale_id: venda.id, kind: "credito_parcelado", amount: 80 } });
    const parcela = (dias: number, liquido: number, n: number) =>
      cru.cardReceivable.create({
        data: {
          tenant_id: t.id, sale_id: venda.id, sale_payment_id: pgto.id, establishment_id: loja.id, bank_account_id: conta.id,
          installment: n, installments: 2, gross_amount: liquido, net_amount: liquido, expected_on: somar(hoje, dias), effective_on: somar(hoje, dias), effective_net: liquido,
        },
      });
    const mov = (bank: string, amount: number, quando: Date, notes: string) =>
      db.cashMovement.create({ data: scoped({ bank_account_id: bank, direction: "entrada", origin: "implantacao", amount, occurred_at: quando, notes }) });

    await mov(conta.id, 100, new Date(), "PIX de hoje");
    await parcela(2, 30, 1);
    await parcela(5, 50, 2);
    const em4 = await mov(conta.id, 20, meioDia(somar(hoje, 4)), "PIX agendado hoje mais 4");
    const em20 = await mov(conta.id, 7, meioDia(somar(hoje, 20)), "PIX agendado hoje mais 20");

    console.log("  (a) período inteiro no futuro");
    const a = await F.lerExtratoDaContaAction(db, dono, { bank_account_id: conta.id, de: somar(hoje, 3), ate: somar(hoje, 10) });
    check("o extrato devolve ok", a.ok, j(a));
    if (a.ok) {
      const saldoHoje = ((await X.saldosDasContas(db)).get(conta.id) ?? 0) / 100;
      check("a abertura é o saldo de hoje (100), sem parcela de cartão futura", a.data.opening_balance === 100 && saldoHoje === 100, `${a.data.opening_balance} x ${saldoHoje}`);
      check("o corpo está vazio", a.data.lines.length === 0, j(a.data.lines));
      check("scheduled traz o movimento de hoje mais 4", a.data.scheduled.some((s: Dado) => s.id === em4.id), j(a.data.scheduled.map((s: Dado) => s.id)));
    }

    console.log("  (b) Agendados só até o fim do período (D1)");
    const b1 = await F.lerExtratoDaContaAction(db, dono, { bank_account_id: conta.id, de: somar(hoje, -5), ate: somar(hoje, 10) });
    check("o movimento de hoje mais 20 não está em scheduled até hoje mais 10", b1.ok && !b1.data.scheduled.some((s: Dado) => s.id === em20.id) && b1.data.scheduled.some((s: Dado) => s.id === em4.id), j(b1.ok ? b1.data.scheduled.map((s: Dado) => s.id) : b1));
    const b2 = await F.lerExtratoDaContaAction(db, dono, { bank_account_id: conta.id, de: somar(hoje, -5), ate: somar(hoje, 25) });
    check("o de hoje mais 20 está em scheduled até hoje mais 25", b2.ok && b2.data.scheduled.some((s: Dado) => s.id === em20.id), j(b2.ok ? b2.data.scheduled.map((s: Dado) => s.id) : b2));

    console.log("  (c) virada da meia-noite em Brasília");
    const antesDaVirada = new Date("2026-11-20T02:59:00Z");
    const naVirada = new Date("2026-11-20T03:00:00Z");
    const instante = fimDeHojeEmBrasilia(antesDaVirada);
    check("fimDeHojeEmBrasilia(02:59 UTC) é 03:00 UTC", instante.toISOString() === "2026-11-20T03:00:00.000Z", instante.toISOString());
    await mov(contaVirada.id, 40, instante, "Na virada");
    const s1 = ((await X.saldosDasContas(db, antesDaVirada)).get(contaVirada.id) ?? 0) / 100;
    const s2 = ((await X.saldosDasContas(db, naVirada)).get(contaVirada.id) ?? 0) / 100;
    check("às 02:59 UTC o movimento ainda não entra no saldo", s1 === 0, String(s1));
    check("às 03:00 UTC o movimento entra no saldo", s2 === 40, String(s2));
  } catch (e) {
    check("a seção 1 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    const por = { where: { tenant_id: t.id } };
    for (const m of ["cashMovement", "cardReceivable", "emporioSalePayment", "emporioSale", "establishment", "bankAccount", "user"]) {
      await cru[m]?.deleteMany(por).catch((e: unknown) => console.log(`  (teardown ${m}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.tenant.delete({ where: { id: t.id } }).catch((e: unknown) => console.log(`  (teardown 1: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
  }
}

async function secao2() {
  console.log("\n2. Marca de agendado nas listas (5.30)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");
  const X: Dado = await import("@/lib/actions/emporio-caixa");
  const CL: Dado = await import("@/lib/actions/emporio-clientes");
  const cru = prisma as Dado;

  const hoje = hojeEmBrasilia();
  const amanha = new Date(hoje.getTime() + DIA);
  const meioDia = (d: Date) => new Date(d.getTime() + 15 * 3_600_000);
  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M128b ${stamp}`, document: `M128B${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M128b dono", email: `m128b-${stamp}@teste.local`, password_hash: "x", role: "OWNER" },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const db: Dado = prismaForTenant(t.id);
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M128b Loja", kind: "ponto_venda" })).data;
    const conta = await db.bankAccount.create({ data: scoped({ name: `M128b Conta ${stamp}` }) });
    const cliente = await cru.emporioCustomer.create({ data: { tenant_id: t.id, name: "M128b Cliente" } });

    const entrada = await cru.financialEntry.create({
      data: { tenant_id: t.id, entry_type: "income", amount: 100, status: "pending", emporio_customer_id: cliente.id, establishment_id: loja.id },
    });
    const baixa = async (quando: Date, valor: number, notes: string) => {
      const fp = await cru.financialPayment.create({ data: { tenant_id: t.id, entry_id: entrada.id, amount: valor, paid_at: quando, method: "pix" } });
      return cru.cashMovement.create({
        data: { tenant_id: t.id, bank_account_id: conta.id, direction: "entrada", origin: "recebimento_fiado", amount: valor, occurred_at: quando, financial_payment_id: fp.id, notes },
      });
    };
    const movHoje = await baixa(new Date(), 10, "fiado de hoje");
    const movAmanha = await baixa(meioDia(amanha), 20, "fiado de amanhã");

    const venda = await cru.emporioSale.create({
      data: { tenant_id: t.id, establishment_id: loja.id, customer_id: cliente.id, operation_key: `m128b-${stamp}`, number: 1, sold_at: new Date(), net_amount: 80 },
    });
    const pgBoleto = await cru.emporioSalePayment.create({ data: { tenant_id: t.id, sale_id: venda.id, kind: "boleto", amount: 30 } });
    const boleto = await cru.emporioBoleto.create({
      data: {
        tenant_id: t.id, sale_id: venda.id, sale_payment_id: pgBoleto.id, customer_id: cliente.id, establishment_id: loja.id,
        due_on: hoje, amount: 30, status: "pago", bank_account_id: conta.id, paid_on: amanha, paid_at: meioDia(amanha),
      },
    });
    const pgCheque = await cru.emporioSalePayment.create({ data: { tenant_id: t.id, sale_id: venda.id, kind: "cheque", amount: 50 } });
    const cheque = await cru.emporioCheck.create({
      data: {
        tenant_id: t.id, sale_id: venda.id, sale_payment_id: pgCheque.id, customer_id: cliente.id, establishment_id: loja.id,
        holder_name: "M128b Cliente", amount: 50, status: "compensado", bank_account_id: conta.id, cleared_at: meioDia(amanha),
      },
    });

    console.log("  (a) lista de movimentos do caixa");
    const cx = await X.lerCaixaAction(db, dono, { bank_account_id: conta.id });
    check("lerCaixaAction devolve ok", cx.ok, j(cx));
    if (cx.ok) {
      const m = (id: string) => cx.data.movements.find((x: Dado) => x.id === id);
      check("o PIX de fiado de hoje vem com scheduled false", m(movHoje.id)?.scheduled === false, j(m(movHoje.id)?.scheduled));
      check("o PIX de fiado de amanhã vem com scheduled true", m(movAmanha.id)?.scheduled === true, j(m(movAmanha.id)?.scheduled));
    }

    console.log("  (b) recebimentos do cliente");
    const rc = await CL.listarRecebimentosDoClienteAction(db, dono, cliente.id);
    check("a lista do cliente devolve ok", rc.ok, j(rc));
    if (rc.ok) {
      const i = (id: string) => rc.data.items.find((x: Dado) => x.id === id);
      check("fiado de hoje: scheduled false", i(movHoje.id)?.scheduled === false, j(i(movHoje.id)));
      check("fiado de amanhã: scheduled true", i(movAmanha.id)?.scheduled === true, j(i(movAmanha.id)));
      check("boleto pago com paid_on de amanhã: scheduled true", i(boleto.id)?.scheduled === true, j(i(boleto.id)));
      check("cheque compensado com cleared_on de amanhã: scheduled true", i(cheque.id)?.scheduled === true, j(i(cheque.id)));
    }
    const ficha = await CL.lerFicha(db, dono, cliente.id);
    check("a ficha devolve ok", ficha.ok, j(ficha));
    if (ficha.ok) check("o Recebido soma só o fiado de hoje (10), sem os agendados", ficha.data.resumo.recebido === 10, String(ficha.data.resumo.recebido));
  } catch (e) {
    check("a seção 2 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    const por = { where: { tenant_id: t.id } };
    for (const m of ["cashMovement", "emporioCheck", "emporioBoleto", "emporioSalePayment", "emporioSale", "financialPayment", "financialEntry", "emporioCustomer", "establishment", "bankAccount", "user"]) {
      await cru[m]?.deleteMany(por).catch((e: unknown) => console.log(`  (teardown ${m}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.tenant.delete({ where: { id: t.id } }).catch((e: unknown) => console.log(`  (teardown 2: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
  }
}

async function secao3() {
  console.log("\n3. Recusas novas: cheque, replay do fiado e teto do valor pago (5.30)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");
  const X: Dado = await import("@/lib/actions/emporio-caixa");
  const cru = prisma as Dado;

  const hoje = hojeEmBrasilia();
  const ontem = new Date(hoje.getTime() - DIA);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const br = (d: Date) => `${iso(d).slice(8, 10)}/${iso(d).slice(5, 7)}/${iso(d).slice(0, 4)}`;
  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M128c ${stamp}`, document: `M128C${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M128c dono", email: `m128c-${stamp}@teste.local`, password_hash: "x", role: "OWNER" },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const db: Dado = prismaForTenant(t.id);
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M128c Loja", kind: "ponto_venda" })).data;
    const conta = await db.bankAccount.create({ data: scoped({ name: `M128c Conta ${stamp}` }) });
    const cliente = await cru.emporioCustomer.create({ data: { tenant_id: t.id, name: "M128c Cliente" } });
    const venda = await cru.emporioSale.create({
      data: { tenant_id: t.id, establishment_id: loja.id, customer_id: cliente.id, operation_key: `m128c-${stamp}`, number: 1, sold_at: new Date(), net_amount: 200 },
    });

    console.log("  (a) D2: compensação antes do depósito");
    const pgCheque = await cru.emporioSalePayment.create({ data: { tenant_id: t.id, sale_id: venda.id, kind: "cheque", amount: 50 } });
    const novoCheque = (n: string) =>
      cru.emporioCheck.create({
        data: {
          tenant_id: t.id, sale_id: venda.id, sale_payment_id: pgCheque.id, customer_id: cliente.id, establishment_id: loja.id,
          holder_name: "M128c Cliente", number: n, amount: 50, status: "depositado", bank_account_id: conta.id, deposited_at: new Date(),
        },
      });
    const ch1 = await novoCheque("1");
    const r1 = await X.compensarChequeAction(db, dono, ch1.id, { cleared_on: iso(ontem) });
    check("compensar com cleared_on de ontem é 422 em cleared_on", !r1.ok && r1.status === 422 && r1.field === "cleared_on", j(r1));
    check("a mensagem traz a data do depósito", !r1.ok && r1.message === `A compensação não pode ser antes do depósito (${br(hoje)}).`, j(r1.ok ? null : r1.message));
    const r2 = await X.compensarChequeAction(db, dono, ch1.id, { cleared_on: iso(hoje) });
    check("compensar com cleared_on de hoje passa", r2.ok, j(r2));

    console.log("  (b) D3: replay do fiado com outra data");
    const entrada = await cru.financialEntry.create({
      data: {
        tenant_id: t.id, entry_type: "income", amount: 100, status: "pending", emporio_customer_id: cliente.id, establishment_id: loja.id,
        related_module: "emporio", related_id: venda.id, category: "Vendas do Empório", due_date: hoje,
      },
    });
    const base = { customer_id: cliente.id, establishment_id: loja.id, amount: 40, kind: "pix", bank_account_id: conta.id, entry_id: entrada.id };
    const K = `m128c-fiado-${stamp}`;
    const f1 = await X.receberFiadoAction(db, dono, { ...base, operation_key: K, received_on: iso(ontem) });
    check("o primeiro recebimento (ontem) é gravado", f1.ok && !f1.data.replayed, j(f1));
    const f2 = await X.receberFiadoAction(db, dono, { ...base, operation_key: K, received_on: iso(hoje) });
    check("repetir a chave com data de hoje é 409 CONFLICT em received_on", !f2.ok && f2.status === 409 && f2.code === "CONFLICT" && f2.field === "received_on", j(f2));
    check("a mensagem traz a data gravada", !f2.ok && f2.message === `Este recebimento já foi gravado com a data ${br(ontem)}.`, j(f2.ok ? null : f2.message));
    const f3 = await X.receberFiadoAction(db, dono, { ...base, operation_key: K });
    check("repetir sem received_on devolve o gravado", f3.ok && f3.data.replayed === true, j(f3));
    const f4 = await X.receberFiadoAction(db, dono, { ...base, operation_key: K, received_on: iso(ontem) });
    check("repetir com a mesma data devolve o gravado", f4.ok && f4.data.replayed === true, j(f4));

    console.log("  (c) teto do valor pago do boleto");
    const novoBoleto = async () => {
      const pgBoleto = await cru.emporioSalePayment.create({ data: { tenant_id: t.id, sale_id: venda.id, kind: "boleto", amount: 30 } });
      return cru.emporioBoleto.create({
        data: { tenant_id: t.id, sale_id: venda.id, sale_payment_id: pgBoleto.id, customer_id: cliente.id, establishment_id: loja.id, due_on: hoje, amount: 30, status: "aberto" },
      });
    };
    const b1 = await novoBoleto();
    const p1 = await X.pagarBoletoAction(db, dono, b1.id, { bank_account_id: conta.id, paid_amount: 999999999999.995 });
    check("paid_amount 999999999999.995 é 422 em paid_amount", !p1.ok && p1.status === 422 && p1.field === "paid_amount", j(p1));
    const b2 = await novoBoleto();
    let p2: Dado;
    try {
      p2 = await X.pagarBoletoAction(db, dono, b2.id, { bank_account_id: conta.id, paid_amount: 999999999999.99 });
    } catch (e) {
      p2 = { ok: false, status: 500, field: "excecao", message: String(e) };
    }
    check("paid_amount 999999999999.99 passa da validação do valor", p2.ok || p2.field !== "paid_amount", j(p2));
  } catch (e) {
    check("a seção 3 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    const por = { where: { tenant_id: t.id } };
    for (const m of ["cashMovement", "emporioCheck", "emporioBoleto", "emporioSalePayment", "emporioSale", "financialPayment", "financialEntry", "emporioCustomer", "establishment", "bankAccount", "user"]) {
      await cru[m]?.deleteMany(por).catch((e: unknown) => console.log(`  (teardown ${m}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.tenant.delete({ where: { id: t.id } }).catch((e: unknown) => console.log(`  (teardown 3: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
  }
}

async function main() {
  const { prisma } = await import("@/lib/prisma");
  console.log("🧾 M128: Módulo 39 (Meu Empório), sobras das dívidas 5.23, 5.25, 5.28 e 5.30\n");
  await secao1();
  await secao2();
  await secao3();
  await prisma.$disconnect();
  console.log(`\nChecagens: ${total}`);
  console.log(falhas === 0 ? "\n✅ M128 (Módulo 39, Empório): sobras sem a Agromax passaram." : `\n❌ M128 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
