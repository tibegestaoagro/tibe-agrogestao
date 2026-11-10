import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M108: Módulo 39 (Meu Empório), boleto na venda e titular do cheque (Q278 a Q284).
 * Roda: `npm run test:m108`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-10-emporio-boleto-e-titular-do-cheque-design.md,
 * sem ler a implementação. Tudo o que está sob prova passa pela ROTA (Request construído).
 *
 * Seção 1: venda com boleto em duas parcelas.
 * Seção 2: recusas (vencimento antes da venda, sem vencimento, Consumidor final).
 * Seção 3: cheque com titular (holder_name).
 * Seção 4: a lista de boletos por situação (aberto, vencido, pago, no_fiado).
 * Seção 5: baixa ("Boleto pago") e suas recusas.
 * Seção 6: mandar para o fiado.
 * Seção 7: boleto vencido pesa no crédito do cliente.
 * Seção 8: cancelar a venda com boleto aberto e com boleto pago.
 * Seção 9: isolamento entre tenants.
 *
 * Suposições de rota que o contrato não fechava (ver o relato): o titular do cheque vai em
 * `check.holder_name` (a chave do cheque na venda já é `check`, como na m82); a ficha de crédito é
 * GET /api/v1/emporio/customers/:id/credit (m99).
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

console.log("🧾 M108: Módulo 39 (Meu Empório), boleto na venda e titular do cheque (Q278 a Q284)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];
const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const diaDe = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const n = (x: unknown) => Number(x);
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && Math.abs(a - b) < tol;

type Usuario = { id: string; role: "OWNER" | "OPERADOR"; email: string };
type Mundo = {
  tenantId: string;
  db: Dado;
  owner: Usuario;
  tok: Record<"owner" | "gestor" | "vend", string>;
  L1: string;
  reg: string;
  conta: string;
  prodId: string;
  presId: string;
};

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M108 ${rotulo} ${stamp}`, document: `M108${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M108 ${suf}`, email: `m108-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vend = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: ["lancar_compra"] });

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M108 ${rotulo} Loja 1` });
  if (!l1.ok) throw new Error(`loja: ${j(l1)}`);
  const L1 = l1.data.id as string;
  await vincularTodas(prisma, t.id, [gestor.id, vend.id], [L1]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M108 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M108 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L1, presentation_id: pres.data.id, price: 10 });
  if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
  const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L1, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
  if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  await abrirTurnoDeTeste(db, owner, L1);
  const reg = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))?.id as string;
  const conta = (await prisma.bankAccount.create({ data: { tenant_id: t.id, name: `M108 Banco ${rotulo}` } })).id;

  const tok = {} as Mundo["tok"];
  const pares: [keyof Mundo["tok"], Usuario][] = [["owner", owner], ["gestor", gestor], ["vend", vend]];
  for (const [k, u] of pares) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { tenantId: t.id, db, owner, tok, L1, reg, conta, prodId: prod.data.id, presId: pres.data.id };
}

// Rotas (import literal, para o bundler do tsx resolver os colchetes)
const R = {
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  cancel: () => import("@/app/api/v1/emporio/sales/[id]/cancel/route"),
  checks: () => import("@/app/api/v1/emporio/checks/route"),
  boletos: () => import("@/app/api/v1/emporio/boletos/route"),
  pay: () => import("@/app/api/v1/emporio/boletos/[id]/pay/route"),
  toFiado: () => import("@/app/api/v1/emporio/boletos/[id]/to-fiado/route"),
  credit: () => import("@/app/api/v1/emporio/customers/[id]/credit/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST", url: string, corpo?: unknown, id?: string): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  let m: Dado;
  try {
    m = await rota();
  } catch (e) {
    return { status: 0, corpo: { import_error: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}
const erro = (r: Resp, status: number, field?: string) => r.status === status && (field === undefined || r.corpo?.error?.field === field);

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m108-${p}-${stamp}-${(seq += 1)}`;

async function cliente(w: Mundo, nome: string) {
  const { prisma } = await import("@/lib/prisma");
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: nome } as Dado })) as Dado;
}
/** Venda pela rota (o preço é 10 o quilo: `qty` de 10 vale R$ 100). Sem `cli`, vai para o Consumidor final. */
const vender = (w: Mundo, cli: Dado | null, qty: number, payments: Dado[], tok?: string) =>
  chamar(tok ?? w.tok.owner, R.sales, "POST", "emporio/sales", {
    operation_key: chave("venda"), establishment_id: w.L1, cash_register_id: w.reg,
    ...(cli ? { customer_id: cli.id } : {}), items: [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: qty }], payments,
  });
