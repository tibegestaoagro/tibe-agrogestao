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

async function secao3() {
  console.log("\n3. Orçamento faturado: cliente travado, validade pelo dia de hoje, linha repetida (Q382, Q383, Q384)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");
  const E: Dado = await import("@/lib/actions/emporio-estoque");
  const V: Dado = await import("@/lib/actions/emporio-vendas");
  const O: Dado = await import("@/lib/actions/emporio-orcamentos");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");

  const hoje = hojeEmBrasilia();
  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M129c ${stamp}`, document: `M129C${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M129c dono", email: `m129c-${stamp}@teste.local`, password_hash: "x", role: "OWNER", ...papelDeFixture("OWNER") },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const db: Dado = prismaForTenant(t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M129c categoria" }) });
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M129c Loja", kind: "ponto_venda" })).data;
    const turno = await abrirTurnoDeTeste(db, dono, loja.id);
    const prod = (await C.criarProdutoEmporioAction(db, dono, { name: `M129c Milho ${stamp}`, category_id: cat.id, base_unit: "saca", content_qty: 20, content_unit: "quilograma" })).data;
    const ap = prod.presentations[0].id as string;
    const preco = (p: number) => C.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: ap, price: p });
    await preco(150);
    await E.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: prod.id, sealed: [], loose_qty: 200, unit_cost: 10 });
    const clienteDe = (nome: string, doc: string) =>
      db.emporioCustomer.create({ data: scoped({ name: `M129c ${nome}`, person_kind: "pf", document: doc, phone: "11977776666" }) });
    const A = await clienteDe("Ana", "15350946056");
    const B = await clienteDe("Beto", "52998224725");

    let k = 0;
    const chave = (s: string) => `m129c-${stamp}-${s}-${(k += 1)}`;
    const item = (q = 1) => ({ emporio_product_id: prod.id, presentation_id: ap, quantity: q });
    const orcar = async (items: Dado[] = [item()]) => {
      const r = await O.salvarOrcamentoAction(db, dono, { operation_key: chave("orc"), establishment_id: loja.id, customer_id: A.id, items });
      if (!r.ok) throw new Error(`orçamento: ${j(r)}`);
      return r.data;
    };
    const faturar = (quoteId: string, total: number, extra: Dado = {}) =>
      V.venderAction(db, dono, {
        operation_key: chave("venda"), establishment_id: loja.id, quote_id: quoteId, cash_register_id: turno.cash_register_id,
        items: [item()], payments: [{ kind: "dinheiro", amount: total }], ...extra,
      });

    console.log("  (a) o cliente da venda é o do orçamento (Q382)");
    const qa = await orcar();
    const ra = await faturar(qa.id, 150, { customer_id: B.id });
    check("customer_id de outro cliente: 422 em customer_id", !ra.ok && ra.status === 422 && ra.field === "customer_id", j(ra));
    check(
      "a mensagem nomeia o cliente do orçamento",
      !ra.ok && ra.message === "Esta venda vem do orçamento de M129c Ana: o cliente não pode ser trocado.",
      j(ra),
    );
    check("nada foi gravado: o orçamento segue aberto", (await db.emporioSale.count()) === 0);

    console.log("  (d) sem customer_id, a venda assume o cliente do orçamento");
    const rd = await faturar(qa.id, 150);
    check("a venda sai", rd.ok, j(rd));
    if (rd.ok) {
      const linha = await db.emporioSale.findFirst({ where: { id: rd.data.id } });
      check("com o cliente do orçamento (Ana)", linha?.customer_id === A.id, j(linha?.customer_id));
    }
    const qa2 = await orcar();
    const rigual = await faturar(qa2.id, 150, { customer_id: A.id });
    check("customer_id igual ao do orçamento segue aceito", rigual.ok, j(rigual));

    console.log("  (b) a validade olha o dia de hoje, não o sold_at (Q383)");
    const qb = await orcar(); // orçado a 150
    await db.emporioQuote.update({ where: { id: qb.id }, data: { valid_until: new Date(hoje.getTime() - DIA) } });
    await preco(200);
    const anteontem = new Date(Date.now() - 2 * DIA);
    const rb = await faturar(qb.id, 200, { sold_at: anteontem, customer_id: A.id });
    check("a venda sai", rb.ok, j(rb));
    check("vencido ontem, sold_at de anteontem: vale o preço de hoje (200), não o orçado (150)", rb.ok && rb.data.items[0].unit_price === 200, j(rb.ok ? rb.data.items : rb));
    if (rb.ok) check("o sold_at enviado segue sendo a data da venda", Math.abs(new Date(rb.data.sold_at).getTime() - anteontem.getTime()) < 1000, j(rb.data.sold_at));
    await preco(150);

    console.log("  (c) a mesma apresentação em duas linhas do orçamento (Q384)");
    const dup = [item(1), item(2)];
    const rs = await O.salvarOrcamentoAction(db, dono, { operation_key: chave("dup"), establishment_id: loja.id, customer_id: A.id, items: dup });
    check("salvar: 422 em items", !rs.ok && rs.status === 422 && rs.field === "items", j(rs));
    check(
      "a mensagem diz qual produto e pede para juntar",
      !rs.ok && rs.message === `${prod.name ?? `M129c Milho ${stamp}`} aparece em duas linhas: junte numa só.`,
      j(rs),
    );
    check("nenhum orçamento gravado com a chave", (await db.emporioQuote.count({ where: { operation_key: { contains: "-dup-" } } })) === 0);
    const qe = await orcar();
    const re = await O.editarOrcamentoAction(db, dono, qe.id, { establishment_id: loja.id, customer_id: A.id, items: dup });
    check("editar para isso: 422 em items", !re.ok && re.status === 422 && re.field === "items", j(re));
    const depois = await db.emporioQuoteItem.count({ where: { quote_id: qe.id } });
    check("e o orçamento fica com a linha que tinha", depois === 1, String(depois));
    const rok = await O.editarOrcamentoAction(db, dono, qe.id, { establishment_id: loja.id, customer_id: A.id, items: [item(3)] });
    check("uma linha só segue editando", rok.ok, j(rok));
  } catch (e) {
    check("a seção 3 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    await limparTenant(t.id, "3");
  }
}

