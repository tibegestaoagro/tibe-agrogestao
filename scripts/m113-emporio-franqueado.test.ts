import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M113: Módulo 39 (Meu Empório), o crédito do franqueado (Q300 a Q309).
 * Roda: `npm run test:m113`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-11-emporio-franqueado-e-repasse-design.md e do
 * contrato do briefing, sem ler a implementação nova. Tudo passa pela ROTA (Request construído).
 *
 * Seção 1: cadastro (nome e telefone obrigatórios, editar, arquivar).
 * Seção 2: venda com crédito (faturamento inalterado, total pago inclui o crédito, saldo sobe, recusas).
 * Seção 3: extrato e pagamento do crédito (parcial, acima do saldo, sem saldo no caixa/conta).
 * Seção 4: cancelar a venda tira o crédito do saldo.
 * Seção 5: orçamento com franqueado e crédito, editado e faturado.
 * Seção 6: impresso rateado nos itens, sem rastro do franqueado (Q308).
 * Seção 7: isolamento entre tenants.
 *
 * Suposições (ver o relato): o faturamento do orçamento NÃO reenvia franchisee_* na venda; o pagamento
 * sai da gaveta por `paid_from.establishment_id` (mais o `cash_register_id`, como a compra); o 409 sem saldo é provado com uma conta bancária
 * sem saldo; o impresso da rota é `{ data: { itens: [{ total }], total } }` (formato da m91).
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

const j = (x: unknown) => JSON.stringify(x);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;
const n = (x: unknown) => Number(x);
const perto = (a: unknown, b: number, tol = 0.005) => typeof a === "number" && Math.abs(a - b) < tol;
const cent = (x: unknown) => Math.round(Number(x) * 100);