const boleto = (amount: number, due_on: string, number?: string) => ({ kind: "boleto", amount, boleto: { due_on, ...(number === undefined ? {} : { number }) } });
const cheque = (amount: number, over: Dado = {}) => ({ kind: "cheque", amount, check: { number: "1234", bank: "Sicredi", good_for: somaDias(hojeStr, 15), holder_name: "Titular Teste", ...over } });

const idVenda = (r: Resp) => String(r.corpo?.data?.id ?? "");
const boletosDaVenda = async (w: Mundo, saleId: string) => (await (await import("@/lib/prisma")).prisma as Dado).emporioBoleto.findMany({ where: { sale_id: saleId }, orderBy: { due_on: "asc" } }) as Dado[];
const lancamentoDa = async (w: Mundo, saleId: string) =>
  (await w.db.financialEntry.findFirst({ where: { related_module: "emporio", related_id: saleId, entry_type: "income" } })) as Dado;
const lista = (r: Resp): Dado[] => (Array.isArray(r.corpo?.data) ? r.corpo.data : []);
const listarBoletos = (w: Mundo, tok: string, qs = "") => chamar(tok, R.boletos, "GET", `emporio/boletos${qs}`);

async function main() {
  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    const A = await montar("A");
    const B = await montar("B");
    await P.emporioSettings.upsert({
      where: { tenant_id: A.tenantId },
      create: { tenant_id: A.tenantId, fiado_due_days: 30, fiado_block_after_days: 15 },
      update: { fiado_due_days: 30, fiado_block_after_days: 15 },
    });
    const C1 = await cliente(A, "M108 Cliente boleto");
    const d10 = somaDias(hojeStr, 10);
    const d30 = somaDias(hojeStr, 30);

    // -------------------------------------------------------------------- 1
    let saleId1 = "";
    let boletoId1 = "";
    let boletoId2 = "";
    await rodar("venda com boleto", async () => {
      console.log("1. Venda de R$ 100 em dois boletos (60 com número, 40 sem)");
      const r = await vender(A, C1, 10, [boleto(60, d10, "B-001"), boleto(40, d30)]);
      check("a venda com dois boletos: 201", r.status === 201, `${r.status} ${j(r.corpo)}`);
      saleId1 = idVenda(r);
      const bs = await boletosDaVenda(A, saleId1);
      check("nasceram 2 EmporioBoleto, os dois abertos", bs.length === 2 && bs.every((b) => b.status === "aberto"), j(bs));
      const [b1, b2] = bs;
      boletoId1 = b1?.id ?? "";
      boletoId2 = b2?.id ?? "";
      check("o primeiro: R$ 60, vence em +10, número B-001", perto(n(b1?.amount), 60) && diaDe(b1?.due_on) === d10 && b1?.number === "B-001", j(b1));
      check("o segundo: R$ 40, vence em +30, sem número", perto(n(b2?.amount), 40) && diaDe(b2?.due_on) === d30 && (b2?.number ?? null) === null, j(b2));
      check("os boletos são do cliente da venda", bs.every((b) => b.customer_id === C1.id && b.establishment_id === A.L1), j(bs));
      const sp = (await P.emporioSalePayment.findMany({ where: { sale_id: saleId1, kind: "boleto" } })) as Dado[];
      check("dois EmporioSalePayment kind boleto", sp.length === 2, j(sp));
      check("cada boleto aponta para o próprio pagamento da venda", new Set(bs.map((b) => b.sale_payment_id)).size === 2, j(bs));
      const en = await lancamentoDa(A, saleId1);
      const pgs = (await A.db.financialPayment.findMany({ where: { entry_id: en?.id } })) as Dado[];
      check("o lançamento da venda está pago", en?.status === "paid", j(en));
      check("com dois pagamentos método boleto (60 e 40)", pgs.length === 2 && pgs.every((p) => p.method === "boleto") && perto(pgs.reduce((s, p) => s + n(p.amount), 0), 100), j(pgs));
      check("cada boleto guarda o seu financial_payment_id", bs.every((b) => pgs.some((p) => p.id === b.financial_payment_id)), j(bs));
      check("nenhum CashMovement na venda (o boleto é o a receber)", (await A.db.cashMovement.count({ where: { sale_id: saleId1 } })) === 0);
    });

    // -------------------------------------------------------------------- 2
    await rodar("recusas", async () => {
      console.log("\n2. Recusas do boleto na venda");
      const v0 = await A.db.emporioSale.count();
      const rAntes = await vender(A, C1, 10, [boleto(100, somaDias(hojeStr, -1))]);
      check("vencimento antes do dia da venda: 422 em payments", erro(rAntes, 422, "payments"), `${rAntes.status} ${j(rAntes.corpo)}`);
      const rSem = await vender(A, C1, 10, [{ kind: "boleto", amount: 100, boleto: { number: "X" } }]);
      check("sem due_on: 422 em payments", erro(rSem, 422, "payments"), `${rSem.status} ${j(rSem.corpo)}`);
      const rSemObj = await vender(A, C1, 10, [{ kind: "boleto", amount: 100 }]);
      check("sem o objeto boleto: 422 em payments", erro(rSemObj, 422, "payments"), `${rSemObj.status} ${j(rSemObj.corpo)}`);
      const rCons = await vender(A, null, 10, [boleto(100, d10)]);
      check("Consumidor final: 422 em customer_id", erro(rCons, 422, "customer_id"), `${rCons.status} ${j(rCons.corpo)}`);
      check("as recusas não gravaram venda nem boleto", (await A.db.emporioSale.count()) === v0 && (await P.emporioBoleto.count({ where: { tenant_id: A.tenantId } })) === 2);
    });

    // -------------------------------------------------------------------- 3
    await rodar("titular do cheque", async () => {
      console.log("\n3. Cheque com titular (Q284)");
      const v0 = await A.db.emporioSale.count();
      const ck = { number: "1234", bank: "Sicredi", good_for: somaDias(hojeStr, 15) };
      const rSem = await vender(A, C1, 10, [{ kind: "cheque", amount: 100, check: ck }]);
      check("cheque sem holder_name: 422 em payments", erro(rSem, 422, "payments"), `${rSem.status} ${j(rSem.corpo)}`);
      const rVazio = await vender(A, C1, 10, [{ kind: "cheque", amount: 100, check: { ...ck, holder_name: "   " } }]);
      check("cheque com holder_name em branco: 422 em payments", erro(rVazio, 422, "payments"), `${rVazio.status} ${j(rVazio.corpo)}`);
      const rLongo = await vender(A, C1, 10, [{ kind: "cheque", amount: 100, check: { ...ck, holder_name: "x".repeat(121) } }]);
      check("holder_name de 121 caracteres: 422 em payments", erro(rLongo, 422, "payments"), `${rLongo.status} ${j(rLongo.corpo)}`);
      check("as recusas não gravaram venda", (await A.db.emporioSale.count()) === v0);
      const r = await vender(A, C1, 10, [cheque(100, { number: "9001", holder_name: "Maria de Terceiros" })]);
      check("cheque com holder_name: 201", r.status === 201, `${r.status} ${j(r.corpo)}`);
      const ch = await A.db.emporioCheck.findFirst({ where: { sale_id: idVenda(r) } });
      check("gravou o titular no cheque", ch?.holder_name === "Maria de Terceiros", j(ch));
      const g = await chamar(A.tok.owner, R.checks, "GET", "emporio/checks");
      const visto = lista(g).find((c) => c.id === ch?.id);
      check("GET checks devolve holder_name", g.status === 200 && visto?.holder_name === "Maria de Terceiros", `${g.status} ${j(visto)}`);
    });

    // -------------------------------------------------------------------- 4
    let saleVencido = "";
    let boletoVencido = "";
    await rodar("lista", async () => {
      console.log("\n4. A lista de boletos por situação");
      const C2 = await cliente(A, "M108 Cliente vencido");
      const rv = await vender(A, C2, 5, [boleto(50, d10, "VENC-1")]);
      saleVencido = idVenda(rv);
      const [bv] = await boletosDaVenda(A, saleVencido);
      boletoVencido = bv?.id ?? "";
      await P.emporioBoleto.update({ where: { id: boletoVencido }, data: { due_on: meioDia(somaDias(hojeStr, -3)) } });

      const todos = await listarBoletos(A, A.tok.owner);
      check("GET boletos: 200", todos.status === 200, `${todos.status} ${j(todos.corpo)}`);
      const v = lista(todos).find((b) => b.id === boletoVencido);
      const a1 = lista(todos).find((b) => b.id === boletoId1);
      check("o boleto vencido vem com overdue true e segue aberto", v?.overdue === true && v?.status === "aberto", j(v));
      check("o boleto em dia vem com overdue false", a1?.overdue === false && a1?.status === "aberto", j(a1));
      check("a linha traz os campos do contrato", !!a1 && a1.sale_id === saleId1 && a1.customer_id === C1.id && a1.customer_name === "M108 Cliente boleto"
        && a1.establishment_id === A.L1 && typeof a1.establishment_name === "string" && a1.number === "B-001" && diaDe(a1.due_on) === d10 && perto(n(a1.amount), 60)
        && "sale_number" in a1 && "bank_account_id" in a1 && "bank_account_name" in a1 && "paid_on" in a1 && "sent_to_fiado_at" in a1 && "reason" in a1, j(a1));
      const venc = await listarBoletos(A, A.tok.owner, "?status=vencido");
      check("status=vencido traz só o vencido", lista(venc).some((b) => b.id === boletoVencido) && !lista(venc).some((b) => b.id === boletoId1), j(lista(venc).map((b) => b.id)));
      const ab = await listarBoletos(A, A.tok.owner, "?status=aberto");
      check("status=aberto traz o boleto em dia", lista(ab).some((b) => b.id === boletoId1), j(lista(ab).map((b) => b.id)));
      const lj = await listarBoletos(A, A.tok.owner, `?loja=${A.L1}`);
      check("loja= da própria loja traz os boletos", lista(lj).some((b) => b.id === boletoId1));
      const inv = await listarBoletos(A, A.tok.owner, "?status=qualquer");
      check("status inválido: 422 em status", erro(inv, 422, "status"), `${inv.status} ${j(inv.corpo)}`);
    });

    // -------------------------------------------------------------------- 5
    await rodar("baixa", async () => {
      console.log("\n5. Baixa: Boleto pago (Q279)");
      const saldo = async () => {
        const r = await P.cashMovement.findMany({ where: { bank_account_id: A.conta } });
        return (r as Dado[]).reduce((s, m) => s + (m.direction === "entrada" ? n(m.amount) : -n(m.amount)), 0);
      };
      const s0 = await saldo();
      check("Vendedor baixa boleto: 403", erro(await chamar(A.tok.vend, R.pay, "POST", `emporio/boletos/${boletoId1}/pay`, { bank_account_id: A.conta }, boletoId1), 403));
      check("o 403 não baixou nada", (await P.emporioBoleto.findUnique({ where: { id: boletoId1 } }))?.status === "aberto");
      const fut = await chamar(A.tok.owner, R.pay, "POST", `emporio/boletos/${boletoId1}/pay`, { bank_account_id: A.conta, paid_on: somaDias(hojeStr, 3) }, boletoId1);
      check("paid_on futuro: 422 em paid_on", erro(fut, 422, "paid_on"), `${fut.status} ${j(fut.corpo)}`);
      const semConta = await chamar(A.tok.owner, R.pay, "POST", `emporio/boletos/${boletoId1}/pay`, {}, boletoId1);
      check("sem conta bancária: 422 em bank_account_id", erro(semConta, 422, "bank_account_id"), `${semConta.status} ${j(semConta.corpo)}`);
      check("as recusas não mexeram na conta", (await P.cashMovement.count({ where: { boleto_id: boletoId1 } })) === 0 && perto(await saldo(), s0));

      const ok = await chamar(A.tok.owner, R.pay, "POST", `emporio/boletos/${boletoId1}/pay`, { bank_account_id: A.conta }, boletoId1);
      check("o Dono baixa o boleto: 200", ok.status === 200, `${ok.status} ${j(ok.corpo)}`);
      const b = await P.emporioBoleto.findUnique({ where: { id: boletoId1 } });
      check("o boleto fica pago, com conta, data (hoje) e paid_at", b?.status === "pago" && b.bank_account_id === A.conta && diaDe(b.paid_on) === hojeStr && !!b.paid_at, j(b));
      const mv = (await P.cashMovement.findMany({ where: { boleto_id: boletoId1 } })) as Dado[];
      check("UMA entrada de R$ 60 na conta, origem boleto_pago, com sale_id", mv.length === 1 && mv[0].direction === "entrada" && perto(n(mv[0].amount), 60)
        && mv[0].origin === "boleto_pago" && mv[0].bank_account_id === A.conta && mv[0].sale_id === saleId1, j(mv));
      check("a conta ganhou 60", perto((await saldo()) - s0, 60));
      const dois = await chamar(A.tok.owner, R.pay, "POST", `emporio/boletos/${boletoId1}/pay`, { bank_account_id: A.conta }, boletoId1);
      check("segunda baixa: recusada (409)", dois.status === 409, `${dois.status} ${j(dois.corpo)}`);
      check("a segunda baixa não duplicou o dinheiro", (await P.cashMovement.count({ where: { boleto_id: boletoId1 } })) === 1);
      const pagos = await listarBoletos(A, A.tok.owner, "?status=pago");
      const p = lista(pagos).find((x) => x.id === boletoId1);
      check("status=pago traz o boleto, com conta e data", !!p && p.status === "pago" && p.bank_account_id === A.conta && diaDe(p.paid_on) === hojeStr, j(p));
      check("e status=aberto não o traz mais", !lista(await listarBoletos(A, A.tok.owner, "?status=aberto")).some((x) => x.id === boletoId1));
      const gest = await chamar(A.tok.gestor, R.pay, "POST", `emporio/boletos/${boletoId2}/pay`, { bank_account_id: A.conta, paid_on: somaDias(hojeStr, -1) }, boletoId2);
      check("o Gestor da loja baixa com data passada: 200", gest.status === 200, `${gest.status} ${j(gest.corpo)}`);
      const b2 = await P.emporioBoleto.findUnique({ where: { id: boletoId2 } });
      check("a data informada vale (ontem)", diaDe(b2?.paid_on) === somaDias(hojeStr, -1), j(b2));
      const mov2 = await P.cashMovement.findFirst({ where: { boleto_id: boletoId2 } });
      const diaDoMovimento = mov2 ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(mov2.occurred_at) : null;
      check("a entrada na conta cai no dia pago em Brasília (o extrato agrupa pelo dia de Brasília)", diaDoMovimento === somaDias(hojeStr, -1), `${diaDoMovimento}`);
      const outroBanco = await chamar(A.tok.owner, R.pay, "POST", `emporio/boletos/${boletoVencido}/pay`, { bank_account_id: B.conta }, boletoVencido);
      check("conta bancária de outro tenant: recusada (4xx, boleto segue aberto)", outroBanco.status >= 400 && outroBanco.status < 500
        && (await P.emporioBoleto.findUnique({ where: { id: boletoVencido } }))?.status === "aberto", `${outroBanco.status} ${j(outroBanco.corpo)}`);
    });

    // -------------------------------------------------------------------- 6
    await rodar("fiado", async () => {
      console.log("\n6. Mandar para o fiado (Q280)");
      const C3 = await cliente(A, "M108 Cliente fiado");
      const rv = await vender(A, C3, 8, [boleto(80, d10, "F-1")]);
      const sId = idVenda(rv);
      const [bf] = await boletosDaVenda(A, sId);
      const en = await lancamentoDa(A, sId);
      check("antes: lançamento pago e o cliente não deve", en?.status === "paid" && n((await chamar(A.tok.owner, R.credit, "GET", `emporio/customers/${C3.id}/credit`, undefined, C3.id)).corpo?.data?.owed_total) === 0);
      const url = `emporio/boletos/${bf.id}/to-fiado`;
      const sem = await chamar(A.tok.owner, R.toFiado, "POST", url, {}, bf.id);
      check("sem reason: 422 em reason", erro(sem, 422, "reason"), `${sem.status} ${j(sem.corpo)}`);
      const branco = await chamar(A.tok.owner, R.toFiado, "POST", url, { reason: "   " }, bf.id);
      check("reason em branco: 422 em reason", erro(branco, 422, "reason"), `${branco.status} ${j(branco.corpo)}`);
      check("Vendedor manda para o fiado: 403", erro(await chamar(A.tok.vend, R.toFiado, "POST", url, { reason: "x" }, bf.id), 403));
      check("as recusas deixaram o boleto aberto", (await P.emporioBoleto.findUnique({ where: { id: bf.id } }))?.status === "aberto");
      const ok = await chamar(A.tok.owner, R.toFiado, "POST", url, { reason: "Cliente pediu para acertar no balcão" }, bf.id);
      check("com reason: 200", ok.status === 200, `${ok.status} ${j(ok.corpo)}`);
      const b = await P.emporioBoleto.findUnique({ where: { id: bf.id } });
      check("o boleto fica no_fiado, com o motivo e o carimbo", b?.status === "no_fiado" && b.fiado_reason === "Cliente pediu para acertar no balcão" && !!b.sent_to_fiado_at, j(b));
      check("o FinancialPayment do boleto sumiu", (await A.db.financialPayment.count({ where: { entry_id: en.id } })) === 0);
      check("o lançamento da venda voltou a pendente", (await A.db.financialEntry.findUnique({ where: { id: en.id } }))?.status === "pending");
      const cred = await chamar(A.tok.owner, R.credit, "GET", `emporio/customers/${C3.id}/credit`, undefined, C3.id);
      check("o cliente passa a dever R$ 80 no fiado", perto(n(cred.corpo?.data?.owed_total), 80), j(cred.corpo?.data));
      const nf = lista(await listarBoletos(A, A.tok.owner, "?status=no_fiado")).find((x) => x.id === bf.id);
      check("status=no_fiado traz o boleto, com motivo e data", !!nf && nf.reason === "Cliente pediu para acertar no balcão" && !!nf.sent_to_fiado_at, j(nf));
      const de_novo = await chamar(A.tok.owner, R.toFiado, "POST", url, { reason: "de novo" }, bf.id);
      check("mandar de novo: recusado (409)", de_novo.status === 409, `${de_novo.status} ${j(de_novo.corpo)}`);
      const pagoDepois = await chamar(A.tok.owner, R.pay, "POST", `emporio/boletos/${bf.id}/pay`, { bank_account_id: A.conta }, bf.id);
      check("baixar um boleto no fiado: recusado (409)", pagoDepois.status === 409, `${pagoDepois.status} ${j(pagoDepois.corpo)}`);
      const jaPago = await chamar(A.tok.owner, R.toFiado, "POST", `emporio/boletos/${boletoId1}/to-fiado`, { reason: "x" }, boletoId1);
      check("mandar para o fiado um boleto já pago: recusado (409)", jaPago.status === 409, `${jaPago.status} ${j(jaPago.corpo)}`);
    });

    // -------------------------------------------------------------------- 7
    await rodar("crédito", async () => {
      console.log("\n7. Boleto vencido pesa no crédito do cliente (Q280)");
      const C4 = await cliente(A, "M108 Cliente atraso");
      const rv = await vender(A, C4, 5, [boleto(50, d10)]);
      const sId = idVenda(rv);
      const [b] = await boletosDaVenda(A, sId);
      const c0 = await chamar(A.tok.owner, R.credit, "GET", `emporio/customers/${C4.id}/credit`, undefined, C4.id);
      check("boleto em dia: o cliente está em_dia", c0.corpo?.data?.status === "em_dia" && !c0.corpo?.data?.oldest_overdue, `${c0.status} ${j(c0.corpo?.data)}`);
      await P.emporioBoleto.update({ where: { id: b.id }, data: { due_on: meioDia(somaDias(hojeStr, -20)) } });
      const c1 = await chamar(A.tok.owner, R.credit, "GET", `emporio/customers/${C4.id}/credit`, undefined, C4.id);
      check("boleto vencido há 20 dias (bloqueio em 15): bloqueado_por_atraso", c1.corpo?.data?.status === "bloqueado_por_atraso", j(c1.corpo?.data));
      check("oldest_overdue.days é 20, contado pelo due_on do boleto", c1.corpo?.data?.oldest_overdue?.days === 20, j(c1.corpo?.data?.oldest_overdue));
      const v2 = await vender(A, C4, 1, [{ kind: "fiado", amount: 10 }]);
      check("e a venda no fiado desse cliente é recusada (409)", v2.status === 409, `${v2.status} ${j(v2.corpo)}`);
      const baixa = await chamar(A.tok.owner, R.pay, "POST", `emporio/boletos/${b.id}/pay`, { bank_account_id: A.conta }, b.id);
      check("pago o boleto: 200", baixa.status === 200, `${baixa.status}`);
      const c2 = await chamar(A.tok.owner, R.credit, "GET", `emporio/customers/${C4.id}/credit`, undefined, C4.id);
      check("depois da baixa o atraso some: em_dia", c2.corpo?.data?.status === "em_dia", j(c2.corpo?.data));
    });

    // -------------------------------------------------------------------- 8
    await rodar("cancelar", async () => {
      console.log("\n8. Cancelar a venda com boleto");
      const C5 = await cliente(A, "M108 Cliente cancela");
      const rAb = await vender(A, C5, 10, [boleto(100, d10)]);
      const sAb = idVenda(rAb);
      const [bAb] = await boletosDaVenda(A, sAb);
      const cAb = await chamar(A.tok.owner, R.cancel, "POST", `emporio/sales/${sAb}/cancel`, { reason: "Erro de digitação", cash_register_id: A.reg }, sAb);
      check("cancelar venda com boleto aberto: 200", cAb.status === 200, `${cAb.status} ${j(cAb.corpo)}`);
      check("o boleto vira cancelado", (await P.emporioBoleto.findUnique({ where: { id: bAb.id } }))?.status === "cancelado");
      const en = await lancamentoDa(A, sAb);
      check("o lançamento da venda fica cancelado e nenhum dinheiro entrou na conta", en?.status === "cancelled" && (await P.cashMovement.count({ where: { boleto_id: bAb.id } })) === 0, j(en));
      check("o boleto cancelado não aparece em aberto", !lista(await listarBoletos(A, A.tok.owner, "?status=aberto")).some((x) => x.id === bAb.id));

      const rPg = await vender(A, C5, 10, [boleto(100, d10)]);
      const sPg = idVenda(rPg);
      const [bPg] = await boletosDaVenda(A, sPg);
      await chamar(A.tok.owner, R.pay, "POST", `emporio/boletos/${bPg.id}/pay`, { bank_account_id: A.conta }, bPg.id);
      const cPg = await chamar(A.tok.owner, R.cancel, "POST", `emporio/sales/${sPg}/cancel`, { reason: "Tentativa", cash_register_id: A.reg }, sPg);
      check("cancelar venda com boleto pago: 409", cPg.status === 409, `${cPg.status} ${j(cPg.corpo)}`);
      check("a mensagem diz que há boleto já pago", /boleto j[aá] pago/i.test(String(cPg.corpo?.error?.message ?? "")), j(cPg.corpo));
      check("a venda segue concluída e o boleto pago", (await A.db.emporioSale.findUnique({ where: { id: sPg } }))?.status === "concluida"
        && (await P.emporioBoleto.findUnique({ where: { id: bPg.id } }))?.status === "pago");
    });

    // -------------------------------------------------------------------- 9
    await rodar("isolamento", async () => {
      console.log("\n9. Isolamento entre tenants");
      const C6 = await cliente(A, "M108 Cliente isolamento");
      const rv = await vender(A, C6, 3, [boleto(30, d10, "ISO")]);
      const [bi] = await boletosDaVenda(A, idVenda(rv));
      const lb = await listarBoletos(B, B.tok.owner);
      check("o tenant B lista boletos: 200 e sem o do A", lb.status === 200 && !lista(lb).some((x) => x.id === bi.id), `${lb.status}`);
      const pb = await chamar(B.tok.owner, R.pay, "POST", `emporio/boletos/${bi.id}/pay`, { bank_account_id: B.conta }, bi.id);
      check("o tenant B paga o boleto do A: 404", pb.status === 404, `${pb.status} ${j(pb.corpo)}`);
      const fb = await chamar(B.tok.owner, R.toFiado, "POST", `emporio/boletos/${bi.id}/to-fiado`, { reason: "invasão" }, bi.id);
      check("o tenant B manda o boleto do A para o fiado: 404", fb.status === 404, `${fb.status} ${j(fb.corpo)}`);
      check("o boleto do A segue aberto e sem dinheiro", (await P.emporioBoleto.findUnique({ where: { id: bi.id } }))?.status === "aberto" && (await P.cashMovement.count({ where: { boleto_id: bi.id } })) === 0);
    });
  } finally {
    for (const id of tenantIds.reverse()) {
      await P.emporioBoleto.deleteMany({ where: { tenant_id: id } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id } }).catch((e: unknown) => console.log(`  (teardown ${id}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\n✅ M108 (Módulo 39, Empório): boleto na venda e titular do cheque passaram." : `\n❌ M108 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  // Como as outras suítes: a rota de token deixa o Redis aberto e o processo não encerra sozinho.
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