async function secao4() {
  console.log("\n4. Devolução tira o crédito do franqueado na proporção do que voltou (Q379)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");
  const E: Dado = await import("@/lib/actions/emporio-estoque");
  const V: Dado = await import("@/lib/actions/emporio-vendas");
  const FR: Dado = await import("@/lib/actions/emporio-franqueados");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");

  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M129d ${stamp}`, document: `M129D${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M129d dono", email: `m129d-${stamp}@teste.local`, password_hash: "x", role: "OWNER", ...papelDeFixture("OWNER") },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const db: Dado = prismaForTenant(t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M129d categoria" }) });
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M129d Loja", kind: "ponto_venda" })).data;
    const turno = await abrirTurnoDeTeste(db, dono, loja.id);
    const produto = async (nome: string, preco: number) => {
      const p = (await C.criarProdutoEmporioAction(db, dono, { name: `M129d ${nome} ${stamp}`, category_id: cat.id, base_unit: "saca", content_qty: 20, content_unit: "quilograma" })).data;
      const ap = p.presentations[0].id as string;
      await C.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: ap, price: preco });
      await E.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: p.id, sealed: [], loose_qty: 100, unit_cost: 1 });
      return { id: p.id as string, ap };
    };
    const p60 = await produto("A", 60);
    const p40 = await produto("B", 40);
    const p30 = await produto("C", 30);
    const item = (p: { id: string; ap: string }, q = 1) => ({ emporio_product_id: p.id, presentation_id: p.ap, quantity: q });
    const franqueado = async (nome: string) => {
      const r = await FR.cadastrarFranqueadoAction(db, dono, { name: `M129d ${nome}`, phone: "11999990000" });
      if (!r.ok) throw new Error(`franqueado: ${j(r)}`);
      return r.data.id as string;
    };
    const cliente = await db.emporioCustomer.create({ data: scoped({ name: "M129d Cliente" }) });
    let k = 0;
    const chave = (s: string) => `m129d-${stamp}-${s}-${(k += 1)}`;
    const vender = async (items: Dado[], pagamento: Dado, extra: Dado = {}) => {
      const r = await V.venderAction(db, dono, {
        operation_key: chave("venda"), establishment_id: loja.id, customer_id: cliente.id, cash_register_id: turno.cash_register_id,
        items, payments: [pagamento], ...extra,
      });
      if (!r.ok) throw new Error(`venda: ${j(r)}`);
      return r.data;
    };
    const dinheiroDe = (amount: number) => ({ kind: "dinheiro", amount });
    const devolver = (saleId: string, saleItemId: string, quantity: number, refund_kind = "dinheiro") =>
      V.devolverAction(db, dono, saleId, {
        operation_key: chave("dev"), refund_kind, items: [{ sale_item_id: saleItemId, quantity }], cash_register_id: turno.cash_register_id,
      });
    const saidaDe = async (devolucaoId: string) => {
      const m = await db.cashMovement.findMany({ where: { sale_return_id: devolucaoId, direction: "saida" } });
      return m.reduce((s: number, x: Dado) => s + Number(x.amount), 0);
    };
    const saldo = async (id: string) => {
      const r = await FR.lerFranqueadoAction(db, dono, id);
      if (!r.ok) throw new Error(`franqueado: ${j(r)}`);
      return r.data as Dado;
    };
    const itemDe = (venda: Dado, produtoId: string) => venda.items.find((i: Dado) => i.emporio_product_id === produtoId).id as string;

    console.log("  (a) venda de 60 + 40 com crédito 10: devolver um item e depois o outro");
    const fa = await franqueado("Ana");
    const va = await vender([item(p60), item(p40)], dinheiroDe(110), { franchisee_id: fa, franchisee_credit: 10 });
    check("o saldo começa em 10", (await saldo(fa)).balance === 10);
    const d1 = await devolver(va.id, itemDe(va, p60.id), 1);
    check("devolver o item de 60 passa", d1.ok, j(d1));
    if (d1.ok) {
      check("amount segue sendo o valor do item (60)", d1.data.amount === 60, String(d1.data.amount));
      check("franchisee_credit da devolução é 6", d1.data.franchisee_credit === 6, String(d1.data.franchisee_credit));
      check("o cliente recebe 66 (saída de caixa)", (await saidaDe(d1.data.id)) === 66, String(await saidaDe(d1.data.id)));
    }
    check("o franqueado perde 6: saldo 4", (await saldo(fa)).balance === 4, String((await saldo(fa)).balance));
    const d2 = await devolver(va.id, itemDe(va, p40.id), 1);
    check("devolver o item de 40 passa", d2.ok, j(d2));
    if (d2.ok) {
      check("franchisee_credit da devolução é 4", d2.data.franchisee_credit === 4, String(d2.data.franchisee_credit));
      check("o cliente recebe 44", (await saidaDe(d2.data.id)) === 44, String(await saidaDe(d2.data.id)));
    }
    const sa = await saldo(fa);
    check("tudo devolvido: saldo 0", sa.balance === 0, String(sa.balance));
    const linhasDev = sa.statement.filter((l: Dado) => l.kind === "devolucao");
    check(
      "o extrato tem duas linhas de devolução da venda, negativas (-6 e -4)",
      linhasDev.length === 2 && linhasDev.every((l: Dado) => l.sale_id === va.id && l.sale_number === va.number) &&
        linhasDev.map((l: Dado) => l.amount).sort((x: number, y: number) => x - y).join() === "-6,-4",
      j(linhasDev),
    );
    const hist = await db.emporioAuditLog.findMany({ where: { action: "venda.devolver", target_id: va.id } });
    check("o histórico da devolução cita a parte do crédito", hist.length === 2 && hist.every((h: Dado) => String(h.summary).includes("crédito do franqueado")), j(hist.map((h: Dado) => h.summary)));

    console.log("  (b) devolução parcial em duas vezes: 1 de 3 e depois 2 de 3");
    const fb = await franqueado("Beto");
    const vb = await vender([item(p30, 3)], dinheiroDe(100), { franchisee_id: fb, franchisee_credit: 10 });
    const b1 = await devolver(vb.id, vb.items[0].id, 1);
    const b2 = await devolver(vb.id, vb.items[0].id, 2);
    check("as duas passam", b1.ok && b2.ok, j([b1, b2]));
    if (b1.ok && b2.ok) {
      check("a primeira leva 3,33 (um terço de 10, no centavo)", b1.data.franchisee_credit === 3.33, String(b1.data.franchisee_credit));
      check("a segunda leva o resto: 6,67", b2.data.franchisee_credit === 6.67, String(b2.data.franchisee_credit));
      check("a soma é exatamente a parte do item (10,00)", Math.round((b1.data.franchisee_credit + b2.data.franchisee_credit) * 100) === 1000);
    }
    check("saldo 0", (await saldo(fb)).balance === 0);

    console.log("  (c) venda sem crédito: nada muda");
    const vc = await vender([item(p60)], dinheiroDe(60));
    const c1 = await devolver(vc.id, vc.items[0].id, 1);
    check("a devolução passa", c1.ok, j(c1));
    if (c1.ok) {
      check("franchisee_credit 0", c1.data.franchisee_credit === 0, String(c1.data.franchisee_credit));
      check("o cliente recebe 60", (await saidaDe(c1.data.id)) === 60);
    }

    console.log("  (d) crédito já pago ao franqueado: o saldo fica negativo (Q305)");
    const fd = await franqueado("Duda");
    const vd = await vender([item(p60), item(p40)], dinheiroDe(110), { franchisee_id: fd, franchisee_credit: 10 });
    const pg = await FR.pagarFranqueadoAction(db, dono, fd, { operation_key: chave("pag"), amount: 10, paid_from: { establishment_id: loja.id, cash_register_id: turno.cash_register_id } });
    check("pagar o crédito pela action passa", pg.ok, j(pg));
    const dd = await devolver(vd.id, itemDe(vd, p60.id), 1);
    check("devolver passa", dd.ok, j(dd));
    check("saldo -6", (await saldo(fd)).balance === -6, String((await saldo(fd)).balance));

    console.log("  (e) abater do fiado leva o valor com a parte do crédito");
    const fe = await franqueado("Edu");
    const ve = await vender([item(p60), item(p40)], { kind: "fiado", amount: 110, due_date: new Date(Date.now() + 30 * DIA) }, { franchisee_id: fe, franchisee_credit: 10 });
    const e1 = await devolver(ve.id, itemDe(ve, p60.id), 1, "abater_fiado");
    check("abater passa", e1.ok, j(e1));
    const lanc = await db.financialEntry.findFirst({ where: { related_module: "emporio", entry_type: "income", related_id: ve.id } });
    check("o fiado da venda caiu de 110 para 44", lanc && Number(lanc.amount) === 44, j(lanc?.amount));
    check("saldo do franqueado 4", (await saldo(fe)).balance === 4);

    console.log("  (f) troca: o valor que abate a venda nova leva a parte do crédito");
    const ff = await franqueado("Fabi");
    const vf = await vender([item(p60), item(p40)], dinheiroDe(110), { franchisee_id: ff, franchisee_credit: 10 });
    const tr = await V.trocarAction(db, dono, vf.id, {
      operation_key: chave("troca"), items_devolvidos: [{ sale_item_id: itemDe(vf, p60.id), quantity: 1 }], cash_register_id: turno.cash_register_id,
      venda: { customer_id: cliente.id, establishment_id: loja.id, items: [item(p40)], payments: [] },
    });
    check("a troca passa", tr.ok, j(tr));
    if (tr.ok) {
      check("a devolução da troca leva crédito 6", tr.data.devolucao.franchisee_credit === 6, String(tr.data.devolucao.franchisee_credit));
      check("a diferença devolvida na gaveta é 26 (66 menos a venda nova de 40)", (await saidaDe(tr.data.devolucao.id)) === 26, String(await saidaDe(tr.data.devolucao.id)));
    }
    check("saldo do franqueado 4", (await saldo(ff)).balance === 4);

    console.log("  (g) ficha do cliente: o valor devolvido é o que o cliente recebeu (item mais crédito)");
    const CL: Dado = await import("@/lib/actions/emporio-clientes");
    const fg = await franqueado("Gil");
    const clienteG = await db.emporioCustomer.create({ data: scoped({ name: "M129d Cliente G" }) });
    const rg = await V.venderAction(db, dono, {
      operation_key: chave("venda-g"), establishment_id: loja.id, customer_id: clienteG.id, cash_register_id: turno.cash_register_id,
      items: [item(p60), item(p40)], payments: [dinheiroDe(110)], franchisee_id: fg, franchisee_credit: 10,
    });
    check("a venda com crédito passa", rg.ok, j(rg));
    if (rg.ok) {
      const dg = await devolver(rg.data.id, itemDe(rg.data, p60.id), 1);
      check("devolver o item de 60 passa", dg.ok, j(dg));
      const rec = await CL.listarRecebimentosDoClienteAction(db, dono, clienteG.id);
      const linha = rec.ok ? rec.data.items.find((i: Dado) => i.kind === "devolucao") : undefined;
      check("a linha de devolução da ficha mostra -66", !!linha && linha.amount === -66, j(linha?.amount));
      const fgRes = await CL.lerFicha(db, dono, clienteG.id);
      check("a ficha devolve ok", fgRes.ok, j(fgRes));
      if (fgRes.ok) {
        const r = fgRes.data.resumo;
        check("o Recebido é o pago menos o devolvido (110 - 66 = 44)", r.recebido === 44, String(r.recebido));
        check("o Em aberto é 0", r.em_aberto === 0, String(r.em_aberto));
        check("o total comprado segue em valor de item (100 - 60 = 40, o crédito não é mercadoria)", r.total_comprado === 40, String(r.total_comprado));
      }
    }
  } catch (e) {
    check("a seção 4 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    await limparTenant(t.id, "4");
  }
}