console.log("🤝 M113: Módulo 39 (Meu Empório), crédito do franqueado (Q300 a Q309)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];

type Usuario = { id: string; role: "OWNER"; email: string };
type Mundo = {
  tenantId: string;
  db: Dado;
  owner: Usuario;
  tok: string;
  L1: string;
  reg: string;
  prodId: string;
  presId: string;
  prod2Id: string;
  pres2Id: string;
};

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M113 ${rotulo} ${stamp}`, document: `M113${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  const u = await prisma.user.create({
    data: { tenant_id: t.id, name: `M113 own`, email: `m113-${rotulo}-own-${stamp}@teste.local`, password_hash: hash, role: "OWNER", ...papelDeFixture("OWNER") },
  });
  const owner: Usuario = { id: u.id, role: "OWNER", email: u.email };

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M113 ${rotulo} Loja 1` });
  if (!l1.ok) throw new Error(`loja: ${j(l1)}`);
  const L1 = l1.data.id as string;

  const cat = await db.productCategory.create({ data: scoped({ name: `M113 categoria ${rotulo}` }) });
  const produto = async (nome: string, preco: number) => {
    const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M113 ${nome} ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
    const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L1, presentation_id: pres.data.id, price: preco });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L1, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
    return { prodId: prod.data.id as string, presId: pres.data.id as string };
  };
  const p1 = await produto("Ração", 10);
  const p2 = await produto("Sal", 20);
  await abrirTurnoDeTeste(db, owner, L1);
  const reg = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))?.id as string;

  const tok = String(
    ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: owner.email, password: SENHA }),
    }))).json()) as Dado)?.data?.access_token ?? "",
  );
  return { tenantId: t.id, db, owner, tok, L1, reg, prodId: p1.prodId, presId: p1.presId, prod2Id: p2.prodId, pres2Id: p2.presId };
}

const R = {
  franchisees: () => import("@/app/api/v1/emporio/franchisees/route"),
  franchisee: () => import("@/app/api/v1/emporio/franchisees/[id]/route"),
  archive: () => import("@/app/api/v1/emporio/franchisees/[id]/archive/route"),
  payments: () => import("@/app/api/v1/emporio/franchisees/[id]/payments/route"),
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  cancel: () => import("@/app/api/v1/emporio/sales/[id]/cancel/route"),
  receipt: () => import("@/app/api/v1/emporio/sales/[id]/receipt/route"),
  quotes: () => import("@/app/api/v1/emporio/quotes/route"),
  quote: () => import("@/app/api/v1/emporio/quotes/[id]/route"),
  replace: () => import("@/app/api/v1/emporio/sales/[id]/replace/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST" | "PATCH", url: string, corpo?: unknown, id?: string): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  let m: Dado;
  try {
    m = await rota();
  } catch (e) {
    return { status: 0, corpo: { import_error: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
  if (typeof m[metodo] !== "function") return { status: 0, corpo: { sem_metodo: metodo } };
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}
const erro = (r: Resp, status: number, field?: string, code?: string) =>
  r.status === status && (field === undefined || r.corpo?.error?.field === field) && (code === undefined || r.corpo?.error?.code === code);
const recusada = (r: Resp) => r.status >= 400 && r.status < 500;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
let cpfSeq = 0;
const chave = (p: string) => `m113-${p}-${stamp}-${(seq += 1)}`;
const idDe = (r: Resp) => String(r.corpo?.data?.id ?? "");

async function cliente(w: Mundo, nome: string) {
  const { prisma } = await import("@/lib/prisma");
  const cpfs = ["39053344705", "52998224725", "11144477735", "86288366757", "16899535009"];
  const cpf = cpfs[(cpfSeq += 1) % cpfs.length];
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: nome, person_kind: "pf", document: cpf, phone: "11999990000" } as Dado })) as Dado;
}
const itensDe = (w: Mundo, ...q: [("a" | "b"), number][]) =>
  q.map(([k, quantity]) => (k === "a" ? { emporio_product_id: w.prodId, presentation_id: w.presId, quantity } : { emporio_product_id: w.prod2Id, presentation_id: w.pres2Id, quantity }));
const dinheiro = (amount: number) => ({ kind: "dinheiro", amount });

const vender = (w: Mundo, cli: Dado, items: Dado[], payments: Dado[], extra: Dado = {}, tok?: string) =>
  chamar(tok ?? w.tok, R.sales, "POST", "emporio/sales", { operation_key: chave("venda"), establishment_id: w.L1, cash_register_id: w.reg, customer_id: cli.id, items, payments, ...extra });
const orcar = (w: Mundo, cli: Dado, items: Dado[], extra: Dado = {}, tok?: string) =>
  chamar(tok ?? w.tok, R.quotes, "POST", "emporio/quotes", { operation_key: chave("orc"), establishment_id: w.L1, customer_id: cli.id, items, ...extra });
const cadastrar = (w: Mundo, corpo: Dado, tok?: string) => chamar(tok ?? w.tok, R.franchisees, "POST", "emporio/franchisees", corpo);
const ficha = (w: Mundo, id: string, tok?: string) => chamar(tok ?? w.tok, R.franchisee, "GET", `emporio/franchisees/${id}`, undefined, id);
const saldoDe = async (w: Mundo, id: string): Promise<number> => n((await ficha(w, id)).corpo?.data?.balance);
const pagar = (w: Mundo, id: string, amount: number, paid_from: Dado, tok?: string) =>
  chamar(tok ?? w.tok, R.payments, "POST", `emporio/franchisees/${id}/payments`, { operation_key: chave("pgto"), amount, paid_from, ...{} }, id);

async function main() {
  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    const A = await montar("A");
    const B = await montar("B");
    const CA = await cliente(A, "M113 Cliente A");
    const CB = await cliente(B, "M113 Cliente B");
    const vendasDe = (w: Mundo) => P.emporioSale.count({ where: { tenant_id: w.tenantId } }) as Promise<number>;
    const orcDe = (w: Mundo) => P.emporioQuote.count({ where: { tenant_id: w.tenantId } }) as Promise<number>;
    let F1 = "";

    // -------------------------------------------------------------------- 1
    await rodar("cadastro", async () => {
      console.log("1. Cadastro do franqueado (Q300)");
      const lista0 = await chamar(A.tok, R.franchisees, "GET", "emporio/franchisees");
      const total0 = Array.isArray(lista0.corpo?.data) ? lista0.corpo.data.length : -1;
      const semNome = await cadastrar(A, { phone: "11988887777" });
      check("sem name: 422 no campo name", erro(semNome, 422, "name", "VALIDATION_ERROR"), `${semNome.status} ${j(semNome.corpo)}`);
      const semFone = await cadastrar(A, { name: "M113 Sem Fone" });
      check("sem phone: 422 no campo phone", erro(semFone, 422, "phone", "VALIDATION_ERROR"), `${semFone.status} ${j(semFone.corpo)}`);
      const lista1 = await chamar(A.tok, R.franchisees, "GET", "emporio/franchisees");
      check("as recusas não cadastraram ninguém", lista0.status === 200 && lista1.corpo?.data?.length === total0, `${total0} -> ${lista1.corpo?.data?.length}`);

      const ok = await cadastrar(A, { name: "M113 Franqueado Um", phone: "11988887777" });
      check("só nome e telefone: 201", ok.status === 201, `${ok.status} ${j(ok.corpo)}`);
      F1 = idDe(ok);
      const d = ok.corpo?.data ?? {};
      check("devolve id, name, phone e saldo 0", !!F1 && d.name === "M113 Franqueado Um" && d.phone === "11988887777" && n(d.balance) === 0, j(d));
      check("documento e observação ficam vazios e não está arquivado", (d.document ?? null) === null && (d.notes ?? null) === null && (d.archived_at ?? null) === null, j(d));

      const completo = await cadastrar(A, { name: "M113 Franqueado Dois", phone: "11977776666", document: "52998224725", notes: "Retira no balcão" });
      check("com documento e observação: 201 e gravados", completo.status === 201 && completo.corpo?.data?.document === "52998224725" && completo.corpo?.data?.notes === "Retira no balcão", `${completo.status} ${j(completo.corpo)}`);

      const lista = await chamar(A.tok, R.franchisees, "GET", "emporio/franchisees");
      const linha = (lista.corpo?.data ?? []).find((x: Dado) => x.id === F1);
      check("a lista traz o franqueado com balance", lista.status === 200 && linha != null && "balance" in linha, j(linha));

      const ed = await chamar(A.tok, R.franchisee, "PATCH", `emporio/franchisees/${F1}`, { name: "M113 Franqueado Um Editado" }, F1);
      check("PATCH do nome: 200", ed.status === 200 && ed.corpo?.data?.name === "M113 Franqueado Um Editado", `${ed.status} ${j(ed.corpo)}`);
      const edVazio = await chamar(A.tok, R.franchisee, "PATCH", `emporio/franchisees/${F1}`, { name: "" }, F1);
      check("PATCH com nome vazio: 422 no campo name", erro(edVazio, 422, "name"), `${edVazio.status} ${j(edVazio.corpo)}`);
      check("a recusa não mexeu no nome", (await ficha(A, F1)).corpo?.data?.name === "M113 Franqueado Um Editado");

      const tmp = idDe(await cadastrar(A, { name: "M113 Para Arquivar", phone: "11955554444" }));
      const arq = await chamar(A.tok, R.archive, "POST", `emporio/franchisees/${tmp}/archive`, {}, tmp);
      check("arquivar: 200 e archived_at preenchido", arq.status === 200 && !!(await ficha(A, tmp)).corpo?.data?.archived_at, `${arq.status} ${j(arq.corpo)}`);
    });

    // -------------------------------------------------------------------- 2
    await rodar("venda com crédito", async () => {
      console.log("\n2. Venda com crédito (Q301, Q302, Q303)");
      const antes = await vendasDe(A);
      const r = await vender(A, CA, itensDe(A, ["a", 10]), [dinheiro(110)], { franchisee_id: F1, franchisee_credit: 10 });
      check("venda de 100 com crédito 10, paga 110: 201", r.status === 201, `${r.status} ${j(r.corpo)}`);
      const s = await P.emporioSale.findUnique({ where: { id: idDe(r) } });
      check("net_amount segue 100 (o faturamento não muda)", perto(n(s?.net_amount), 100), `${s?.net_amount}`);
      check("o saldo do franqueado subiu para 10", perto(await saldoDe(A, F1), 10), `${await saldoDe(A, F1)}`);

      const curto = await vender(A, CA, itensDe(A, ["a", 10]), [dinheiro(100)], { franchisee_id: F1, franchisee_credit: 10 });
      check("pagar só 100 com crédito 10 (falta o crédito): recusa 4xx", recusada(curto), `${curto.status} ${j(curto.corpo)}`);
      const demais = await vender(A, CA, itensDe(A, ["a", 10]), [dinheiro(120)], { franchisee_id: F1, franchisee_credit: 10 });
      check("pagar 120 com crédito 10 (sobra): recusa 4xx", recusada(demais), `${demais.status} ${j(demais.corpo)}`);

      const semFranq = await vender(A, CA, itensDe(A, ["a", 10]), [dinheiro(110)], { franchisee_credit: 10 });
      check("crédito sem franqueado: 422 no campo franchisee_id", erro(semFranq, 422, "franchisee_id"), `${semFranq.status} ${j(semFranq.corpo)}`);
      const neg = await vender(A, CA, itensDe(A, ["a", 10]), [dinheiro(90)], { franchisee_id: F1, franchisee_credit: -10 });
      check("crédito negativo: 422 no campo franchisee_credit", erro(neg, 422, "franchisee_credit"), `${neg.status} ${j(neg.corpo)}`);

      const arqId = idDe(await cadastrar(A, { name: "M113 Franqueado Arquivado", phone: "11944443333" }));
      await chamar(A.tok, R.archive, "POST", `emporio/franchisees/${arqId}/archive`, {}, arqId);
      const arq = await vender(A, CA, itensDe(A, ["a", 10]), [dinheiro(110)], { franchisee_id: arqId, franchisee_credit: 10 });
      check("franqueado arquivado: 422 FRANCHISEE_ARCHIVED no campo franchisee_id", erro(arq, 422, "franchisee_id", "FRANCHISEE_ARCHIVED"), `${arq.status} ${j(arq.corpo)}`);

      check("nenhuma das recusas criou venda (só a primeira)", (await vendasDe(A)) === antes + 1, `${antes} -> ${await vendasDe(A)}`);
      check("e o saldo continua 10", perto(await saldoDe(A, F1), 10), `${await saldoDe(A, F1)}`);
      check("o arquivado segue com saldo 0", perto(await saldoDe(A, arqId), 0));

      const semCred = await vender(A, CA, itensDe(A, ["a", 5]), [dinheiro(50)]);
      check("venda sem franqueado nem crédito: 201 e saldo intacto", semCred.status === 201 && perto(await saldoDe(A, F1), 10), `${semCred.status} ${j(semCred.corpo)}`);
      const zero = await vender(A, CA, itensDe(A, ["a", 5]), [dinheiro(50)], { franchisee_id: F1, franchisee_credit: 0 });
      check("franqueado com crédito 0: 201 e saldo intacto", zero.status === 201 && perto(await saldoDe(A, F1), 10), `${zero.status} ${j(zero.corpo)}`);
    });

    // -------------------------------------------------------------------- 3
    let vendaCredito5 = "";
    await rodar("extrato e pagamento", async () => {
      console.log("\n3. Extrato e pagamento do crédito (Q304)");
      const r = await vender(A, CA, itensDe(A, ["a", 4]), [dinheiro(45)], { franchisee_id: F1, franchisee_credit: 5 });
      vendaCredito5 = idDe(r);
      check("segunda venda com crédito 5: 201", r.status === 201, `${r.status} ${j(r.corpo)}`);
      check("saldo = 15", perto(await saldoDe(A, F1), 15), `${await saldoDe(A, F1)}`);

      let f = (await ficha(A, F1)).corpo?.data ?? {};
      const creditos = (f.statement ?? []).filter((x: Dado) => x.kind === "credito");
      check("extrato: dois créditos (10 e 5) com sale_id", creditos.length === 2 && creditos.some((x: Dado) => perto(n(x.amount), 10)) && creditos.some((x: Dado) => perto(n(x.amount), 5) && x.sale_id === vendaCredito5), j(f.statement));

      const pg = await pagar(A, F1, 4, { establishment_id: A.L1, cash_register_id: A.reg });
      check("pagamento parcial de 4 pelo caixa: 201", pg.status === 201, `${pg.status} ${j(pg.corpo)}`);
      check("saldo = 15 menos 4 = 11", perto(await saldoDe(A, F1), 11), `${await saldoDe(A, F1)}`);
      f = (await ficha(A, F1)).corpo?.data ?? {};
      const pagos = (f.statement ?? []).filter((x: Dado) => x.kind === "pagamento");
      check("extrato: um pagamento de 4 com payment_id", pagos.length === 1 && perto(n(pagos[0].amount), 4) && !!pagos[0].payment_id, j(f.statement));
      check("saldo = créditos menos pagamentos no extrato", perto(n(f.balance), (f.statement ?? []).reduce((t: number, x: Dado) => t + (x.kind === "credito" ? n(x.amount) : -n(x.amount)), 0)), j(f));

      const acima = await pagar(A, F1, 12, { establishment_id: A.L1, cash_register_id: A.reg });
      check("pagar 12 com saldo 11: 422 AMOUNT_ABOVE_BALANCE no campo amount", erro(acima, 422, "amount", "AMOUNT_ABOVE_BALANCE"), `${acima.status} ${j(acima.corpo)}`);
      check("a recusa não mexeu no saldo", perto(await saldoDe(A, F1), 11), `${await saldoDe(A, F1)}`);

      const { criarContaAction } = (await import("@/lib/actions/emporio-caixa")) as Dado;
      const conta = await criarContaAction(A.db, A.owner, { name: `M113 Conta Vazia ${stamp}`, bank: "Sicredi" });
      if (!conta?.ok) throw new Error(`conta: ${j(conta)}`);
      const semSaldo = await pagar(A, F1, 5, { bank_account_id: conta.data.id });
      check("pagar de conta sem saldo: 409 INSUFFICIENT_CASH no campo paid_from", erro(semSaldo, 409, "paid_from", "INSUFFICIENT_CASH"), `${semSaldo.status} ${j(semSaldo.corpo)}`);
      check("a recusa não mexeu no saldo", perto(await saldoDe(A, F1), 11), `${await saldoDe(A, F1)}`);
      const mudo = await pagar(A, F1, 5, {});
      check("sem origem do dinheiro: recusa 4xx e saldo intacto", recusada(mudo) && perto(await saldoDe(A, F1), 11), `${mudo.status} ${j(mudo.corpo)}`);
      const f2 = (await ficha(A, F1)).corpo?.data ?? {};
      check("o extrato segue com um só pagamento", (f2.statement ?? []).filter((x: Dado) => x.kind === "pagamento").length === 1);
    });

    // -------------------------------------------------------------------- 4
    await rodar("cancelar venda", async () => {
      console.log("\n4. Cancelar a venda tira o crédito do saldo (Q305)");
      const antes = await saldoDe(A, F1);
      const c = await chamar(A.tok, R.cancel, "POST", `emporio/sales/${vendaCredito5}/cancel`, { reason: "teste do franqueado", cash_register_id: A.reg }, vendaCredito5);
      check("cancelar a venda do crédito 5: 200", c.status === 200, `${c.status} ${j(c.corpo)}`);
      check("o saldo caiu 5 (11 para 6)", perto(await saldoDe(A, F1), antes - 5), `${antes} -> ${await saldoDe(A, F1)}`);
      const f = (await ficha(A, F1)).corpo?.data ?? {};
      check("o crédito cancelado saiu do extrato (e o da primeira venda segue)", (f.statement ?? []).some((x: Dado) => x.kind === "credito" && perto(n(x.amount), 10)) && !(f.statement ?? []).some((x: Dado) => x.kind === "credito" && x.sale_id === vendaCredito5), j(f.statement));
      const de2 = await chamar(A.tok, R.cancel, "POST", `emporio/sales/${vendaCredito5}/cancel`, { reason: "de novo", cash_register_id: A.reg }, vendaCredito5);
      check("cancelar de novo é recusado e o saldo fica", recusada(de2) && perto(await saldoDe(A, F1), antes - 5), `${de2.status}`);
    });

    // -------------------------------------------------------------------- 5
    await rodar("orçamento", async () => {
      console.log("\n5. Orçamento com franqueado e crédito, editado e faturado (Q309)");
      const antes = await orcDe(A);
      const sem = await orcar(A, CA, itensDe(A, ["a", 5]), { franchisee_credit: 7 });
      check("orçamento com crédito sem franqueado: 422 no campo franchisee_id", erro(sem, 422, "franchisee_id"), `${sem.status} ${j(sem.corpo)}`);
      const arqId = idDe(await cadastrar(A, { name: "M113 Arquivado Orc", phone: "11933332222" }));
      await chamar(A.tok, R.archive, "POST", `emporio/franchisees/${arqId}/archive`, {}, arqId);
      const arq = await orcar(A, CA, itensDe(A, ["a", 5]), { franchisee_id: arqId, franchisee_credit: 7 });
      check("orçamento com franqueado arquivado: 422 FRANCHISEE_ARCHIVED", erro(arq, 422, "franchisee_id", "FRANCHISEE_ARCHIVED"), `${arq.status} ${j(arq.corpo)}`);
      check("as recusas não criaram orçamento", (await orcDe(A)) === antes, `${antes} -> ${await orcDe(A)}`);

      const r = await orcar(A, CA, itensDe(A, ["a", 5]), { franchisee_id: F1, franchisee_credit: 7 });
      check("orçamento de 50 com crédito 7: 201", r.status === 201, `${r.status} ${j(r.corpo)}`);
      const qid = idDe(r);
      const q = await P.emporioQuote.findUnique({ where: { id: qid } });
      check("net_amount do orçamento segue 50", perto(n(q?.net_amount), 50), `${q?.net_amount}`);
      const g = await chamar(A.tok, R.quote, "GET", `emporio/quotes/${qid}`, undefined, qid);
      check("o GET traz franchisee_id e franchisee_credit 7", g.corpo?.data?.franchisee_id === F1 && perto(n(g.corpo?.data?.franchisee_credit), 7), j(g.corpo?.data));
      check("orçamento não mexe no saldo (ainda 6)", perto(await saldoDe(A, F1), 6), `${await saldoDe(A, F1)}`);

      const ed = await chamar(A.tok, R.quote, "PATCH", `emporio/quotes/${qid}`, { customer_id: CA.id, items: itensDe(A, ["a", 5]), franchisee_id: F1, franchisee_credit: 8 }, qid);
      check("editar o orçamento para crédito 8: 200", ed.status === 200, `${ed.status} ${j(ed.corpo)}`);
      const g2 = await chamar(A.tok, R.quote, "GET", `emporio/quotes/${qid}`, undefined, qid);
      check("o orçamento passou a 8", perto(n(g2.corpo?.data?.franchisee_credit), 8), j(g2.corpo?.data));
      const edSem = await chamar(A.tok, R.quote, "PATCH", `emporio/quotes/${qid}`, { customer_id: CA.id, items: itensDe(A, ["a", 5]), franchisee_credit: 9 }, qid);
      check("editar com crédito sem franqueado: 422 no campo franchisee_id", erro(edSem, 422, "franchisee_id"), `${edSem.status} ${j(edSem.corpo)}`);
      const g3 = await chamar(A.tok, R.quote, "GET", `emporio/quotes/${qid}`, undefined, qid);
      check("a recusa deixou o crédito em 8", perto(n(g3.corpo?.data?.franchisee_credit), 8), j(g3.corpo?.data));

      const v = await vender(A, CA, itensDe(A, ["a", 5]), [dinheiro(58)], { quote_id: qid });
      check("faturar o orçamento (pago 50 mais crédito 8): 201", v.status === 201, `${v.status} ${j(v.corpo)}`);
      const f = (await ficha(A, F1)).corpo?.data ?? {};
      check("a venda nasceu com o franqueado e o crédito: extrato com crédito 8 dessa venda", (f.statement ?? []).some((x: Dado) => x.kind === "credito" && x.sale_id === idDe(v) && perto(n(x.amount), 8)), j(f.statement));
      check("saldo = 6 + 8 = 14", perto(n(f.balance), 14), `${f.balance}`);
      const s = await P.emporioSale.findUnique({ where: { id: idDe(v) } });
      check("net_amount da venda faturada segue 50", perto(n(s?.net_amount), 50), `${s?.net_amount}`);
    });

    // -------------------------------------------------------------------- 6
    await rodar("impresso", async () => {
      console.log("\n6. Impresso rateado nos itens, sem rastro do franqueado (Q308)");
      const v = await vender(A, CA, itensDe(A, ["a", 6], ["b", 2]), [dinheiro(110)], { franchisee_id: F1, franchisee_credit: 10 });
      check("venda de 60 e 40 com crédito 10: 201", v.status === 201, `${v.status} ${j(v.corpo)}`);
      const rc = await chamar(A.tok, R.receipt, "GET", `emporio/sales/${idDe(v)}/receipt`, undefined, idDe(v));
      const d = rc.corpo?.data ?? {};
      const totais = (d.itens ?? []).map((i: Dado) => cent(i.total));
      check("receipt: 200", rc.status === 200, `${rc.status} ${j(rc.corpo)}`);
      check("os itens saem 66 e 44", totais.length === 2 && totais[0] === 6600 && totais[1] === 4400, j(d.itens));
      check("a soma dos itens bate o total pago (110)", totais.reduce((a: number, b: number) => a + b, 0) === 11000 && cent(d.total) === 11000, `${j(totais)} total ${d.total}`);
      const txt = j(rc.corpo).toLowerCase();
      check("nenhum texto franqueado no corpo", !txt.includes("franqueado") && !txt.includes("franchisee"), txt.slice(0, 200));

      const v3 = await vender(A, CA, itensDe(A, ["a", 1], ["a", 1], ["a", 1]), [dinheiro(40)], { franchisee_id: F1, franchisee_credit: 10 });
      check("três itens de 10 com crédito 10: 201", v3.status === 201, `${v3.status} ${j(v3.corpo)}`);
      const rc3 = await chamar(A.tok, R.receipt, "GET", `emporio/sales/${idDe(v3)}/receipt`, undefined, idDe(v3));
      const t3 = (rc3.corpo?.data?.itens ?? []).map((i: Dado) => cent(i.total));
      check("centavos que não dividem exato: a soma dos itens fecha em 40,00", t3.length === 3 && t3.reduce((a: number, b: number) => a + b, 0) === 4000 && cent(rc3.corpo?.data?.total) === 4000, `${j(t3)} total ${rc3.corpo?.data?.total}`);
      check("cada item ficou perto de 13,33 (o resto vai para o último)", t3.length === 3 && t3.every((c: number) => c >= 1333 && c <= 1334), j(t3));

      const vs = await vender(A, CA, itensDe(A, ["a", 6], ["b", 2]), [dinheiro(100)]);
      const rs = await chamar(A.tok, R.receipt, "GET", `emporio/sales/${idDe(vs)}/receipt`, undefined, idDe(vs));
      const ts = (rs.corpo?.data?.itens ?? []).map((i: Dado) => cent(i.total));
      check("venda sem crédito: itens 60 e 40, sem rateio", ts.length === 2 && ts[0] === 6000 && ts[1] === 4000 && cent(rs.corpo?.data?.total) === 10000, `${j(ts)}`);
    });

    // -------------------------------------------------------------------- 8
    await rodar("arquivado depois, brinde e rateio", async () => {
      console.log("\n8. Franqueado arquivado depois, e o brinde no rateio (correções do juiz)");
      const { ratearCreditoNosItens } = await import("@/lib/emporio/rateio-impresso");
      const brinde = ratearCreditoNosItens([3000, 3000, 0], 1);
      check("rateio [3000,3000,0] com crédito 1: o brinde fica em 0 e a soma é exata", brinde[2] === 0 && brinde.reduce((a, b) => a + b, 0) === 6001, j(brinde));
      const todosZero = ratearCreditoNosItens([0, 0], 5);
      check("rateio com tudo zero: o crédito cai na última", j(todosZero) === "[0,5]", j(todosZero));

      const arquivar = (id: string) => chamar(A.tok, R.archive, "POST", `emporio/franchisees/${id}/archive`, {}, id);
      const Fa = idDe(await cadastrar(A, { name: "M113 Vai Arquivar", phone: "11922221111" }));
      const Fb = idDe(await cadastrar(A, { name: "M113 Outro Arquivado", phone: "11911110000" }));
      const Fn = idDe(await cadastrar(A, { name: "M113 Novo Ativo", phone: "11900009999" }));

      // (b) editar a venda (replace) depois de arquivar o franqueado dela
      const v = await vender(A, CA, itensDe(A, ["a", 10]), [dinheiro(110)], { franchisee_id: Fa, franchisee_credit: 10 });
      check("venda com crédito 10 do franqueado a arquivar: 201", v.status === 201, `${v.status} ${j(v.corpo)}`);
      await arquivar(Fa);
      await arquivar(Fb);
      const corpoTroca = (extra: Dado) => ({ operation_key: chave("repl"), cash_register_id: A.reg, customer_id: CA.id, items: itensDe(A, ["a", 10]), payments: [dinheiro(110)], reason: "ajuste", ...extra });
      const outro = await chamar(A.tok, R.replace, "POST", `emporio/sales/${idDe(v)}/replace`, corpoTroca({ franchisee_id: Fb, franchisee_credit: 10 }), idDe(v));
      check("replace trocando para OUTRO franqueado arquivado: 422 FRANCHISEE_ARCHIVED", erro(outro, 422, "franchisee_id", "FRANCHISEE_ARCHIVED"), `${outro.status} ${j(outro.corpo)}`);
      check("a recusa não cancelou a venda e o crédito segue", perto(await saldoDe(A, Fa), 10), `${await saldoDe(A, Fa)}`);
      const mesmo = await chamar(A.tok, R.replace, "POST", `emporio/sales/${idDe(v)}/replace`, corpoTroca({}), idDe(v));
      check("replace sem mudar o franqueado arquivado: 201", mesmo.status === 201, `${mesmo.status} ${j(mesmo.corpo)}`);
      check("o crédito segue na venda nova (saldo 10)", perto(await saldoDe(A, Fa), 10), `${await saldoDe(A, Fa)}`);
      const nova = await P.emporioSale.findUnique({ where: { id: idDe(mesmo) } });
      check("a venda nova guarda franqueado e crédito", nova?.franchisee_id === Fa && perto(n(nova?.franchisee_credit), 10), j(nova));

      // (c) faturar o orçamento depois de arquivar o franqueado dele
      const oc = await orcar(A, CA, itensDe(A, ["a", 5]), { franchisee_id: Fn, franchisee_credit: 6 });
      check("orçamento com crédito 6 do franqueado ativo: 201", oc.status === 201, `${oc.status} ${j(oc.corpo)}`);
      await arquivar(Fn);
      const edArq = await chamar(A.tok, R.quote, "PATCH", `emporio/quotes/${idDe(oc)}`, { customer_id: CA.id, items: itensDe(A, ["a", 4]), franchisee_id: Fn, franchisee_credit: 6 }, idDe(oc));
      check("editar o orçamento sem mudar o franqueado arquivado: 200", edArq.status === 200, `${edArq.status} ${j(edArq.corpo)}`);
      const edOutro = await chamar(A.tok, R.quote, "PATCH", `emporio/quotes/${idDe(oc)}`, { customer_id: CA.id, items: itensDe(A, ["a", 4]), franchisee_id: Fb, franchisee_credit: 6 }, idDe(oc));
      check("editar o orçamento para OUTRO arquivado: 422 FRANCHISEE_ARCHIVED", erro(edOutro, 422, "franchisee_id", "FRANCHISEE_ARCHIVED"), `${edOutro.status} ${j(edOutro.corpo)}`);
      const fat = await vender(A, CA, itensDe(A, ["a", 4]), [dinheiro(46)], { quote_id: idDe(oc) });
      check("faturar o orçamento com franqueado arquivado: 201", fat.status === 201, `${fat.status} ${j(fat.corpo)}`);
      check("a venda nasceu com o crédito 6 do franqueado", perto(await saldoDe(A, Fn), 6), `${await saldoDe(A, Fn)}`);
    });

    // -------------------------------------------------------------------- 7
    await rodar("isolamento", async () => {
      console.log("\n7. Isolamento entre tenants");
      const saldoA = await saldoDe(A, F1);
      const pagosA = ((await ficha(A, F1)).corpo?.data?.statement ?? []).filter((x: Dado) => x.kind === "pagamento").length;
      const g = await ficha(B, F1, B.tok);
      check("B lê o franqueado do A: 404", g.status === 404, `${g.status} ${j(g.corpo)}`);
      const lb = await chamar(B.tok, R.franchisees, "GET", "emporio/franchisees");
      check("a lista do B (200) não traz o do A", lb.status === 200 && !(lb.corpo?.data ?? []).some((x: Dado) => x.id === F1), j(lb.corpo?.data));
      const pg = await pagar(B, F1, 1, { establishment_id: B.L1, cash_register_id: B.reg });
      check("B paga o franqueado do A: 404", pg.status === 404, `${pg.status} ${j(pg.corpo)}`);
      const ed = await chamar(B.tok, R.franchisee, "PATCH", `emporio/franchisees/${F1}`, { name: "invasão" }, F1);
      check("B edita o franqueado do A: 404", ed.status === 404, `${ed.status} ${j(ed.corpo)}`);
      const ar = await chamar(B.tok, R.archive, "POST", `emporio/franchisees/${F1}/archive`, {}, F1);
      check("B arquiva o franqueado do A: 404", ar.status === 404, `${ar.status} ${j(ar.corpo)}`);

      const vB0 = await vendasDe(B);
      const vB = await vender(B, CB, itensDe(B, ["a", 10]), [dinheiro(110)], { franchisee_id: F1, franchisee_credit: 10 });
      check("B vende com o franqueado do A: 404 ou 422 no campo, nunca 201", (vB.status === 404 || vB.status === 422) && vB.corpo?.error?.field === "franchisee_id", `${vB.status} ${j(vB.corpo)}`);
      check("e não criou venda", (await vendasDe(B)) === vB0);
      const oB0 = await orcDe(B);
      const oB = await orcar(B, CB, itensDe(B, ["a", 10]), { franchisee_id: F1, franchisee_credit: 10 });
      check("B orça com o franqueado do A: 404 ou 422 no campo, nunca 201", (oB.status === 404 || oB.status === 422) && oB.corpo?.error?.field === "franchisee_id", `${oB.status} ${j(oB.corpo)}`);
      check("e não criou orçamento", (await orcDe(B)) === oB0);

      const f = (await ficha(A, F1)).corpo?.data ?? {};
      check("o franqueado do A ficou intacto (nome, saldo, pagamentos)", f.name === "M113 Franqueado Um Editado" && !f.archived_at && perto(n(f.balance), saldoA) && (f.statement ?? []).filter((x: Dado) => x.kind === "pagamento").length === pagosA, j(f));
    });
  } finally {
    for (const id of tenantIds.reverse()) {
      await P.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
      await P.emporioQuote.updateMany({ where: { tenant_id: id }, data: { sale_id: null, based_on_quote_id: null } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id } }).catch((e: unknown) => console.log(`  (teardown ${id}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\n✅ M113 (Módulo 39, Empório): o crédito do franqueado passou." : `\n❌ M113 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
