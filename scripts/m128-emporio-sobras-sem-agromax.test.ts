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

async function main() {
  const { prisma } = await import("@/lib/prisma");
  console.log("🧾 M128: Módulo 39 (Meu Empório), sobras das dívidas 5.23, 5.25, 5.28 e 5.30\n");
  await secao1();
  await prisma.$disconnect();
  console.log(`\nChecagens: ${total}`);
  console.log(falhas === 0 ? "\n✅ M128 (Módulo 39, Empório): sobras sem a Agromax passaram." : `\n❌ M128 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