async function secao5() {
  console.log("\n5. Franqueado no Caixa: escolhe o franqueado e digita o crédito na venda (Q378)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");
  const E: Dado = await import("@/lib/actions/emporio-estoque");
  const V: Dado = await import("@/lib/actions/emporio-vendas");
  const FR: Dado = await import("@/lib/actions/emporio-franqueados");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const { vincularTodas } = await import("./_emporio-papel");

  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M129e ${stamp}`, document: `M129E${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M129e dono", email: `m129e-${stamp}@teste.local`, password_hash: "x", role: "OWNER", ...papelDeFixture("OWNER") },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const uc = await prisma.user.create({
      data: { tenant_id: t.id, name: "M129e caixa", email: `m129e-cx-${stamp}@teste.local`, password_hash: "x", role: "OPERADOR", emporio_role: "caixa", emporio_only: false, emporio_keys: [] },
    });
    const caixa = { id: uc.id, role: "OPERADOR" as const };
    const db: Dado = prismaForTenant(t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M129e categoria" }) });
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M129e Loja", kind: "ponto_venda" })).data;
    await vincularTodas(prisma as Dado, t.id, [uc.id], [loja.id]);
    const turno = await abrirTurnoDeTeste(db, dono, loja.id);
    const prod = (await C.criarProdutoEmporioAction(db, dono, { name: `M129e Milho ${stamp}`, category_id: cat.id, base_unit: "saca", content_qty: 20, content_unit: "quilograma" })).data;
    const ap = prod.presentations[0].id as string;
    await C.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: ap, price: 100 });
    await E.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: prod.id, sealed: [], loose_qty: 50, unit_cost: 10 });
    const cliente = await db.emporioCustomer.create({ data: scoped({ name: "M129e Cliente" }) });

    const ativo = (await FR.cadastrarFranqueadoAction(db, dono, { name: "M129e Ativo", phone: "11999990001" })).data;
    const arq = (await FR.cadastrarFranqueadoAction(db, dono, { name: "M129e Arquivado", phone: "11999990002" })).data;
    const ra = await FR.arquivarFranqueadoAction(db, dono, arq.id, true);
    check("arquivar o segundo franqueado pela action passa", ra.ok, j(ra));

    const lista = await FR.listarFranqueadosParaVendaAction(db, caixa);
    check("o Caixa lê a lista da venda", lista.ok, j(lista));
    if (lista.ok) {
      check("só o ativo vem (o arquivado não)", lista.data.length === 1 && lista.data[0].id === ativo.id, j(lista.data));
      check("cada item tem só id e name", j(Object.keys(lista.data[0]).sort()) === j(["id", "name"]), j(Object.keys(lista.data[0])));
    }
    const daAba = await FR.listarFranqueadosAction(db, caixa);
    check("a aba Franqueados segue recusando o Caixa", !daAba.ok && daAba.status === 403, j(daAba));
    const ficha = await FR.lerFranqueadoAction(db, caixa, ativo.id);
    check("a ficha (saldo e extrato) segue recusando o Caixa", !ficha.ok && ficha.status === 403, j(ficha));
    const doDono = await FR.listarFranqueadosParaVendaAction(db, dono);
    check("o dono lê a mesma lista", doDono.ok && doDono.data.length === 1, j(doDono));

    const rv = await V.venderAction(db, caixa, {
      operation_key: `m129e-${stamp}`, establishment_id: loja.id, customer_id: cliente.id, cash_register_id: turno.cash_register_id,
      seller_user_id: dono.id, franchisee_id: ativo.id, franchisee_credit: 10,
      items: [{ emporio_product_id: prod.id, presentation_id: ap, quantity: 1 }],
      payments: [{ kind: "dinheiro", amount: 110 }],
    });
    check("a venda pelo Caixa com franqueado e crédito grava", rv.ok, j(rv));
    if (rv.ok) {
      const venda = await db.emporioSale.findFirst({ where: { id: rv.data.id } });
      check("a venda guarda o franqueado e o crédito 10", venda?.franchisee_id === ativo.id && Number(venda?.franchisee_credit) === 10, j([venda?.franchisee_id, String(venda?.franchisee_credit)]));
    }
  } catch (e) {
    check("a seção 5 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    await limparTenant(t.id, "5");
  }
}

