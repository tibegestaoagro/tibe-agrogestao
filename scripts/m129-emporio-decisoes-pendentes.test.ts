import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { papelDeFixture } from "./_emporio-papel";
import { AsyncLocalStorage } from "node:async_hooks";

exigirBancoLocal();
(globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = AsyncLocalStorage;

/**
 * Módulo 39 (Meu Empório), decisões de 23/11 (Q374 a Q384).
 * Roda: `npm run test:m129`
 *
 * Seção 2 (Q375): na ficha do cliente, o recebimento com data futura continua no "Em aberto" até o dia
 * chegar (fiado, cheque compensado e boleto pago). As próximas tarefas acrescentam as seções 3 a 7.
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

async function limparTenant(tenantId: string, rotulo: string) {
  const { prisma } = await import("@/lib/prisma");
  const cru = prisma as Dado;
  const por = { where: { tenant_id: tenantId } };
  await cru.emporioSale.updateMany({ ...por, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } }).catch(() => undefined);
  for (const m of ["emporioPaymentRequest", "cashMovement", "cashCount", "cashHandover", "cardAnticipation", "productionEntry", "stockTransfer"]) {
    await cru[m].deleteMany(por).catch((e: unknown) => console.log(`  (teardown ${m}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
  }
  await prisma.tenant.delete({ where: { id: tenantId } }).catch((e: unknown) => console.log(`  (teardown ${rotulo}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
}

async function secao2() {
  console.log("\n2. Ficha do cliente: recebimento agendado continua em aberto (Q375)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");
  const E: Dado = await import("@/lib/actions/emporio-estoque");
  const V: Dado = await import("@/lib/actions/emporio-vendas");
  const X: Dado = await import("@/lib/actions/emporio-caixa");
  const CL: Dado = await import("@/lib/actions/emporio-clientes");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");

  const hoje = hojeEmBrasilia();
  const amanha = new Date(hoje.getTime() + DIA);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M129b ${stamp}`, document: `M129B${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M129b dono", email: `m129b-${stamp}@teste.local`, password_hash: "x", role: "OWNER", ...papelDeFixture("OWNER") },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const db: Dado = prismaForTenant(t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M129b categoria" }) });
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M129b Loja", kind: "ponto_venda" })).data;
    const turno = await abrirTurnoDeTeste(db, dono, loja.id);
    const conta = (await X.criarContaAction(db, dono, { name: `M129b Conta ${stamp}`, bank: "B" })).data.id;
    const prod = (await C.criarProdutoEmporioAction(db, dono, { name: `M129b Milho ${stamp}`, category_id: cat.id, base_unit: "saca", content_qty: 20, content_unit: "quilograma" })).data;
    const ap = prod.presentations[0].id as string;
    await C.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: ap, price: 150 });
    await E.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: prod.id, sealed: [], loose_qty: 50, unit_cost: 10 });

    // Cliente com uma venda de 150 pela action: fiado 100, cheque 30 e boleto 20; depois os três recebimentos
    // pelas actions reais, todos no `dia` escolhido.
    const cenario = async (rotulo: string, dia: Date) => {
      const cliente = await db.emporioCustomer.create({ data: scoped({ name: `M129b ${rotulo}` }) });
      const rv = await V.venderAction(db, dono, {
        operation_key: `m129b-${rotulo}-${stamp}`, establishment_id: loja.id, customer_id: cliente.id, cash_register_id: turno.cash_register_id,
        items: [{ emporio_product_id: prod.id, presentation_id: ap, quantity: 1 }],
        payments: [
          { kind: "fiado", amount: 100, due_date: hoje },
          { kind: "cheque", amount: 30, check: { number: "1", bank: "001", good_for: hoje, holder_name: `M129b ${rotulo}` } },
          { kind: "boleto", amount: 20, boleto: { due_on: hoje } },
        ],
      });
      if (!rv.ok) throw new Error(`venda ${rotulo}: ${j(rv)}`);
      const cheque = await db.emporioCheck.findFirst({ where: { customer_id: cliente.id } });
      const boleto = await db.emporioBoleto.findFirst({ where: { customer_id: cliente.id } });
      const entrada = await db.financialEntry.findFirst({ where: { emporio_customer_id: cliente.id } });
      const d = iso(dia);
      const rf = await X.receberFiadoAction(db, dono, {
        operation_key: `m129b-fiado-${rotulo}-${stamp}`, customer_id: cliente.id, establishment_id: loja.id, amount: 40, kind: "pix",
        bank_account_id: conta, entry_id: entrada.id, received_on: d,
      });
      check(`${rotulo}: receber o fiado pela action passa`, rf.ok, j(rf));
      const dep = await X.depositarChequeAction(db, dono, cheque.id, { bank_account_id: conta });
      check(`${rotulo}: depositar o cheque pela action passa`, dep.ok, j(dep));
      const comp = await X.compensarChequeAction(db, dono, cheque.id, { cleared_on: d });
      check(`${rotulo}: compensar o cheque pela action passa`, comp.ok, j(comp));
      const pb = await X.pagarBoletoAction(db, dono, boleto.id, { bank_account_id: conta, paid_on: d });
      check(`${rotulo}: pagar o boleto pela action passa`, pb.ok, j(pb));
      return cliente.id as string;
    };

    console.log("  (a) tudo com a data de amanhã");
    const futuro = await cenario("futuro", amanha);
    const fa = await CL.lerFicha(db, dono, futuro);
    check("a ficha devolve ok", fa.ok, j(fa));
    if (fa.ok) {
      const r = fa.data.resumo;
      check("o Em aberto inclui o fiado (40), o cheque (30) e o boleto (20): 150", r.em_aberto === 150, String(r.em_aberto));
      check("o Recebido não inclui nenhum dos três: 0", r.recebido === 0, String(r.recebido));
      check("em aberto mais recebido é o total vendido (150)", r.em_aberto + r.recebido === 150, `${r.em_aberto} + ${r.recebido}`);
      check("o Vencido não conta o agendado: 0", r.vencido === 0, String(r.vencido));
    }
    const rc = await CL.listarRecebimentosDoClienteAction(db, dono, futuro);
    check("os três recebimentos seguem marcados como agendados", rc.ok && rc.data.items.filter((i: Dado) => i.scheduled).length === 3, j(rc.ok ? rc.data.items.map((i: Dado) => [i.kind, i.scheduled]) : rc));

    console.log("  (b) tudo com a data de hoje");
    const agora = await cenario("hoje", hoje);
    const fb = await CL.lerFicha(db, dono, agora);
    check("a ficha devolve ok", fb.ok, j(fb));
    if (fb.ok) {
      const r = fb.data.resumo;
      check("o Em aberto fica só com o que falta do fiado (60)", r.em_aberto === 60, String(r.em_aberto));
      check("o Recebido soma os três (90)", r.recebido === 90, String(r.recebido));
      check("em aberto mais recebido é o total vendido (150)", r.em_aberto + r.recebido === 150, `${r.em_aberto} + ${r.recebido}`);
    }
  } catch (e) {
    check("a seção 2 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    await limparTenant(t.id, "2");
  }
}

async function main() {
  const { prisma } = await import("@/lib/prisma");
  console.log("🧾 M129: Módulo 39 (Meu Empório), decisões de 23/11\n");
  await secao2();
  await prisma.$disconnect();
  console.log(`\nChecagens: ${total}`);
  console.log(falhas === 0 ? "\n✅ M129 (Módulo 39, decisões de 23/11): passou." : `\n❌ M129 (Módulo 39, decisões de 23/11): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
