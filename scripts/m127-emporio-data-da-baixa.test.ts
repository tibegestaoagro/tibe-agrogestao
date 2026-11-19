import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório): a data da baixa espelha o extrato do banco (Q370 a Q373).
 * Roda: `npm run test:m127`
 *
 * Seção 1: o helper puro da data (janela de 31 dias, instante gravado).
 * Seção 2: o saldo da conta só conta movimento com data até hoje; o de data futura
 * é "Agendado" no extrato, entra na Projeção e não paga despesa.
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

async function main() {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const H: Dado = await import("@/lib/emporio/data-da-baixa");
  const X: Dado = await import("@/lib/actions/emporio-caixa");
  const F: Dado = await import("@/lib/actions/emporio-financeiro");
  const P: Dado = await import("@/lib/actions/emporio-projecao");
  const D: Dado = await import("@/lib/actions/emporio-despesas");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");

  console.log("🗓️ M127: Módulo 39 (Meu Empório), a data da baixa espelha o extrato do banco\n");

  console.log("1. O helper da data da baixa");
  const hoje = hojeEmBrasilia();
  const agora = new Date();
  const somar = (d: Date, k: number) => new Date(d.getTime() + k * DIA);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const nulo = H.lerDataDaBaixa(null, hoje);
  check("nulo é hoje", nulo.ok && nulo.dia.getTime() === hoje.getTime(), j(nulo));
  check("indefinido é hoje", H.lerDataDaBaixa(undefined, hoje).ok);
  check("hoje menos 31 é aceito", H.lerDataDaBaixa(iso(somar(hoje, -31)), hoje).ok);
  check("hoje mais 31 é aceito", H.lerDataDaBaixa(iso(somar(hoje, 31)), hoje).ok);
  check("aceita um Date (dia de calendário em UTC)", H.lerDataDaBaixa(somar(hoje, 3), hoje).ok);
  const antes = H.lerDataDaBaixa(iso(somar(hoje, -32)), hoje);
  const depois = H.lerDataDaBaixa(iso(somar(hoje, 32)), hoje);
  const br = (d: Date) => `${iso(d).slice(8, 10)}/${iso(d).slice(5, 7)}/${iso(d).slice(0, 4)}`;
  const mensagem = `A data precisa estar entre ${br(somar(hoje, -31))} e ${br(somar(hoje, 31))}.`;
  check("hoje menos 32 é recusado com a janela", !antes.ok && antes.mensagem === mensagem, j(antes));
  check("hoje mais 32 é recusado com a janela", !depois.ok && depois.mensagem === mensagem, j(depois));
  check("2026-02-30 é recusado", !H.lerDataDaBaixa("2026-02-30", hoje).ok);
  check("abc é recusado", !H.lerDataDaBaixa("abc", hoje).ok);
  check("o instante de hoje é agora", H.instanteDaBaixa(hoje, hoje, agora).getTime() === agora.getTime());
  const amanha = somar(hoje, 1);
  check("o instante de outro dia é o meio-dia de Brasília (dia mais 15 h)", H.instanteDaBaixa(amanha, hoje, agora).getTime() === amanha.getTime() + 15 * 3_600_000);
  const fim = H.fimDeHojeEmBrasilia(agora);
  check("fimDeHojeEmBrasilia é o início de amanhã em Brasília (03:00 UTC)", fim.getTime() === amanha.getTime() + 3 * 3_600_000, fim.toISOString());

  console.log("\n2. O saldo da conta só conta movimento com data até hoje");
  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M127 ${stamp}`, document: `M127${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M127 dono", email: `m127-${stamp}@teste.local`, password_hash: "x", role: "OWNER" },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const db = prismaForTenant(t.id);
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M127 Loja", kind: "ponto_venda" })).data;
    const conta = await db.bankAccount.create({ data: scoped({ name: `M127 Conta ${stamp}` }) });
    const meioDiaDeAmanha = new Date(amanha.getTime() + 15 * 3_600_000);

    await db.cashMovement.create({ data: scoped({ bank_account_id: conta.id, direction: "entrada", origin: "implantacao", amount: 100, occurred_at: new Date() }) });
    const agendado = await db.cashMovement.create({
      data: scoped({ bank_account_id: conta.id, direction: "entrada", origin: "implantacao", amount: 50, occurred_at: meioDiaDeAmanha, notes: "Agendado de teste" }),
    });

    const saldo = async () => ((await X.saldosDasContas(db)).get(conta.id) ?? 0) / 100;
    check("o saldo da conta é 100 (o de amanhã não entra)", (await saldo()) === 100, String(await saldo()));

    const ext = await F.lerExtratoDaContaAction(db, dono, { bank_account_id: conta.id, de: somar(hoje, -1), ate: somar(hoje, 3) });
    check("o extrato devolve ok", ext.ok, j(ext));
    if (ext.ok) {
      const v = ext.data;
      check("o agendado de 50 está em scheduled", v.scheduled.length === 1 && v.scheduled[0].id === agendado.id && v.scheduled[0].amount === 50, j(v.scheduled));
      check("o agendado não está em lines", !v.lines.some((l: Dado) => l.id === agendado.id), j(v.lines));
      check("o saldo final das linhas é 100", v.closing_balance === 100, String(v.closing_balance));
    }

    const proj = await P.lerFluxoProjetadoAction(db, dono, { days: 30 });
    check("a projeção devolve ok", proj.ok, j(proj));
    if (proj.ok) {
      const dAmanha = iso(amanha);
      const semana = proj.data.weeks.find((w: Dado) => w.de <= dAmanha && dAmanha <= w.ate);
      check("a projeção soma 50 em scheduled da semana de amanhã", semana?.receivables.scheduled === 50, j(semana));
      check("o saldo de abertura da projeção segue 100", proj.data.opening_balance === 100, String(proj.data.opening_balance));
    }

    const conta120 = await D.criarContaAvulsaAction(db, dono, {
      establishment_id: loja.id, description: "Despesa de 120", amount: 120, due_date: new Date(), status: "pending", emporio_other_name: "Avulso",
    });
    check("a despesa de 120 nasce pendente", conta120.ok, j(conta120));
    if (conta120.ok) {
      const pago = await D.pagarDespesasAction(db, dono, { entry_ids: [conta120.data.entry.entry_id], from: { bank_account_id: conta.id } });
      check("pagar 120 por essa conta é recusado por saldo insuficiente", !pago.ok && pago.code === "INSUFFICIENT_CASH", j(pago));
    }

    await db.cashMovement.update({ where: { id: agendado.id }, data: { occurred_at: new Date() } });
    check("o mesmo movimento com a data de hoje entra no saldo (150)", (await saldo()) === 150, String(await saldo()));
  } catch (e) {
    check("a suíte terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    const por = { where: { tenant_id: t.id } };
    const cru = prisma as Dado;
    for (const m of ["cashMovement", "financialPayment"]) {
      await cru[m].deleteMany(por).catch((e: unknown) => console.log(`  (teardown ${m}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.tenant.delete({ where: { id: t.id } }).catch((e: unknown) => console.log(`  (teardown: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    await prisma.$disconnect();
  }
  console.log(`\nChecagens: ${total}`);
  console.log(falhas === 0 ? "\n✅ M127 (Módulo 39, Empório): data da baixa passou." : `\n❌ M127 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