async function secao6() {
  console.log("\n6. Parcela conferida pela antecipação: o desfazer some, a explicação aparece (Q377)");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");
  const E: Dado = await import("@/lib/actions/emporio-estoque");
  const V: Dado = await import("@/lib/actions/emporio-vendas");
  const X: Dado = await import("@/lib/actions/emporio-caixa");
  const K: Dado = await import("@/lib/actions/emporio-cartoes");
  const F: Dado = await import("@/lib/actions/emporio-financeiro");
  const CC: Dado = await import("@/lib/actions/emporio-conferencia-cartao");
  const AN: Dado = await import("@/lib/actions/emporio-antecipacao");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");

  const hoje = hojeEmBrasilia();
  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M129f ${stamp}`, document: `M129F${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M129f dono", email: `m129f-${stamp}@teste.local`, password_hash: "x", role: "OWNER", ...papelDeFixture("OWNER") },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const db: Dado = prismaForTenant(t.id);
    const cru: Dado = prisma;
    const cat = await db.productCategory.create({ data: scoped({ name: "M129f categoria" }) });
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M129f Loja", kind: "ponto_venda" })).data;
    const turno = await abrirTurnoDeTeste(db, dono, loja.id);
    const conta = (await X.criarContaAction(db, dono, { name: `M129f Conta ${stamp}`, bank: "B" })).data.id as string;
    const adq = (await K.criarAdquirenteAction(db, dono, { name: `M129f Adq ${stamp}` })).data.id as string;
    const taxa = await K.criarTaxaAction(db, dono, {
      establishment_id: loja.id, acquirer_id: adq, brand: "qualquer", kind: "credito_vista", installments_from: 1, installments_to: 1,
      fee_pct: 2, days: 30, bank_account_id: conta, valid_from: new Date("2020-01-01T12:00:00.000Z"),
    });
    if (!taxa.ok) throw new Error(`taxa: ${j(taxa)}`);
    const prod = (await C.criarProdutoEmporioAction(db, dono, { name: `M129f Milho ${stamp}`, category_id: cat.id, base_unit: "saca", content_qty: 20, content_unit: "quilograma" })).data;
    const ap = prod.presentations[0].id as string;
    await C.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: ap, price: 100 });
    await E.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: prod.id, sealed: [], loose_qty: 50, unit_cost: 10 });

    const cliente = await db.emporioCustomer.create({ data: scoped({ name: "M129f Cliente" }) });
    let k = 0;
    const vender = async () => {
      const r = await V.venderAction(db, dono, {
        operation_key: `m129f-${stamp}-${(k += 1)}`, establishment_id: loja.id, customer_id: cliente.id, cash_register_id: turno.cash_register_id,
        items: [{ emporio_product_id: prod.id, presentation_id: ap, quantity: 1 }],
        payments: [{ kind: "credito_vista", amount: 100, acquirer_id: adq, brand: "visa_master" }],
      });
      if (!r.ok) throw new Error(`venda: ${j(r)}`);
      const linhas = await cru.cardReceivable.findMany({ where: { sale_id: r.data.id } });
      if (linhas.length !== 1) throw new Error(`esperava 1 parcela, vieram ${linhas.length}`);
      return linhas[0].id as string;
    };
    const daLista = async (id: string) => {
      const r = await F.listarContasAReceberAction(db, dono, {});
      if (!r.ok) throw new Error(`a receber: ${j(r)}`);
      return r.data.cards.find((c: Dado) => c.id === id);
    };

    console.log("  (a) conferida pela antecipação pontual");
    const pa = await vender();
    const opa = await AN.anteciparAction(db, dono, { receivable_ids: [pa], operated_on: hoje, received_net: 95 });
    check("antecipar pela action passa", opa.ok, j(opa));
    const va = await daLista(pa);
    check("a parcela está conferida", va?.status === "conferida", j(va?.status));
    check("conferida_pela_antecipacao é verdadeiro", va?.conferida_pela_antecipacao === true, j(va?.conferida_pela_antecipacao));
    const da = await CC.desfazerConferenciaAction(db, dono, pa, { reason: "teste" });
    check("a action recusa com o mesmo critério (CONFERIDA_PELA_ANTECIPACAO)", !da.ok && da.code === "CONFERIDA_PELA_ANTECIPACAO", j(da));

    console.log("  (b) conferida à mão");
    const pb = await vender();
    await cru.cardReceivable.update({ where: { id: pb }, data: { effective_on: new Date(hoje.getTime() - 2 * DIA) } });
    const cb = await CC.conferirParcelaAction(db, dono, pb, { received_amount: 97 });
    check("conferir pela action passa", cb.ok, j(cb));
    check("conferida_pela_antecipacao é falso (e presente)", cb.ok && cb.data.conferida_pela_antecipacao === false, j(cb.ok ? cb.data.conferida_pela_antecipacao : cb));
    const vb = await daLista(pb);
    check("na lista também: conferida e falso", vb?.status === "conferida" && vb?.conferida_pela_antecipacao === false, j([vb?.status, vb?.conferida_pela_antecipacao]));

    console.log("  (c) antecipação desfeita");
    const opId = opa.ok ? (opa.data.id as string) : "x";
    const dd = await AN.desfazerAntecipacaoAction(db, dono, opId);
    check("desfazer a antecipação pela action passa", dd.ok, j(dd));
    const vc = await daLista(pa);
    check("a parcela volta sem conferência e o campo é falso", vc?.status !== "conferida" && vc?.conferida_pela_antecipacao === false, j([vc?.status, vc?.conferida_pela_antecipacao]));
  } catch (e) {
    check("a seção 6 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    await limparTenant(t.id, "6");
  }
}

async function secao7() {
  console.log("\n7. Sobras da 5.31: teto do valor pago do boleto e papel antes do 409 do fiado");
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const C: Dado = await import("@/lib/actions/emporio-catalogo");
  const E: Dado = await import("@/lib/actions/emporio-estoque");
  const V: Dado = await import("@/lib/actions/emporio-vendas");
  const X: Dado = await import("@/lib/actions/emporio-caixa");
  const { vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");

  const hoje = hojeEmBrasilia();
  const ontem = new Date(hoje.getTime() - DIA);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const stamp = Date.now();
  const t = await prisma.tenant.create({
    data: { name: `M129g ${stamp}`, document: `M129G${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  try {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: "M129g dono", email: `m129g-${stamp}@teste.local`, password_hash: "x", role: "OWNER", ...papelDeFixture("OWNER") },
    });
    const uc = await prisma.user.create({
      data: { tenant_id: t.id, name: "M129g caixa", email: `m129g-cx-${stamp}@teste.local`, password_hash: "x", role: "OPERADOR", emporio_role: "caixa", emporio_keys: [] },
    });
    const dono = { id: u.id, role: "OWNER" as const };
    const caixa = { id: uc.id, role: "OPERADOR" as const };
    const db: Dado = prismaForTenant(t.id);
    const cat = await db.productCategory.create({ data: scoped({ name: "M129g categoria" }) });
    const loja = (await C.criarEstabelecimentoAction(db, dono, { name: "M129g Loja", kind: "ponto_venda" })).data;
    await vincularTodas(prisma as Dado, t.id, [uc.id], [loja.id]);
    const turno = await abrirTurnoDeTeste(db, dono, loja.id);
    const conta = (await X.criarContaAction(db, dono, { name: `M129g Conta ${stamp}`, bank: "B" })).data.id as string;
    const prod = (await C.criarProdutoEmporioAction(db, dono, { name: `M129g Milho ${stamp}`, category_id: cat.id, base_unit: "saca", content_qty: 20, content_unit: "quilograma" })).data;
    const ap = prod.presentations[0].id as string;
    await C.definirPrecoAction(db, dono, { establishment_id: loja.id, presentation_id: ap, price: 150 });
    await E.implantarEstoqueAction(db, dono, { establishment_id: loja.id, emporio_product_id: prod.id, sealed: [], loose_qty: 50, unit_cost: 10 });

    const cliente = await db.emporioCustomer.create({ data: scoped({ name: "M129g Cliente" }) });
    const rv = await V.venderAction(db, dono, {
      operation_key: `m129g-${stamp}`, establishment_id: loja.id, customer_id: cliente.id, cash_register_id: turno.cash_register_id,
      items: [{ emporio_product_id: prod.id, presentation_id: ap, quantity: 1 }],
      payments: [{ kind: "fiado", amount: 130, due_date: hoje }, { kind: "boleto", amount: 20, boleto: { due_on: hoje } }],
    });
    if (!rv.ok) throw new Error(`venda: ${j(rv)}`);
    const boleto = await db.emporioBoleto.findFirst({ where: { customer_id: cliente.id } });
    const entrada = await db.financialEntry.findFirst({ where: { emporio_customer_id: cliente.id } });

    console.log("  (a) teto do valor pago do boleto");
    const alto = await X.pagarBoletoAction(db, dono, boleto.id, { bank_account_id: conta, paid_amount: 999999999999.99 });
    check("999.999.999.999,99 é recusado com 422 no campo paid_amount", !alto.ok && alto.status === 422 && alto.field === "paid_amount", j(alto));
    const depois = await db.emporioBoleto.findFirst({ where: { id: boleto.id } });
    check("o boleto segue aberto", depois.status === "aberto", String(depois.status));
    const ok1 = await X.pagarBoletoAction(db, dono, boleto.id, { bank_account_id: conta, paid_amount: 20.5 });
    check("um valor normal (20,50) ainda paga", ok1.ok, j(ok1));

    console.log("  (b) replay do fiado com outra data: o papel vem antes do 409");
    const base = { operation_key: `m129g-fiado-${stamp}`, customer_id: cliente.id, establishment_id: loja.id, amount: 40, kind: "pix", bank_account_id: conta, entry_id: entrada.id };
    const rf = await X.receberFiadoAction(db, dono, { ...base, received_on: iso(hoje) });
    check("receber o fiado pela action passa", rf.ok, j(rf));
    const rc = await X.receberFiadoAction(db, caixa, { ...base, received_on: iso(ontem) });
    check("o Caixa que repete com outra data recebe 403", !rc.ok && rc.status === 403 && rc.field === "received_on", j(rc));
    const rd = await X.receberFiadoAction(db, dono, { ...base, received_on: iso(ontem) });
    check("o Dono que repete com outra data recebe 409", !rd.ok && rd.status === 409, j(rd));
    const rm = await X.receberFiadoAction(db, caixa, { ...base, received_on: iso(hoje) });
    check("o Caixa que repete com a mesma data recebe a repetição (ok)", rm.ok && rm.data.replayed === true, j(rm));
  } catch (e) {
    check("a seção 7 terminou sem exceção", false, e instanceof Error ? e.stack ?? e.message : String(e));
  } finally {
    await limparTenant(t.id, "7");
  }
}

async function main() {
  const { prisma } = await import("@/lib/prisma");
  console.log("🧾 M129: Módulo 39 (Meu Empório), decisões de 23/11\n");
  await secao2();
  await secao3();
  await secao4();
  await secao5();
  await secao6();
  await secao7();
  await prisma.$disconnect();
  console.log(`\nChecagens: ${total}`);
  console.log(falhas === 0 ? "\n✅ M129 (Módulo 39, decisões de 23/11): passou." : `\n❌ M129 (Módulo 39, decisões de 23/11): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
