import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();
// A suíte verifica o pedido e o histórico no banco local; não envia email real.
process.env.EMAIL_PROVIDER = "gmail_smtp";
delete process.env.GMAIL_SMTP_USER;
delete process.env.GMAIL_SMTP_APP_PASSWORD;

/**
 * M100: Módulo 39 (Meu Empório), financeiro das lojas, entrega 3: acordo, alçada e carimbo.
 * Roda: `npm run test:m100`
 *
 * Escrita da spec (2026-11-07, "Entrega 3") e do plano (2026-11-08), sem ler a implementação.
 *
 * Seção 1: as funções puras do acordo (parcelas e validação). Sem banco.
 * Seção 2: o acordo de fiado em parcelas.
 * Seção 3: a alçada de pagamento (teto, pedido, aprovar, recusar, travas).
 * Seção 4: o carimbo de conciliação no extrato.
 * Seção 5: isolamento entre tenants.
 *
 * Fixtures: as vendas e as despesas de preparação passam pelas actions (como a m98 e a m99); o que está sob prova
 * passa sempre pela ROTA. O "vencida" da parcela é ajustado por Prisma (a data não pode nascer no passado).
 * A suíte nasce vermelha: as rotas e as regras das Tasks 3 a 5 ainda não existem.
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

console.log("🧾 M100: Módulo 39 (Meu Empório), financeiro das lojas, entrega 3: acordo, alçada e carimbo\n");

const tenantIds: string[] = [];
const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const diaDe = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;
const n = (x: unknown) => Number(x);
const emDias = (dias: number) => somaDias(hojeStr, dias);

// ---------------------------------------------------------------------------
// Seção 1 (pura): as funções do acordo
// ---------------------------------------------------------------------------

async function secao1Pura() {
  console.log("Seção 1: as funções puras do acordo (sem banco)");
  const A: Dado = await import("@/lib/emporio/acordo");
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const hoje = d("2026-11-08");
  const boa = [
    { due_date: d("2026-12-10"), amount_cent: 3335 },
    { due_date: d("2027-01-09"), amount_cent: 3333 },
    { due_date: d("2027-02-08"), amount_cent: 3333 },
  ];

  console.log("  a categoria");
  check("CATEGORIA_ACORDO vale 'Acordo de fiado'", A.CATEGORIA_ACORDO === "Acordo de fiado", String(A.CATEGORIA_ACORDO));

  console.log("  dividirEmParcelas");
  const p = A.dividirEmParcelas(10001, 3, d("2026-12-10"), 30) as { due_date: Date; amount_cent: number }[];
  check("10001 centavos em 3: o resto vai para a primeira (3335, 3333, 3333)", j(p.map((x) => x.amount_cent)) === j([3335, 3333, 3333]), j(p));
  check("as datas somam 30 dias a cada parcela (10/12, 09/01, 08/02)", j(p.map((x) => x.due_date.toISOString().slice(0, 10))) === j(["2026-12-10", "2027-01-09", "2027-02-08"]), j(p));
  check("as datas saem em meia-noite UTC", p.every((x) => x.due_date.getTime() % 86_400_000 === 0));
  check("a soma das parcelas é exatamente o total", p.reduce((s, x) => s + x.amount_cent, 0) === 10001);
  const um = A.dividirEmParcelas(5000, 1, d("2026-12-10"), 30) as { due_date: Date; amount_cent: number }[];
  check("uma parcela só leva o total inteiro", um.length === 1 && um[0].amount_cent === 5000, j(um));
  const exato = A.dividirEmParcelas(9000, 3, d("2026-12-10"), 15) as { due_date: Date; amount_cent: number }[];
  check("divisão exata não deixa resto (3000 x 3) e respeita o intervalo de 15 dias", j(exato.map((x) => x.amount_cent)) === j([3000, 3000, 3000]) && exato[2].due_date.toISOString().slice(0, 10) === "2027-01-09", j(exato));

  console.log("  validarParcelas");
  const v = (lista: unknown, total: number) => A.validarParcelas(lista, total, hoje) as { ok: boolean; field?: string; message?: string };
  check("a lista boa passa", v(boa, 10001).ok === true, j(v(boa, 10001)));
  const soma = v(boa, 10002);
  check("soma diferente do total reprova no campo installments, com mensagem", soma.ok === false && soma.field === "installments" && !!soma.message, j(soma));
  const zero = v([{ due_date: d("2026-12-10"), amount_cent: 0 }, { due_date: d("2027-01-10"), amount_cent: 10001 }], 10001);
  check("valor zero reprova no campo installments", zero.ok === false && zero.field === "installments", j(zero));
  const neg = v([{ due_date: d("2026-12-10"), amount_cent: -5 }, { due_date: d("2027-01-10"), amount_cent: 10006 }], 10001);
  check("valor negativo reprova", neg.ok === false, j(neg));
  const passado = v([{ due_date: d("2026-11-07"), amount_cent: 5000 }, { due_date: d("2026-12-10"), amount_cent: 5000 }], 10000);
  check("data antes de hoje reprova", passado.ok === false && passado.field === "installments", j(passado));
  const hojeOk = v([{ due_date: d("2026-11-08"), amount_cent: 5000 }, { due_date: d("2026-12-10"), amount_cent: 5000 }], 10000);
  check("a primeira parcela vencendo hoje é válida (só antes de hoje reprova)", hojeOk.ok === true, j(hojeOk));
  const fora = v([{ due_date: d("2027-01-10"), amount_cent: 5000 }, { due_date: d("2026-12-10"), amount_cent: 5000 }], 10000);
  check("datas fora de ordem reprovam", fora.ok === false && fora.field === "installments", j(fora));
  const muitas = Array.from({ length: 49 }, (_, i) => ({ due_date: new Date(Date.parse("2026-12-10T00:00:00Z") + i * 30 * DIA), amount_cent: 100 }));
  check("49 parcelas reprovam (o teto é 48)", v(muitas, 4900).ok === false, j(v(muitas, 4900)));
  check("48 parcelas passam", v(muitas.slice(0, 48), 4800).ok === true, j(v(muitas.slice(0, 48), 4800)));
  check("lista vazia reprova (mínimo 1)", v([], 0).ok === false || v([], 10001).ok === false);
}

// ---------------------------------------------------------------------------
// Montagem (banco)
// ---------------------------------------------------------------------------

async function comBanco(fn: () => Promise<void>) {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  await fn();
}

type Usuario = { id: string; role: "OWNER" | "OPERADOR" | "ADMIN"; email: string };
type Mundo = {
  rotulo: string;
  tenantId: string;
  db: Dado;
  owner: Usuario;
  gestor: Usuario; // gestor da L1
  vend: Usuario; // vendedor da L1
  fin: Usuario; // financeiro, sem loja
  gg: Usuario; // gerente geral
  tok: Record<"owner" | "gestor" | "vend" | "fin" | "gg", string>;
  L1: string;
  reg: string; // caixa 1 da L1
  conta: string; // conta bancária com saldo inicial de 1000
  contaVazia: string; // conta bancária sem saldo inicial
  prodId: string;
  presId: string;
};

let M: { A: Mundo; B: Mundo } | null = null;

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, papelFinanceiro, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const Cx = await import("@/lib/actions/emporio-caixa");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M100 ${rotulo} ${stamp}`, document: `M100${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR" | "ADMIN", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M100 ${suf}`, email: `m100-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vend = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: ["lancar_compra", "devolver_trocar"] });
  const fin = await mk("fin", "OPERADOR", papelFinanceiro());
  const gg = await mk("gg", "ADMIN");

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M100 ${rotulo} Loja 1` });
  if (!l1.ok) throw new Error(`loja: ${j(l1)}`);
  const L1 = l1.data.id as string;
  await vincularTodas(prisma, t.id, [gestor.id, vend.id], [L1]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M100 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M100 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L1, presentation_id: pres.data.id, price: 10 });
  if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
  const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L1, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
  if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  const c1 = await Cx.criarContaAction(db, owner, { name: `M100 Conta ${rotulo} ${stamp}`, bank: "Banco M100" });
  const c2 = await Cx.criarContaAction(db, owner, { name: `M100 Conta vazia ${rotulo} ${stamp}`, bank: "Banco M100" });
  if (!c1.ok || !c2.ok) throw new Error(`contas: ${j([c1, c2])}`);
  const conta = c1.data.id as string;
  const contaVazia = c2.data.id as string;
  for (const input of [
    { bank_account_id: conta, amount: 1000 },
    { establishment_id: L1, amount: 200 },
    { manager_establishment_id: L1, amount: 50 },
  ]) {
    const s = await Cx.saldoInicialCaixaAction(db, owner, input);
    if (!s.ok) throw new Error(`saldo inicial ${j(input)}: ${j(s)}`);
  }
  // o saldo inicial da gaveta só vale antes do primeiro turno
  await abrirTurnoDeTeste(db, owner, L1);
  const reg = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))?.id as string;

  const tok = {} as Mundo["tok"];
  const pares: [keyof Mundo["tok"], Usuario][] = [["owner", owner], ["gestor", gestor], ["vend", vend], ["fin", fin], ["gg", gg]];
  for (const [k, u] of pares) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { rotulo, tenantId: t.id, db, owner, gestor, vend, fin, gg, tok, L1, reg, conta, contaVazia, prodId: prod.data.id, presId: pres.data.id };
}

// Rotas (import literal, para o bundler do tsx resolver os colchetes)
const R = {
  agreements: () => import("@/app/api/v1/emporio/customers/[id]/agreements/route"),
  credit: () => import("@/app/api/v1/emporio/customers/[id]/credit/route"),
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  saleCancel: () => import("@/app/api/v1/emporio/sales/[id]/cancel/route"),
  saleReturn: () => import("@/app/api/v1/emporio/sales/[id]/return/route"),
  receive: () => import("@/app/api/v1/emporio/receivables/receive/route"),
  collections: () => import("@/app/api/v1/emporio/finance/collections/route"),
  payablesPay: () => import("@/app/api/v1/emporio/payables/pay/route"),
  payable: () => import("@/app/api/v1/emporio/payables/[id]/route"),
  payableDue: () => import("@/app/api/v1/emporio/payables/[id]/due-date/route"),
  payableCancel: () => import("@/app/api/v1/emporio/payables/[id]/cancel/route"),
  requests: () => import("@/app/api/v1/emporio/finance/payment-requests/route"),
  approve: () => import("@/app/api/v1/emporio/finance/payment-requests/[id]/approve/route"),
  checkReturn: () => import("@/app/api/v1/emporio/checks/[id]/return/route"),
  reject: () => import("@/app/api/v1/emporio/finance/payment-requests/[id]/reject/route"),
  settings: () => import("@/app/api/v1/emporio/settings/route"),
  approval: () => import("@/app/api/v1/emporio/settings/approval/route"),
  statement: () => import("@/app/api/v1/emporio/finance/statement/route"),
  reconcile: () => import("@/app/api/v1/emporio/finance/statement/reconcile/route"),
  today: () => import("@/app/api/v1/emporio/finance/today/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, corpo?: unknown, id?: string | Record<string, string>): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  let m: Dado;
  try {
    m = await rota();
  } catch (e) {
    // rota ainda não existe (a implementação está pendente): reprova só as afirmações dela, não a seção inteira
    return { status: 0, corpo: { import_error: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
  if (typeof m[metodo] !== "function") return { status: 0, corpo: { import_error: `a rota não exporta ${metodo}` } };
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve(typeof id === "string" ? { id } : id) }));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}
const erro = (r: Resp, status: number, code?: string, field?: string) =>
  r.status === status && (code === undefined || r.corpo?.error?.code === code) && (field === undefined || r.corpo?.error?.field === field);
const ok2xx = (r: Resp) => r.status >= 200 && r.status < 300;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m100-${p}-${stamp}-${(seq += 1)}`;

// Estado que a seção 5 reaproveita (o que a seção 3 e a 4 deixaram no tenant A)
const X = { clienteAcordo: "", acordoId: "", pedidoId: "", entryPedido: "", movCarimbado: "", cartaoCarimbado: "" };

// --- fixtures ---

const PADRAO = { fiado_due_days: 30, fiado_block_after_days: 15, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null };

async function config(w: Mundo, d: Dado = {}) {
  const { prisma } = await import("@/lib/prisma");
  const dados = { ...PADRAO, ...d };
  await (prisma as Dado).emporioSettings.upsert({ where: { tenant_id: w.tenantId }, create: { tenant_id: w.tenantId, ...dados }, update: dados });
}
/** Fixtures de atraso: com o bloqueio no teto, para a segunda venda vencida do mesmo cliente não ser recusada. */
const abrirFixtures = (w: Mundo) => config(w, { fiado_block_after_days: 365 });

async function cliente(w: Mundo, nome: string, extra: Dado = {}) {
  const { prisma } = await import("@/lib/prisma");
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: `M100 ${nome}`, ...extra } as Dado })) as Dado;
}

const itens = (w: Mundo, qty: number) => [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: qty }];

async function vender(w: Mundo, cli: Dado, qty: number, payments: Dado[], over: Dado = {}): Promise<string> {
  const V = await import("@/lib/actions/emporio-vendas");
  const r = await V.venderAction(w.db, w.owner, {
    operation_key: chave("venda"), establishment_id: w.L1, cash_register_id: w.reg,
    customer_id: cli.id, items: itens(w, qty), payments, ...over,
  } as Dado);
  if (!r.ok) throw new Error(`venda de preparação: ${j(r)}`);
  return (r.data as Dado).id as string;
}

const entradaDaVenda = async (w: Mundo, vendaId: string, cli: Dado) =>
  ((await w.db.financialEntry.findFirst({ where: { related_module: "emporio", related_id: vendaId, entry_type: "income" } }))
    ?? (await w.db.financialEntry.findFirst({ where: { emporio_customer_id: cli.id, entry_type: "income" }, orderBy: { created_at: "desc" } }))) as Dado;

/** Fiado de `valor` reais (preço 10 o quilo) vencendo daqui a `venc` dias (negativo: já vencido, com a venda cinco dias antes). */
async function fiado(w: Mundo, cli: Dado, valor: number, venc: number): Promise<{ vendaId: string; entry: Dado }> {
  const vendaId = await vender(w, cli, valor / 10, [{ kind: "fiado", amount: valor, due_date: meioDia(emDias(venc)) }],
    venc < 0 ? { sold_at: new Date(Date.now() - (-venc + 5) * DIA) } : {});
  return { vendaId, entry: await entradaDaVenda(w, vendaId, cli) };
}

/** Parcelas iguais em reais, o resto dos centavos na primeira, a primeira daqui a `primeira` dias. */
function partes(totalCent: number, q: number, primeira: number, passo = 30) {
  const base = Math.floor(totalCent / q);
  const resto = totalCent - base * q;
  return Array.from({ length: q }, (_, i) => ({ due_date: emDias(primeira + i * passo), amount: (base + (i === 0 ? resto : 0)) / 100 }));
}

const acordar = (tok: string, cli: Dado, ids: string[], parcelas: Dado[], notes?: string) =>
  chamar(tok, R.agreements, "POST", `emporio/customers/${cli.id}/agreements`, { entry_ids: ids, installments: parcelas, ...(notes ? { notes } : {}) }, cli.id);
const listarAcordos = (tok: string, cli: Dado) => chamar(tok, R.agreements, "GET", `emporio/customers/${cli.id}/agreements`, undefined, cli.id);
const credito = (tok: string, cli: Dado) => chamar(tok, R.credit, "GET", `emporio/customers/${cli.id}/credit`, undefined, cli.id);
const vendaRota = (w: Mundo, cli: Dado, valor: number) =>
  chamar(w.tok.owner, R.sales, "POST", "emporio/sales", {
    operation_key: chave("rota"), establishment_id: w.L1, cash_register_id: w.reg, customer_id: cli.id, items: itens(w, valor / 10), payments: [{ kind: "fiado", amount: valor }],
  });
const receber = (w: Mundo, cli: Dado, valor: number) =>
  chamar(w.tok.fin, R.receive, "POST", "emporio/receivables/receive", {
    operation_key: chave("rec"), customer_id: cli.id, establishment_id: w.L1, amount: valor, kind: "pix", bank_account_id: w.conta,
  });

// ---------------------------------------------------------------------------
// Seção 2: o acordo
// ---------------------------------------------------------------------------

async function secao2() {
  console.log("\nSeção 2: o acordo de fiado em parcelas");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");
  const F: Dado = await import("@/lib/emporio/acordo");
  const catAcordo = F.CATEGORIA_ACORDO ?? "Acordo de fiado";
  const parcelasDe = async (acordoId: string) =>
    (await A.db.financialEntry.findMany({ where: { agreement_id: String(acordoId ?? "x"), status: { not: "cancelled" }, category: catAcordo }, orderBy: { due_date: "asc" } })) as Dado[];

  // ---- o cenário base: 30 vencido há 20 dias e 70 em dia, o mesmo cliente
  await abrirFixtures(A);
  const c1 = await cliente(A, "Acordo base");
  const f1 = await fiado(A, c1, 30, -20);
  const f2 = await fiado(A, c1, 70, 10);
  await config(A);
  const colAntes = await chamar(A.tok.fin, R.collections, "GET", "emporio/finance/collections");
  check("(fixture) antes do acordo o cliente está na lista de cobrança, vencido", colAntes.status === 200 && j(colAntes.corpo).includes(c1.id), `${colAntes.status}`);
  const credAntes = (await credito(A.tok.owner, c1)).corpo?.data as Dado;
  check("(fixture) antes do acordo o cliente deve 100 e está bloqueado por atraso", perto(credAntes?.owed_total, 100) && credAntes?.status === "bloqueado_por_atraso", j(credAntes));

  console.log("  (a) o total a receber não muda, as origens saem da cobrança");
  const r1 = await acordar(A.tok.fin, c1, [f1.entry.id, f2.entry.id], partes(10000, 3, 10), "Acordo combinado por telefone");
  check("Financeiro faz o acordo: 201", r1.status === 201, `${r1.status} ${j(r1.corpo)}`);
  const ac = r1.corpo?.data as Dado;
  X.clienteAcordo = c1.id;
  X.acordoId = String(ac?.id ?? "");
  check("a view traz total 100, 3 parcelas, 2 origens, status ativo e aberto 100",
    perto(ac?.total, 100) && ac?.installments?.length === 3 && ac?.origins?.length === 2 && ac?.status === "ativo" && perto(ac?.open_total, 100), j(ac));
  check("as parcelas vêm numeradas 1, 2, 3, com valor e vencimento, todas em_dia",
    j((ac?.installments ?? []).map((p: Dado) => p.number)) === j([1, 2, 3]) && (ac?.installments ?? []).every((p: Dado) => p.status === "em_dia" && typeof p.due_date === "string" && perto(p.paid, 0))
    && perto((ac?.installments ?? []).reduce((s: number, p: Dado) => s + n(p.amount), 0), 100), j(ac?.installments));
  check("as origens da view são as duas entradas dos fiados", [f1.entry.id, f2.entry.id].every((id) => (ac?.origins ?? []).some((o: Dado) => o.entry_id === id)), j(ac?.origins));
  check("a view diz quem criou e as observações", !!ac?.created_by && ac?.notes === "Acordo combinado por telefone" && typeof ac?.created_at === "string", j(ac));
  const credDepois = (await credito(A.tok.owner, c1)).corpo?.data as Dado;
  check("o total devido do cliente é o mesmo de antes (100): o acordo troca a forma, não o valor", perto(credDepois?.owed_total, 100), j(credDepois));
  const oAntes = (await A.db.financialEntry.findMany({ where: { id: { in: [f1.entry.id, f2.entry.id] } } })) as Dado[];
  check("as duas origens ficam cancelled, marcadas com o acordo", oAntes.length === 2 && oAntes.every((e) => e.status === "cancelled" && e.agreement_id === ac?.id), j(oAntes.map((e) => [e.status, e.agreement_id])));
  const ps = await parcelasDe(ac?.id);
  check("nascem 3 entradas pending de 'Acordo de fiado', ligadas ao acordo, que somam 100",
    ps.length === 3 && ps.every((e) => e.status === "pending" && e.entry_type === "income" && e.related_id === ac?.id && e.emporio_customer_id === c1.id) && perto(ps.reduce((s, e) => s + n(e.amount), 0), 100), j(ps.map((e) => [e.status, e.amount, e.related_id])));
  const acDb = (await (prisma as Dado).emporioCreditAgreement.findUnique({ where: { id: String(ac?.id ?? "x") } })) as Dado;
  check("o registro do acordo tem total 100 e 3 parcelas", perto(n(acDb?.total), 100) && acDb?.installments === 3, j(acDb));
  const credStatus = credDepois;
  check("o atraso saiu: o cliente não está mais bloqueado por atraso", credStatus?.status !== "bloqueado_por_atraso" && !credStatus?.oldest_overdue, j(credStatus));
  const colDepois = await chamar(A.tok.fin, R.collections, "GET", "emporio/finance/collections");
  check("o cliente sai da lista de cobrança (as origens somem; as parcelas ainda não venceram)", colDepois.status === 200 && !j(colDepois.corpo).includes(c1.id), `${colDepois.status} ${j(colDepois.corpo).slice(0, 200)}`);

  console.log("  (b) a listagem do cliente");
  const lis = await listarAcordos(A.tok.fin, c1);
  check("GET agreements: 200 com o acordo na lista", lis.status === 200 && Array.isArray(lis.corpo?.data) && lis.corpo.data.some((x: Dado) => x.id === ac?.id), `${lis.status} ${j(lis.corpo)}`);
  const lisV = await listarAcordos(A.tok.vend, c1);
  check("o Vendedor da loja também lê os acordos do cliente: 200", lisV.status === 200, `${lisV.status} ${j(lisV.corpo)}`);

  console.log("  (c) o Histórico");
  const hist = (await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "fiado.acordo", target_id: c1.id } })) as Dado[];
  check("grava fiado.acordo uma vez, no alvo cliente", hist.length === 1 && hist[0].target_type === "cliente", j(hist.map((h) => [h.target_type, h.target_id])));
  check("o resumo cita o cliente, o valor e a quantidade de parcelas", /M100 Acordo base/.test(String(hist[0]?.summary)) && /100,00/.test(String(hist[0]?.summary)) && /3 parcelas/.test(String(hist[0]?.summary)), String(hist[0]?.summary));
  check("o changes tem uma linha por origem e uma por parcela (5)", Array.isArray(hist[0]?.changes) && hist[0].changes.length === 5, j(hist[0]?.changes));

  console.log("  (d) quem faz o acordo");
  const cg = await cliente(A, "Acordo permissao");
  const g1 = await fiado(A, cg, 40, 10);
  const g2 = await fiado(A, cg, 40, 10);
  const contaAntes = await (prisma as Dado).emporioCreditAgreement.count({ where: { customer_id: cg.id } });
  const pgg = await acordar(A.tok.gg, cg, [g1.entry.id], partes(4000, 2, 10));
  check("Gerente geral não faz acordo: 403", pgg.status === 403, `${pgg.status} ${j(pgg.corpo)}`);
  const pge = await acordar(A.tok.gestor, cg, [g1.entry.id], partes(4000, 2, 10));
  check("o Gestor da loja não faz acordo: 403", pge.status === 403, `${pge.status}`);
  const pve = await acordar(A.tok.vend, cg, [g1.entry.id], partes(4000, 2, 10));
  check("o Vendedor não faz acordo: 403", pve.status === 403, `${pve.status}`);
  check("as recusas 403 não gravaram acordo nem mexeram na origem", (await (prisma as Dado).emporioCreditAgreement.count({ where: { customer_id: cg.id } })) === contaAntes
    && (await A.db.financialEntry.findFirst({ where: { id: g1.entry.id } })).status === "pending");
  const pdono = await acordar(A.tok.owner, cg, [g1.entry.id], partes(4000, 2, 10));
  check("o Dono faz o acordo: 201", pdono.status === 201, `${pdono.status} ${j(pdono.corpo)}`);
  const pfin = await acordar(A.tok.fin, cg, [g2.entry.id], partes(4000, 2, 10));
  check("o Financeiro faz o acordo: 201", pfin.status === 201, `${pfin.status} ${j(pfin.corpo)}`);

  console.log("  (e) parcela vencida bloqueia");
  const cv = await cliente(A, "Acordo parcela vencida");
  const fv = await fiado(A, cv, 50, 10);
  const rv = await acordar(A.tok.fin, cv, [fv.entry.id], partes(5000, 2, 0));
  check("(fixture) acordo com a primeira parcela vencendo hoje: 201", rv.status === 201, `${rv.status} ${j(rv.corpo)}`);
  const emDia = (await credito(A.tok.owner, cv)).corpo?.data as Dado;
  check("com a parcela em dia o cliente não está bloqueado", emDia?.status !== "bloqueado_por_atraso", j(emDia));
  const p1 = (await parcelasDe(rv.corpo?.data?.id))[0];
  if (p1?.id) await A.db.financialEntry.update({ where: { id: p1.id }, data: { due_date: meioDia(emDias(-20)) } });
  const blq = (await credito(A.tok.owner, cv)).corpo?.data as Dado;
  check("a parcela vencida há 20 dias (bloqueio em 15) deixa o cliente bloqueado_por_atraso", blq?.status === "bloqueado_por_atraso", j(blq));
  const venda = await vendaRota(A, cv, 10);
  check("e o fiado novo é recusado: 409 FIADO_BLOQUEADO no campo payments", erro(venda, 409, "FIADO_BLOQUEADO", "payments"), `${venda.status} ${j(venda.corpo)}`);
  const lv = (await listarAcordos(A.tok.fin, cv)).corpo?.data?.[0] as Dado;
  check("a view marca a parcela como vencida", lv?.installments?.[0]?.status === "vencida" && lv?.installments?.[1]?.status === "em_dia", j(lv?.installments));

  console.log("  (f) acordo em dia desbloqueia, dentro do limite");
  await abrirFixtures(A);
  const cd = await cliente(A, "Acordo desbloqueia", { fiado_limit: 500 });
  const fd = await fiado(A, cd, 100, -20);
  await config(A);
  const antesD = await vendaRota(A, cd, 10);
  check("(fixture) vencido há 20 dias, o fiado novo é recusado: 409 FIADO_BLOQUEADO", erro(antesD, 409, "FIADO_BLOQUEADO", "payments"), `${antesD.status} ${j(antesD.corpo)}`);
  const rd = await acordar(A.tok.fin, cd, [fd.entry.id], partes(10000, 2, 5));
  check("o acordo com parcelas em dia: 201", rd.status === 201, `${rd.status} ${j(rd.corpo)}`);
  const depoisD = await vendaRota(A, cd, 50);
  check("depois do acordo, um fiado de 50 passa: 201", depoisD.status === 201, `${depoisD.status} ${j(depoisD.corpo)}`);
  const alemD = await vendaRota(A, cd, 400);
  check("mas 400 estoura o limite de 500 (100 do acordo e 50 já devidos): 409 LIMITE_EXCEDIDO", erro(alemD, 409, "LIMITE_EXCEDIDO", "payments"), `${alemD.status} ${j(alemD.corpo)}`);

  console.log("  (g) o devido para o limite inclui as parcelas");
  const ce = await cliente(A, "Acordo limite", { fiado_limit: 120 });
  const fe = await fiado(A, ce, 100, 10);
  const re = await acordar(A.tok.fin, ce, [fe.entry.id], partes(10000, 2, 5));
  check("(fixture) acordo de 100 para quem tem limite 120: 201", re.status === 201, `${re.status} ${j(re.corpo)}`);
  const e30 = await vendaRota(A, ce, 30);
  check("fiado de 30 estoura o limite (100 em parcelas + 30 > 120): 409 LIMITE_EXCEDIDO", erro(e30, 409, "LIMITE_EXCEDIDO", "payments"), `${e30.status} ${j(e30.corpo)}`);
  const e20 = await vendaRota(A, ce, 20);
  check("fiado de 20 cabe (100 + 20 = 120): 201", e20.status === 201, `${e20.status} ${j(e20.corpo)}`);

  console.log("  (h) receber a parcela, a mais antiga primeiro");
  const cr = await cliente(A, "Acordo receber");
  const fr = await fiado(A, cr, 100, 10);
  const rr = await acordar(A.tok.fin, cr, [fr.entry.id], partes(10000, 2, 5));
  check("(fixture) acordo de 100 em 2 parcelas de 50: 201", rr.status === 201, `${rr.status} ${j(rr.corpo)}`);
  const r20 = await receber(A, cr, 20);
  check("receber 20 pelo caminho do fiado (Pix na conta): 201", r20.status === 201, `${r20.status} ${j(r20.corpo)}`);
  const a20 = (await listarAcordos(A.tok.fin, cr)).corpo?.data?.[0] as Dado;
  check("a parcela 1 fica com 20 pagos e 30 em aberto, a 2 intocada",
    perto(a20?.installments?.[0]?.paid, 20) && perto(a20?.installments?.[0]?.open, 30) && perto(a20?.installments?.[1]?.paid, 0), j(a20?.installments));
  const r40 = await receber(A, cr, 40);
  check("receber mais 40: 201", r40.status === 201, `${r40.status} ${j(r40.corpo)}`);
  const a60 = (await listarAcordos(A.tok.fin, cr)).corpo?.data?.[0] as Dado;
  check("a parcela 1 quita (status paga) e a 2 recebe 10 (aberto 40)",
    a60?.installments?.[0]?.status === "paga" && perto(a60?.installments?.[0]?.open, 0) && perto(a60?.installments?.[1]?.paid, 10) && perto(a60?.installments?.[1]?.open, 40) && perto(a60?.open_total, 40), j(a60));
  const movs = (await A.db.cashMovement.findMany({ where: { bank_account_id: A.conta, direction: "entrada", origin: "recebimento_fiado" } })) as Dado[];
  check("o movimento do recebimento de parcela nasce sem venda (sale_id nulo)", movs.some((m) => perto(n(m.amount), 20) && m.sale_id === null), j(movs.map((m) => [m.amount, m.sale_id])));
  check("o Histórico grava fiado.receber", (await prisma.emporioAuditLog.count({ where: { tenant_id: A.tenantId, action: "fiado.receber" } })) >= 2);
  const totalCredito = (await credito(A.tok.owner, cr)).corpo?.data as Dado;
  check("o devido do cliente cai para 40 (a soma do que falta nas parcelas)", perto(totalCredito?.owed_total, 40), j(totalCredito));

  console.log("  (i) a origem com recebimento parcial entra pelo aberto");
  const cp = await cliente(A, "Acordo parcial");
  const fp = await fiado(A, cp, 100, 10);
  const r30 = await receber(A, cp, 30);
  check("(fixture) recebe 30 do fiado de 100: 201", r30.status === 201, `${r30.status} ${j(r30.corpo)}`);
  const total100 = await acordar(A.tok.fin, cp, [fp.entry.id], partes(10000, 2, 5));
  check("parcelas de 100 sobre uma origem com 70 em aberto: 422 PARCELAS_NAO_BATEM no campo installments", erro(total100, 422, "PARCELAS_NAO_BATEM", "installments"), `${total100.status} ${j(total100.corpo)}`);
  check("a recusa não gravou acordo", (await (prisma as Dado).emporioCreditAgreement.count({ where: { customer_id: cp.id } })) === 0);
  const total70 = await acordar(A.tok.fin, cp, [fp.entry.id], partes(7000, 2, 5));
  check("parcelas de 70: 201 com total 70", total70.status === 201 && perto(total70.corpo?.data?.total, 70), `${total70.status} ${j(total70.corpo)}`);
  const ps70 = await parcelasDe(total70.corpo?.data?.id);
  check("as parcelas gravadas somam 70, não 100", perto(ps70.reduce((s, e) => s + n(e.amount), 0), 70), j(ps70.map((e) => e.amount)));
  const cr70 = (await credito(A.tok.owner, cp)).corpo?.data as Dado;
  check("o devido do cliente segue 70", perto(cr70?.owed_total, 70), j(cr70));

  console.log("  (j) as recusas do acordo");
  const ci = await cliente(A, "Acordo recusas");
  const fi = await fiado(A, ci, 90, 10);
  const fOutro = await fiado(A, await cliente(A, "Acordo outro cliente"), 40, 10);
  const nova = (r: Resp) => erro(r, 422, undefined, "installments");
  const rSoma = await acordar(A.tok.fin, ci, [fi.entry.id], partes(8000, 2, 5));
  check("soma das parcelas diferente do aberto: 422 PARCELAS_NAO_BATEM no campo installments", erro(rSoma, 422, "PARCELAS_NAO_BATEM", "installments"), `${rSoma.status} ${j(rSoma.corpo)}`);
  const rZero = await acordar(A.tok.fin, ci, [fi.entry.id], [{ due_date: emDias(5), amount: 0 }, { due_date: emDias(35), amount: 90 }]);
  check("parcela de valor zero: 422 no campo installments", nova(rZero), `${rZero.status} ${j(rZero.corpo)}`);
  const rPassado = await acordar(A.tok.fin, ci, [fi.entry.id], [{ due_date: emDias(-1), amount: 45 }, { due_date: emDias(30), amount: 45 }]);
  check("parcela com data antes de hoje: 422 no campo installments", nova(rPassado), `${rPassado.status} ${j(rPassado.corpo)}`);
  const rOrdem = await acordar(A.tok.fin, ci, [fi.entry.id], [{ due_date: emDias(35), amount: 45 }, { due_date: emDias(5), amount: 45 }]);
  check("datas fora de ordem: 422 no campo installments", nova(rOrdem), `${rOrdem.status} ${j(rOrdem.corpo)}`);
  const r49 = await acordar(A.tok.fin, ci, [fi.entry.id], Array.from({ length: 49 }, (_, i) => ({ due_date: emDias(5 + i), amount: 1 })));
  check("49 parcelas: 422 no campo installments", nova(r49), `${r49.status} ${j(r49.corpo)}`);
  const rVazio = await acordar(A.tok.fin, ci, [], partes(9000, 2, 5));
  check("sem nenhuma origem: 422 no campo entry_ids", erro(rVazio, 422, undefined, "entry_ids"), `${rVazio.status} ${j(rVazio.corpo)}`);
  const rInex = await acordar(A.tok.fin, ci, ["nao-existe"], partes(9000, 2, 5));
  check("origem inexistente: 422 ACORDO_SEM_ORIGEM no campo entry_ids", erro(rInex, 422, "ACORDO_SEM_ORIGEM", "entry_ids"), `${rInex.status} ${j(rInex.corpo)}`);
  const rAlheia = await acordar(A.tok.fin, ci, [fOutro.entry.id], partes(4000, 2, 5));
  check("origem de outro cliente: 422 ACORDO_SEM_ORIGEM no campo entry_ids", erro(rAlheia, 422, "ACORDO_SEM_ORIGEM", "entry_ids"), `${rAlheia.status} ${j(rAlheia.corpo)}`);
  const rJa = await acordar(A.tok.fin, c1, [f1.entry.id], partes(3000, 2, 5));
  check("origem que já entrou em acordo: 422 ACORDO_SEM_ORIGEM no campo entry_ids", erro(rJa, 422, "ACORDO_SEM_ORIGEM", "entry_ids"), `${rJa.status} ${j(rJa.corpo)}`);
  check("nenhuma das recusas gravou acordo", (await (prisma as Dado).emporioCreditAgreement.count({ where: { customer_id: ci.id } })) === 0
    && (await A.db.financialEntry.findFirst({ where: { id: fi.entry.id } })).status === "pending");

  console.log("  (k) dois toques no mesmo acordo");
  const cc = await cliente(A, "Acordo toque duplo");
  const fc = await fiado(A, cc, 60, 10);
  const [t1, t2] = await Promise.all([
    acordar(A.tok.fin, cc, [fc.entry.id], partes(6000, 2, 5)),
    acordar(A.tok.owner, cc, [fc.entry.id], partes(6000, 3, 5)),
  ]);
  check("um 201 e um 422, nenhuma resposta 5xx", [t1.status, t2.status].sort().join() === "201,422", `${t1.status} ${t2.status} ${j(t1.corpo)} ${j(t2.corpo)}`);
  check("existe exatamente um acordo para o cliente", (await (prisma as Dado).emporioCreditAgreement.count({ where: { customer_id: cc.id } })) === 1);

  console.log("  (l) devolução com abatimento cai na parcela mais antiga");
  const cdv = await cliente(A, "Acordo devolucao");
  const fdv = await fiado(A, cdv, 50, 10);
  const rdv = await acordar(A.tok.fin, cdv, [fdv.entry.id], partes(5000, 2, 5));
  check("(fixture) acordo de 50 em 2 parcelas de 25: 201", rdv.status === 201, `${rdv.status} ${j(rdv.corpo)}`);
  const itemDev = (await A.db.emporioSaleItem.findFirst({ where: { sale_id: fdv.vendaId } })) as Dado;
  const devolver = (qty: number) =>
    chamar(A.tok.owner, R.saleReturn, "POST", `emporio/sales/${fdv.vendaId}/return`,
      { operation_key: chave("dev"), refund_kind: "abater_fiado", items: [{ sale_item_id: itemDev?.id, quantity: qty }] }, fdv.vendaId);
  const dv1 = await devolver(2);
  check("devolver 2 kg (R$ 20) abatendo o fiado: sucesso", ok2xx(dv1), `${dv1.status} ${j(dv1.corpo)}`);
  const adv = (await listarAcordos(A.tok.fin, cdv)).corpo?.data?.[0] as Dado;
  check("o abatimento reduz a parcela mais antiga (25 vira 5) e a 2 fica intacta", perto(adv?.installments?.[0]?.open, 5) && perto(adv?.installments?.[1]?.open, 25), j(adv?.installments));
  check("o aberto do acordo é 30 e o total combinado segue 50", perto(adv?.open_total, 30) && perto(adv?.total, 50), j(adv));
  const rec25 = await receber(A, cdv, 25);
  check("(fixture) receber 25: 201", rec25.status === 201, `${rec25.status} ${j(rec25.corpo)}`);
  const dv2 = await devolver(1);
  check("devolver 1 kg (R$ 10) com só R$ 5 em aberto no acordo: 422 no campo amount (devolva em dinheiro)", erro(dv2, 422, undefined, "amount"), `${dv2.status} ${j(dv2.corpo)}`);

  console.log("  (m) cancelar a venda que entrou em acordo");
  const canc = await chamar(A.tok.owner, R.saleCancel, "POST", `emporio/sales/${f1.vendaId}/cancel`, { reason: "M100 teste" }, f1.vendaId);
  check("cancelar a venda do acordo: 409 VENDA_EM_ACORDO no campo sale_id", erro(canc, 409, "VENDA_EM_ACORDO", "sale_id"), `${canc.status} ${j(canc.corpo)}`);
  check("a mensagem manda desfazer o acordo antes", /acordo/i.test(String(canc.corpo?.error?.message)), String(canc.corpo?.error?.message));
  const aindaLa = (await A.db.financialEntry.findFirst({ where: { id: f1.entry.id } })) as Dado;
  check("a recusa não mexeu na origem (continua em acordo)", aindaLa?.agreement_id === ac?.id && aindaLa?.status === "cancelled");

  console.log("  (n) devolução em dinheiro de venda em acordo: conta o que foi pago nas parcelas");
  const cn = await cliente(A, "Acordo devolucao dinheiro");
  const fn1 = await fiado(A, cn, 100, 10);
  const rn = await acordar(A.tok.fin, cn, [fn1.entry.id], partes(10000, 1, 5));
  check("(fixture) acordo de 100 em 1 parcela: 201", rn.status === 201, `${rn.status} ${j(rn.corpo)}`);
  const itemN = (await A.db.emporioSaleItem.findFirst({ where: { sale_id: fn1.vendaId } })) as Dado;
  const devDinheiro = (qty: number) =>
    chamar(A.tok.owner, R.saleReturn, "POST", `emporio/sales/${fn1.vendaId}/return`,
      { operation_key: chave("devn"), refund_kind: "dinheiro", cash_register_id: A.reg, items: [{ sale_item_id: itemN?.id, quantity: qty }] }, fn1.vendaId);
  const dnAntes = await devDinheiro(3);
  check("antes de a parcela ser paga, devolver R$ 30 em dinheiro é recusado: 422", dnAntes.status === 422, `${dnAntes.status} ${j(dnAntes.corpo)}`);
  const recN = await receber(A, cn, 100);
  check("(fixture) a parcela é recebida inteira: 201", recN.status === 201, `${recN.status} ${j(recN.corpo)}`);
  const dnDepois = await devDinheiro(3);
  check("depois de paga a parcela, devolver R$ 30 em dinheiro é aceito", ok2xx(dnDepois), `${dnDepois.status} ${j(dnDepois.corpo)}`);

  console.log("  (o) cheque devolvido de origem absorvida pelo acordo");
  const co = await cliente(A, "Acordo cheque devolvido");
  const numCheque = `M100-${stamp}`;
  const vo = await vender(A, co, 10, [
    { kind: "cheque", amount: 40, check: { number: numCheque, bank: "Banco M100", good_for: meioDia(emDias(10)) } },
    { kind: "fiado", amount: 60, due_date: meioDia(emDias(10)) },
  ]);
  const eo = (await A.db.financialEntry.findFirst({ where: { emporio_customer_id: co.id, entry_type: "income", status: "pending" } })) as Dado;
  check("(fixture) a venda tem uma conta a receber de 100, com 40 já pagos em cheque (60 em aberto)", !!eo?.id && perto(n(eo.amount), 100), j(eo));
  const ro = await acordar(A.tok.fin, co, [eo?.id], partes(6000, 1, 10));
  check("(fixture) acordo de 60 em 1 parcela: 201", ro.status === 201, `${ro.status} ${j(ro.corpo)}`);
  const chequeO = (await A.db.emporioCheck.findFirst({ where: { number: numCheque } })) as Dado;
  const volta = await chamar(A.tok.owner, R.checkReturn, "POST", `emporio/checks/${chequeO?.id}/return`, { reason: "M100 sem fundos" }, chequeO?.id);
  check("o cheque volta: 2xx", ok2xx(volta), `${volta.status} ${j(volta.corpo)} venda ${vo}`);
  const credO = (await credito(A.tok.owner, co)).corpo?.data as Dado;
  check("o cliente deve 100 (a dívida do cheque não some)", perto(credO?.owed_total, 100), j(credO));
  const acO = (await listarAcordos(A.tok.fin, co)).corpo?.data?.[0] as Dado;
  const pO = (acO?.installments ?? []) as Dado[];
  check("o acordo lista 2 parcelas: a regular de 60 e a extra de 40 vencendo hoje",
    pO.length === 2 && pO.some((p) => perto(n(p.amount), 60)) && pO.some((p) => perto(n(p.amount), 40) && diaDe(p.due_date) === hojeStr), j(pO));
  check("a origem continua cancelled", (await A.db.financialEntry.findFirst({ where: { id: eo?.id } })).status === "cancelled");

  console.log("  (p) receber sem entry_id segue a ordem de vencimento");
  const cq = await cliente(A, "Acordo fila vencimento");
  const fq1 = await fiado(A, cq, 50, 10);
  const rq = await acordar(A.tok.fin, cq, [fq1.entry.id], partes(5000, 1, 30));
  check("(fixture) acordo de 50 em 1 parcela vencendo em 30 dias: 201", rq.status === 201, `${rq.status} ${j(rq.corpo)}`);
  const fq2 = await fiado(A, cq, 40, 5);
  const rc10 = await receber(A, cq, 10);
  check("receber 10 sem entry_id: 201", rc10.status === 201, `${rc10.status} ${j(rc10.corpo)}`);
  const pagoFiado = (await A.db.financialPayment.findMany({ where: { entry_id: fq2.entry.id } })) as Dado[];
  check("os 10 vão ao fiado da venda posterior (vence antes)", perto(pagoFiado.reduce((s, x) => s + n(x.amount), 0), 10), j(pagoFiado.map((x) => x.amount)));
  const aq = (await listarAcordos(A.tok.fin, cq)).corpo?.data?.[0] as Dado;
  check("a parcela do acordo segue intocada", perto(aq?.installments?.[0]?.paid, 0) && perto(aq?.installments?.[0]?.open, 50), j(aq?.installments));

  console.log("  (v) a devolução em dinheiro não devolve duas vezes o que o acordo pagou");
  const cvv = await cliente(A, "Acordo duas vendas");
  const fv1 = await fiado(A, cvv, 100, 10);
  const fv2 = await fiado(A, cvv, 100, 10);
  const rvv = await acordar(A.tok.fin, cvv, [fv1.entry.id, fv2.entry.id], partes(20000, 2, 5));
  check("(fixture) acordo de 200 em 2 parcelas de 100: 201", rvv.status === 201, `${rvv.status} ${j(rvv.corpo)}`);
  const recV = await receber(A, cvv, 100);
  check("(fixture) o cliente paga a parcela 1 (100): 201", recV.status === 201, `${recV.status} ${j(recV.corpo)}`);
  const devV = async (vendaId: string, kind: "dinheiro" | "abater_fiado") => {
    const it = (await A.db.emporioSaleItem.findFirst({ where: { sale_id: vendaId } })) as Dado;
    return chamar(A.tok.owner, R.saleReturn, "POST", `emporio/sales/${vendaId}/return`,
      { operation_key: chave("devv"), refund_kind: kind, ...(kind === "dinheiro" ? { cash_register_id: A.reg } : {}), items: [{ sale_item_id: it?.id, quantity: 10 }] }, vendaId);
  };
  const dv1v = await devV(fv1.vendaId, "dinheiro");
  check("devolução em dinheiro da venda 1 (100): aceita", ok2xx(dv1v), `${dv1v.status} ${j(dv1v.corpo)}`);
  const dv2v = await devV(fv2.vendaId, "dinheiro");
  check("devolução em dinheiro da venda 2 (100): 422, o que o cliente pagou no acordo já voltou", dv2v.status === 422, `${dv2v.status} ${j(dv2v.corpo)}`);
  const dv2a = await devV(fv2.vendaId, "abater_fiado");
  check("a devolução da venda 2 abatendo o fiado: aceita", ok2xx(dv2a), `${dv2a.status} ${j(dv2a.corpo)}`);
  const acV = (await listarAcordos(A.tok.fin, cvv)).corpo?.data?.[0] as Dado;
  const p2V = (acV?.installments ?? [])[1] as Dado;
  check("a parcela 2 passa a status abatida, sem pago nem aberto", p2V?.status === "abatida" && perto(p2V?.paid, 0) && perto(p2V?.open, 0), j(acV?.installments));
  check("o acordo não tem nada em aberto", perto(acV?.open_total, 0), j(acV));
}

// ---------------------------------------------------------------------------
// Seção 3: a alçada
// ---------------------------------------------------------------------------

let nDesp = 0;
/** Despesa avulsa de `valor` reais: a primeira conta pendente de uma despesa fixa de categoria única. */
async function despesa(w: Mundo, valor: number): Promise<Dado> {
  const Dd = await import("@/lib/actions/emporio-despesas");
  const categoria = `M100 Despesa ${stamp} ${(nDesp += 1)}`;
  const r = await Dd.criarDespesaFixaAction(w.db, w.owner, {
    name: categoria, category: categoria, amount: valor, due_day: 28, split_kind: "percentual",
    starts_on: meioDia(`${hojeStr.slice(0, 7)}-01`), splits: [{ establishment_id: w.L1, value: 100 }],
  } as Dado);
  if (!r.ok) throw new Error(`despesa fixa: ${j(r)}`);
  const e = await w.db.financialEntry.findFirst({ where: { category: categoria, status: "pending" }, orderBy: { due_date: "asc" } });
  if (!e) throw new Error("a despesa não gerou conta pendente");
  return e as Dado;
}

async function secao3() {
  console.log("\nSeção 3: a alçada de pagamento");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");
  const pagar = (tok: string, ids: string[], de?: string) =>
    chamar(tok, R.payablesPay, "POST", "emporio/payables/pay", { entry_ids: ids, from: { bank_account_id: de ?? A.conta } });
  const efeitos = async (entryId: string) => {
    const pgs = (await A.db.financialPayment.findMany({ where: { entry_id: entryId } })) as Dado[];
    const movs = pgs.length ? await A.db.cashMovement.count({ where: { financial_payment_id: { in: pgs.map((p) => p.id) } } }) : 0;
    return { pagamentos: pgs.length, movimentos: movs };
  };
  const status = async (entryId: string) => ((await A.db.financialEntry.findFirst({ where: { id: entryId } })) as Dado)?.status;
  const aprovar = (tok: string, id: string) => chamar(tok, R.approve, "POST", `emporio/finance/payment-requests/${id}/approve`, {}, id);
  const recusar = (tok: string, id: string, corpo: Dado) => chamar(tok, R.reject, "POST", `emporio/finance/payment-requests/${id}/reject`, corpo, id);
  const pedidoDb = async (id: string) => (await (prisma as Dado).emporioPaymentRequest.findUnique({ where: { id: String(id ?? "x") } })) as Dado;
  const histAcao = async (action: string) => (await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action } })) as Dado[];
  await config(A);

  console.log("  (a) sem teto, paga direto");
  const e0 = await despesa(A, 60);
  const g0 = (await chamar(A.tok.owner, R.settings, "GET", "emporio/settings")).corpo?.data as Dado;
  check("(fixture) as configurações começam sem teto: payment_approval_limit nulo", g0?.payment_approval_limit === null, j(g0));
  const p0 = await pagar(A.tok.fin, [e0.id]);
  check("Financeiro paga direto, sem alçada: 201 e a conta fecha", p0.status === 201 && p0.corpo?.data?.waiting_approval !== true && (await status(e0.id)) === "paid", `${p0.status} ${j(p0.corpo)}`);

  console.log("  (b) o teto: quem define");
  const sFin = await chamar(A.tok.fin, R.approval, "PATCH", "emporio/settings/approval", { payment_approval_limit: 100 });
  check("o Financeiro não define o teto: 403", sFin.status === 403, `${sFin.status} ${j(sFin.corpo)}`);
  const sGg = await chamar(A.tok.gestor, R.approval, "PATCH", "emporio/settings/approval", { payment_approval_limit: 100 });
  check("o Gestor da loja também não: 403", sGg.status === 403, `${sGg.status}`);
  const sZero = await chamar(A.tok.owner, R.approval, "PATCH", "emporio/settings/approval", { payment_approval_limit: 0 });
  check("teto zero: 422 no campo payment_approval_limit (o mínimo é 0,01)", erro(sZero, 422, undefined, "payment_approval_limit"), `${sZero.status} ${j(sZero.corpo)}`);
  const sAlto = await chamar(A.tok.owner, R.approval, "PATCH", "emporio/settings/approval", { payment_approval_limit: 100000000 });
  check("teto de 100 milhões: 422 no campo payment_approval_limit", erro(sAlto, 422, undefined, "payment_approval_limit"), `${sAlto.status} ${j(sAlto.corpo)}`);
  const sOk = await chamar(A.tok.owner, R.approval, "PATCH", "emporio/settings/approval", { payment_approval_limit: 100 });
  check("o Dono define o teto de 100: 200", sOk.status === 200, `${sOk.status} ${j(sOk.corpo)}`);
  const g1 = (await chamar(A.tok.owner, R.settings, "GET", "emporio/settings")).corpo?.data as Dado;
  check("o GET das configurações traz payment_approval_limit 100", perto(g1?.payment_approval_limit, 100), j(g1));
  const hEd = await histAcao("configuracoes.editar");
  check("o Histórico grava 'Teto sem aprovação' na edição", hEd.some((h) => j(h.changes ?? "").includes("Teto sem aprovação")), j(hEd.map((h) => h.changes)));
  const antesAprov = (await prisma.emporioAuditLog.count({ where: { tenant_id: A.tenantId, action: "pagamento.pedir" } }));
  check("(nada de pedido nasceu até aqui)", antesAprov === 0, String(antesAprov));

  console.log("  (c) acima do teto, quem não é da conta vira pedido");
  const eDentro = await despesa(A, 80);
  const pDentro = await pagar(A.tok.fin, [eDentro.id]);
  check("Financeiro paga 80 (dentro do teto de 100) direto: 201", pDentro.status === 201 && pDentro.corpo?.data?.waiting_approval !== true && (await status(eDentro.id)) === "paid", `${pDentro.status} ${j(pDentro.corpo)}`);
  const e2 = await despesa(A, 150);
  const pFora = await pagar(A.tok.fin, [e2.id]);
  const pedido = pFora.corpo?.data?.request as Dado;
  check("Financeiro paga 150 (acima do teto): vira pedido, waiting_approval verdadeiro", ok2xx(pFora) && pFora.corpo?.data?.waiting_approval === true && !!pedido?.id, `${pFora.status} ${j(pFora.corpo)}`);
  check("o pedido nasce pendente, de 150, com o Financeiro como solicitante e a conta como origem",
    pedido?.status === "pendente" && perto(pedido?.total, 150) && pedido?.requested_by?.name === "M100 fin" && pedido?.from?.kind === "conta" && pedido?.from?.id === A.conta, j(pedido));
  check("o pedido traz a conta a pagar", Array.isArray(pedido?.entries) && pedido.entries.length === 1 && pedido.entries[0].entry_id === e2.id && perto(pedido.entries[0].amount, 150), j(pedido?.entries));
  const ef2 = await efeitos(e2.id);
  check("nenhum FinancialPayment nem CashMovement nasceu, e a conta segue pending", ef2.pagamentos === 0 && ef2.movimentos === 0 && (await status(e2.id)) === "pending", j(ef2));
  const pDb = await pedidoDb(pedido?.id);
  check("o registro tem status pendente, a conta e a lista de contas", pDb?.status === "pendente" && pDb?.bank_account_id === A.conta && j(pDb?.entry_ids) === j([e2.id]) && pDb?.requested_by_user_id === A.fin.id, j(pDb));
  const hPed = await histAcao("pagamento.pedir");
  check("o Histórico grava pagamento.pedir com o valor no resumo", hPed.length === 1 && hPed[0].target_type === "pedido_pagamento" && /150,00/.test(String(hPed[0].summary)), j(hPed.map((h) => [h.target_type, h.summary])));
  const e3 = await despesa(A, 150);
  const pDono = await pagar(A.tok.owner, [e3.id]);
  check("o Dono acima do teto paga direto: 201 e a conta fecha", pDono.status === 201 && pDono.corpo?.data?.waiting_approval !== true && (await status(e3.id)) === "paid", `${pDono.status} ${j(pDono.corpo)}`);

  console.log("  (d) a lista e o bloco do Hoje");
  const lista = await chamar(A.tok.fin, R.requests, "GET", "emporio/finance/payment-requests?status=pendente");
  check("o Financeiro lê os pedidos pendentes: 200 com o pedido", lista.status === 200 && Array.isArray(lista.corpo?.data) && lista.corpo.data.some((x: Dado) => x.id === pedido?.id), `${lista.status} ${j(lista.corpo)}`);
  const listaV = await chamar(A.tok.vend, R.requests, "GET", "emporio/finance/payment-requests");
  check("o Vendedor não lê os pedidos: 403", listaV.status === 403, `${listaV.status}`);
  const hj = (await chamar(A.tok.fin, R.today, "GET", "emporio/finance/today")).corpo?.data as Dado;
  check("o Hoje traz pending_approvals com 1 pedido de 150", hj?.pending_approvals?.count === 1 && perto(hj?.pending_approvals?.total, 150), j(hj?.pending_approvals));

  console.log("  (e) um pedido pendente trava a conta nos quatro caminhos");
  const trava = (r: Resp) => r.status === 409 && r.corpo?.error?.code === "CONTA_EM_APROVACAO";
  const tPagaDono = await pagar(A.tok.owner, [e2.id]);
  check("pagar sem alçada (Dono): 409 CONTA_EM_APROVACAO no campo entry_ids", erro(tPagaDono, 409, "CONTA_EM_APROVACAO", "entry_ids"), `${tPagaDono.status} ${j(tPagaDono.corpo)}`);
  const tPagaFin = await pagar(A.tok.fin, [e2.id]);
  check("pagar com alçada (Financeiro, de novo): 409 CONTA_EM_APROVACAO", trava(tPagaFin), `${tPagaFin.status} ${j(tPagaFin.corpo)}`);
  check("o segundo pedido não nasceu", (await (prisma as Dado).emporioPaymentRequest.count({ where: { tenant_id: A.tenantId, status: "pendente" } })) === 1);
  const tCancel = await chamar(A.tok.owner, R.payableCancel, "POST", `emporio/payables/${e2.id}/cancel`, { reason: "M100 teste" }, e2.id);
  check("cancelar a conta: 409 CONTA_EM_APROVACAO", trava(tCancel), `${tCancel.status} ${j(tCancel.corpo)}`);
  const tAdia = await chamar(A.tok.owner, R.payableDue, "PATCH", `emporio/payables/${e2.id}/due-date`, { due_date: `${emDias(10)}T12:00:00Z` }, e2.id);
  check("adiar o vencimento: 409 CONTA_EM_APROVACAO", trava(tAdia), `${tAdia.status} ${j(tAdia.corpo)}`);
  const tCorrige = await chamar(A.tok.owner, R.payable, "PATCH", `emporio/payables/${e2.id}`, { amount: 99 }, e2.id);
  check("corrigir o valor: 409 CONTA_EM_APROVACAO", trava(tCorrige), `${tCorrige.status} ${j(tCorrige.corpo)}`);
  const eLida = (await A.db.financialEntry.findFirst({ where: { id: e2.id } })) as Dado;
  check("nenhuma das quatro recusas mexeu na conta (pending, 150, mesmo vencimento)", eLida.status === "pending" && perto(n(eLida.amount), 150) && diaDe(eLida.due_date) === diaDe(e2.due_date), j(eLida));

  console.log("  (f) quem aprova");
  const aFin = await aprovar(A.tok.fin, pedido?.id);
  check("o Financeiro não aprova o próprio pedido: 403", aFin.status === 403, `${aFin.status} ${j(aFin.corpo)}`);
  const rFin = await recusar(A.tok.fin, pedido?.id, { reason: "Não quero esta conta" });
  check("o Financeiro não recusa: 403", rFin.status === 403, `${rFin.status}`);
  check("os 403 não mudaram o pedido", (await pedidoDb(pedido?.id))?.status === "pendente");
  const aInex = await aprovar(A.tok.owner, "nao-existe");
  check("aprovar pedido que não existe: 404", aInex.status === 404, `${aInex.status} ${j(aInex.corpo)}`);

  console.log("  (g) aprovar paga");
  const aDono = await aprovar(A.tok.owner, pedido?.id);
  check("o Dono aprova: 200 com o pedido aprovado", aDono.status === 200 && aDono.corpo?.data?.status === "aprovado", `${aDono.status} ${j(aDono.corpo)}`);
  const efAp = await efeitos(e2.id);
  check("nasce o pagamento e o movimento, e a conta fecha", efAp.pagamentos === 1 && efAp.movimentos === 1 && (await status(e2.id)) === "paid", j(efAp));
  const pgAp = (await A.db.financialPayment.findFirst({ where: { entry_id: e2.id } })) as Dado;
  const mvAp = (await A.db.cashMovement.findFirst({ where: { financial_payment_id: pgAp?.id } })) as Dado;
  check("o movimento é uma saída de 150 da conta bancária", mvAp?.direction === "saida" && perto(n(mvAp?.amount), 150) && mvAp?.bank_account_id === A.conta, j(mvAp));
  const dAp = await pedidoDb(pedido?.id);
  check("o pedido guarda quem decidiu (o Dono) e quando", dAp?.status === "aprovado" && dAp?.decided_by_user_id === A.owner.id && !!dAp?.decided_at, j(dAp));
  check("o Histórico grava pagamento.aprovar", (await histAcao("pagamento.aprovar")).length === 1);
  check("e o despesa.pagar da conta paga", (await histAcao("despesa.pagar")).some((h) => h.target_id === e2.id));
  const ap2 = await aprovar(A.tok.owner, pedido?.id);
  check("aprovar de novo: 409 PEDIDO_NAO_PENDENTE", erro(ap2, 409, "PEDIDO_NAO_PENDENTE"), `${ap2.status} ${j(ap2.corpo)}`);
  const rj2 = await recusar(A.tok.owner, pedido?.id, { reason: "Tarde demais" });
  check("recusar um pedido já decidido: 409 PEDIDO_NAO_PENDENTE", erro(rj2, 409, "PEDIDO_NAO_PENDENTE"), `${rj2.status} ${j(rj2.corpo)}`);
  check("e a conta não foi paga duas vezes", (await efeitos(e2.id)).pagamentos === 1);

  console.log("  (h) aprovar sem saldo falha e mantém o pedido");
  const e4 = await despesa(A, 150);
  const p4 = await pagar(A.tok.fin, [e4.id]);
  const ped4 = p4.corpo?.data?.request as Dado;
  check("(fixture) o Financeiro pede aprovação de 150: pedido pendente", ok2xx(p4) && !!ped4?.id && ped4?.status === "pendente", `${p4.status} ${j(p4.corpo)}`);
  // o pedido guarda a conta de onde sai o dinheiro: aponta para a conta sem saldo inicial
  if (ped4?.id) await (prisma as Dado).emporioPaymentRequest.update({ where: { id: ped4.id }, data: { bank_account_id: A.contaVazia } });
  const movAntes = await A.db.cashMovement.count();
  const a4 = await aprovar(A.tok.owner, ped4?.id);
  check("aprovar sem saldo na conta: 409 INSUFFICIENT_CASH no campo from", erro(a4, 409, "INSUFFICIENT_CASH", "from"), `${a4.status} ${j(a4.corpo)}`);
  const d4 = await pedidoDb(ped4?.id);
  check("o pedido continua pendente e guarda o motivo da falha (last_failure)", d4?.status === "pendente" && typeof d4?.last_failure === "string" && d4.last_failure.length > 0, j(d4));
  const ef4 = await efeitos(e4.id);
  check("nada foi pago e nenhum movimento nasceu", ef4.pagamentos === 0 && ef4.movimentos === 0 && (await status(e4.id)) === "pending" && (await A.db.cashMovement.count()) === movAntes, j(ef4));
  const l4 = await chamar(A.tok.owner, R.requests, "GET", "emporio/finance/payment-requests?status=pendente");
  check("a lista mostra o last_failure do pedido", (l4.corpo?.data ?? []).some((x: Dado) => x.id === ped4?.id && typeof x.last_failure === "string" && x.last_failure.length > 0), j(l4.corpo));
  X.pedidoId = String(ped4?.id ?? "");
  X.entryPedido = String(e4.id);

  console.log("  (i) recusar exige motivo e libera a conta");
  const e5 = await despesa(A, 150);
  const p5 = await pagar(A.tok.fin, [e5.id]);
  const ped5 = p5.corpo?.data?.request as Dado;
  check("(fixture) novo pedido pendente: 200 ou 201", ok2xx(p5) && !!ped5?.id, `${p5.status} ${j(p5.corpo)}`);
  const rSem = await recusar(A.tok.owner, ped5?.id, { reason: "" });
  check("recusar sem motivo: 422 no campo reason", erro(rSem, 422, undefined, "reason"), `${rSem.status} ${j(rSem.corpo)}`);
  const rCurto = await recusar(A.tok.owner, ped5?.id, { reason: "ab" });
  check("recusar com 2 caracteres: 422 no campo reason (o mínimo é 3)", erro(rCurto, 422, undefined, "reason"), `${rCurto.status} ${j(rCurto.corpo)}`);
  check("as recusas de motivo não decidiram o pedido", (await pedidoDb(ped5?.id))?.status === "pendente");
  const rLongo = await recusar(A.tok.owner, ped5?.id, { reason: "x".repeat(301) });
  check("motivo de 301 caracteres: 422 no campo reason (o máximo é 300)", erro(rLongo, 422, undefined, "reason"), `${rLongo.status} ${j(rLongo.corpo)}`);
  const rOk = await recusar(A.tok.owner, ped5?.id, { reason: "Fornecedor já recebeu fora" });
  check("recusar com motivo: 200 com o pedido recusado", rOk.status === 200 && rOk.corpo?.data?.status === "recusado", `${rOk.status} ${j(rOk.corpo)}`);
  const d5 = await pedidoDb(ped5?.id);
  check("o pedido guarda o motivo, o decisor e a data", d5?.status === "recusado" && d5?.reason === "Fornecedor já recebeu fora" && d5?.decided_by_user_id === A.owner.id && !!d5?.decided_at, j(d5));
  const ef5 = await efeitos(e5.id);
  check("a conta segue pendente e sem pagamento", (await status(e5.id)) === "pending" && ef5.pagamentos === 0 && ef5.movimentos === 0, j(ef5));
  check("o Histórico grava pagamento.recusar", (await histAcao("pagamento.recusar")).length === 1);
  const libera = await chamar(A.tok.owner, R.payableDue, "PATCH", `emporio/payables/${e5.id}/due-date`, { due_date: `${emDias(10)}T12:00:00Z` }, e5.id);
  check("depois da recusa a conta sai da trava (adiar o vencimento: 200)", libera.status === 200, `${libera.status} ${j(libera.corpo)}`);

  console.log("  (j) o bloco do Hoje depois das decisões");
  const hj2 = (await chamar(A.tok.fin, R.today, "GET", "emporio/finance/today")).corpo?.data as Dado;
  check("só o pedido sem saldo segue pendente: 1 pedido de 150", hj2?.pending_approvals?.count === 1 && perto(hj2?.pending_approvals?.total, 150), j(hj2?.pending_approvals));

  console.log("  (k) dois approve simultâneos");
  const e6 = await despesa(A, 150);
  const p6 = await pagar(A.tok.fin, [e6.id]);
  const ped6 = p6.corpo?.data?.request as Dado;
  check("(fixture) pedido pendente de 150", ok2xx(p6) && !!ped6?.id, `${p6.status} ${j(p6.corpo)}`);
  const [d1, d2] = await Promise.all([aprovar(A.tok.owner, ped6?.id), aprovar(A.tok.owner, ped6?.id)]);
  const ss = [d1, d2].sort((a, b) => a.status - b.status);
  check("exatamente um 200 e um 409 PEDIDO_NAO_PENDENTE", ss[0].status === 200 && erro(ss[1], 409, "PEDIDO_NAO_PENDENTE"), `${d1.status} ${j(d1.corpo)} | ${d2.status} ${j(d2.corpo)}`);
  const ef6 = await efeitos(e6.id);
  check("só um pagamento e um movimento nascem, e a conta fica paid", ef6.pagamentos === 1 && ef6.movimentos === 1 && (await status(e6.id)) === "paid", j(ef6));

  console.log("  (r) a conta de uma compra a prazo com pedido pendente não se cancela pela compra");
  const rotaCompra = () => import("@/app/api/v1/emporio/purchases/route");
  const rotaCompraCancel = () => import("@/app/api/v1/emporio/purchases/[id]/cancel/route");
  const rCompra = await chamar(A.tok.owner, rotaCompra, "POST", "emporio/purchases", {
    operation_key: chave("compra"), establishment_id: A.L1, purchased_at: new Date().toISOString(), received: false,
    items: [{ emporio_product_id: A.prodId, presentation_id: A.presId, quantity: 1, item_total: 150 }],
    payment: { kind: "a_prazo", due_date: `${emDias(5)}T12:00:00Z` },
  });
  const compraId = String(rCompra.corpo?.data?.id ?? "");
  check("(fixture) compra a prazo de 150: 201", rCompra.status === 201 && !!compraId, `${rCompra.status} ${j(rCompra.corpo)}`);
  const eCompra = (await A.db.financialEntry.findFirst({ where: { related_module: "emporio", related_id: compraId, entry_type: "expense" } })) as Dado;
  const pCompra = eCompra ? await pagar(A.tok.fin, [eCompra.id]) : null;
  const pedCompra = pCompra?.corpo?.data?.request as Dado;
  check("(fixture) o Financeiro paga a conta da compra: vira pedido pendente", !!pCompra && ok2xx(pCompra) && pCompra.corpo?.data?.waiting_approval === true && !!pedCompra?.id, pCompra ? `${pCompra.status} ${j(pCompra.corpo)}` : "a compra não gerou conta");
  const cCancel = await chamar(A.tok.owner, rotaCompraCancel, "POST", `emporio/purchases/${compraId}/cancel`, { reason: "M100 teste" }, compraId);
  check("cancelar a compra: 409 CONTA_EM_APROVACAO", trava(cCancel), `${cCancel.status} ${j(cCancel.corpo)}`);
  const compraDepois = (await A.db.emporioPurchase.findFirst({ where: { id: compraId } })) as Dado;
  check("a compra segue como estava (não cancelada) e a conta segue pending", !!compraDepois && compraDepois.status !== "cancelada" && !compraDepois.canceled_at && (await status(eCompra?.id)) === "pending", j(compraDepois));
  check("o pedido segue pendente", (await pedidoDb(pedCompra?.id))?.status === "pendente");

  console.log("  (s) a conta de uma despesa 'vendeu e pagou' com pedido pendente não se cancela pela venda");
  const regra = await (await import("@/lib/actions/emporio-despesas")).criarRegraVariavelAction(A.db, A.owner, {
    establishment_id: A.L1, name: `M100 Regra VP ${stamp}`, kind: "fixo_por_venda", value: 150,
  });
  if (!regra.ok) throw new Error(`regra vendeu e pagou: ${j(regra)}`);
  const cliVp = await cliente(A, "Vendeu e pagou");
  let vp: { vendaId: string } | null = null;
  try {
    vp = await fiado(A, cliVp, 20, 30);
  } finally {
    // a regra só vale para a venda de teste: as seções seguintes vendem na mesma loja
    await (prisma as Dado).variableExpenseRule.update({ where: { id: regra.data.id }, data: { archived_at: new Date() } });
  }
  const eVp = (await A.db.financialEntry.findFirst({ where: { related_module: "emporio", related_id: vp.vendaId, entry_type: "expense" } })) as Dado;
  check("(fixture) a venda gerou a conta de despesa de 150 da regra", !!eVp && perto(n(eVp.amount), 150), j(eVp));
  const pVp = eVp ? await pagar(A.tok.fin, [eVp.id]) : null;
  const pedVp = pVp?.corpo?.data?.request as Dado;
  check("(fixture) o Financeiro paga essa conta: vira pedido pendente", !!pVp && ok2xx(pVp) && !!pedVp?.id, pVp ? `${pVp.status} ${j(pVp.corpo)}` : "sem conta");
  const vCancel = await chamar(A.tok.owner, R.saleCancel, "POST", `emporio/sales/${vp.vendaId}/cancel`, { reason: "M100 teste" }, vp.vendaId);
  check("cancelar a venda: 409 CONTA_EM_APROVACAO", trava(vCancel), `${vCancel.status} ${j(vCancel.corpo)}`);
  const vendaDepois = (await A.db.emporioSale.findFirst({ where: { id: vp.vendaId } })) as Dado;
  check("a venda segue concluída e a conta da despesa segue pending", vendaDepois?.status === "concluida" && (await status(eVp?.id)) === "pending", j(vendaDepois));
  for (const id of [pedCompra?.id, pedVp?.id]) if (id) await recusar(A.tok.owner, id, { reason: "M100 limpeza" });

  console.log("  (t) a ocorrência de despesa fixa com pedido pendente não se edita nem se encerra pelo modelo");
  const Dd = await import("@/lib/actions/emporio-despesas");
  const catT = `M100 Despesa fixa T ${stamp}`;
  const modelo = await Dd.criarDespesaFixaAction(A.db, A.owner, {
    name: catT, category: catT, amount: 150, due_day: 28, split_kind: "percentual",
    starts_on: meioDia(`${hojeStr.slice(0, 7)}-01`), splits: [{ establishment_id: A.L1, value: 100 }],
  } as Dado);
  const modeloId = String((modelo as Dado).data?.id ?? "");
  check("(fixture) o modelo de despesa fixa de 150 nasce", !!(modelo as Dado).ok && !!modeloId, j(modelo));
  const eT = (await A.db.financialEntry.findFirst({ where: { category: catT, status: "pending" }, orderBy: { due_date: "asc" } })) as Dado;
  const pT = eT ? await pagar(A.tok.fin, [eT.id]) : null;
  const pedT = pT?.corpo?.data?.request as Dado;
  check("(fixture) o Financeiro paga a ocorrência: vira pedido pendente", !!pT && ok2xx(pT) && pT.corpo?.data?.waiting_approval === true && !!pedT?.id, pT ? `${pT.status} ${j(pT.corpo)}` : "o modelo não gerou ocorrência");
  const edT = (await Dd.editarDespesaFixaAction(A.db, A.owner, modeloId, {
    name: catT, category: catT, amount: 175, due_day: 28, split_kind: "percentual", splits: [{ establishment_id: A.L1, value: 100 }],
  } as Dado)) as Dado;
  check("editar o valor do modelo: 409 CONTA_EM_APROVACAO", !edT.ok && edT.status === 409 && edT.code === "CONTA_EM_APROVACAO", j(edT));
  const enT = (await Dd.encerrarDespesaFixaAction(A.db, A.owner, modeloId)) as Dado;
  check("encerrar o modelo: 409 CONTA_EM_APROVACAO", !enT.ok && enT.status === 409 && enT.code === "CONTA_EM_APROVACAO", j(enT));
  const eTdepois = (await A.db.financialEntry.findFirst({ where: { id: eT?.id } })) as Dado;
  check("a ocorrência segue pending com o valor de antes (150)", eTdepois?.status === "pending" && perto(n(eTdepois?.amount), 150), j(eTdepois));
  if (pedT?.id) await recusar(A.tok.owner, pedT.id, { reason: "M100 limpeza" });

  console.log("  (u) aprovar um pedido cuja conta mudou de valor");
  const eU = await despesa(A, 900);
  const pU = await pagar(A.tok.fin, [eU.id]);
  const pedU = pU.corpo?.data?.request as Dado;
  check("(fixture) pedido pendente de 900", ok2xx(pU) && !!pedU?.id && perto(pedU?.total, 900), `${pU.status} ${j(pU.corpo)}`);
  await (prisma as Dado).financialEntry.update({ where: { id: eU.id }, data: { amount: 950 } });
  const aU = await aprovar(A.tok.owner, pedU?.id);
  check("aprovar com a conta em 950: 409 PEDIDO_DESATUALIZADO", erro(aU, 409, "PEDIDO_DESATUALIZADO"), `${aU.status} ${j(aU.corpo)}`);
  const efU = await efeitos(eU.id);
  check("nenhum FinancialPayment nem CashMovement nasceu", efU.pagamentos === 0 && efU.movimentos === 0, j(efU));
  const dU = await pedidoDb(pedU?.id);
  check("o pedido segue pendente e o last_failure cita o valor", dU?.status === "pendente" && typeof dU?.last_failure === "string" && /950|900/.test(dU.last_failure), j(dU));
  if (pedU?.id) await recusar(A.tok.owner, pedU.id, { reason: "M100 limpeza" });

  console.log("  (w) o Hoje de uma loja conta só a gaveta dela e a conta bancária");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const l2 = await Cat.criarEstabelecimentoAction(A.db, A.owner, { name: `M100 A Loja 2 ${stamp}` });
  if (!l2.ok) throw new Error(`loja 2: ${j(l2)}`);
  const L2 = l2.data.id as string;
  const hojeLoja = async (loja: string) => {
    const r = await chamar(A.tok.fin, R.today, "GET", `emporio/finance/today?establishment_id=${loja}`);
    return r.corpo?.data?.pending_approvals as Dado;
  };
  const antesL1 = await hojeLoja(A.L1);
  const antesL2 = await hojeLoja(L2);
  const eW = await Promise.all([despesa(A, 30), despesa(A, 40), despesa(A, 50)]);
  const mk = (e: Dado, extra: Dado) =>
    (prisma as Dado).emporioPaymentRequest.create({ data: { tenant_id: A.tenantId, requested_by_user_id: A.fin.id, entry_ids: [e.id], total: n(e.amount), status: "pendente", ...extra } });
  const reqs = [
    await mk(eW[0], { establishment_id: A.L1, cash_register_id: A.reg }),
    await mk(eW[1], { establishment_id: L2 }),
    await mk(eW[2], { bank_account_id: A.conta }),
  ];
  try {
    const depoisL1 = await hojeLoja(A.L1);
    const depoisL2 = await hojeLoja(L2);
    check("a loja 1 conta a gaveta dela e a conta bancária (+2 pedidos, +80)",
      depoisL1?.count - antesL1?.count === 2 && perto(n(depoisL1?.total) - n(antesL1?.total), 80), j([antesL1, depoisL1]));
    check("a loja 2 conta a gaveta dela e a conta bancária, mas não a gaveta da loja 1 (+2 pedidos, +90)",
      depoisL2?.count - antesL2?.count === 2 && perto(n(depoisL2?.total) - n(antesL2?.total), 90), j([antesL2, depoisL2]));
  } finally {
    await (prisma as Dado).emporioPaymentRequest.deleteMany({ where: { id: { in: reqs.map((q: Dado) => q.id) } } });
  }

  // Dívida 2.43: decididos paginados no banco (200 por página, cursor `before`).
  const Apr = await import("@/lib/actions/emporio-aprovacoes");
  const base = Date.now() - 3_000_000_000;
  const dec = (i: number, status: string) => ({
    tenant_id: A.tenantId, requested_by_user_id: A.fin.id, entry_ids: ["x"], total: n(1), status,
    establishment_id: i % 3 ? A.L1 : L2, decided_at: new Date(base + i * 1000), decided_by_user_id: A.owner.id,
  });
  const dados: Dado[] = Array.from({ length: 205 }, (_, i) => dec(i, i % 2 ? "aprovado" : "recusado"));
  dados.push({ ...dec(999, "pendente"), decided_at: null });
  const criados = await (prisma as Dado).emporioPaymentRequest.createManyAndReturn({ data: dados, select: { id: true } });
  try {
    const p1 = await Apr.listarPedidosDePagamentoAction(A.db, A.owner, { status: "decididos" });
    const d1: Dado[] = p1.ok ? p1.data : [];
    check("decididos: a primeira página traz 200, sem pendente, do mais novo ao mais antigo",
      d1.length === 200 && d1.every((p) => p.status !== "pendente" && p.decided_at), j(d1.length));
    // Outros pedidos decididos do tenant (seções anteriores) podem preceder os 205: segue o cursor até esgotar.
    const vistos = new Set<string>(d1.map((p) => p.id));
    let pag = d1;
    for (let i = 0; i < 10 && pag.length === 200; i++) {
      const pn = await Apr.listarPedidosDePagamentoAction(A.db, A.owner, { status: "decididos", before: pag[199].decided_at });
      pag = pn.ok ? pn.data : [];
      pag.forEach((p) => vistos.add(p.id));
    }
    check("decididos: o cursor `before` alcança os 205 pedidos, inclusive o mais antigo",
      criados.slice(0, 205).every((c: Dado) => vistos.has(c.id)), j(vistos.size));
    const r = await chamar(A.tok.fin, R.requests, "GET", "emporio/finance/payment-requests?status=decididos&before=nao-e-data");
    check("decididos: cursor inválido na rota é 422", r.status === 422, j(r.corpo));
  } finally {
    await (prisma as Dado).emporioPaymentRequest.deleteMany({ where: { id: { in: criados.map((q: Dado) => q.id) } } });
  }
}

// ---------------------------------------------------------------------------
// Seção 4: o carimbo
// ---------------------------------------------------------------------------

async function secao4() {
  console.log("\nSeção 4: o carimbo de conciliação no extrato");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");
  const Cx = await import("@/lib/actions/emporio-caixa");
  const de = emDias(-30);
  const ate = emDias(1);
  const extrato = async (tok: string, qs = "") => {
    const r = await chamar(tok, R.statement, "GET", `emporio/finance/statement?bank_account_id=${A.conta}&de=${de}&ate=${ate}${qs}`);
    return { r, x: r.corpo?.data as Dado, linhas: (r.corpo?.data?.lines ?? []) as Dado[] };
  };
  const carimbar = (tok: string, kind: string, id: string) => chamar(tok, R.reconcile, "POST", "emporio/finance/statement/reconcile", { kind, id });
  const descarimbar = (tok: string, kind: string, id: string) => chamar(tok, R.reconcile, "DELETE", "emporio/finance/statement/reconcile", { kind, id });

  // fixtures: uma saída da conta (pagamento de despesa) e uma parcela de cartão
  const Dd = await import("@/lib/actions/emporio-despesas");
  void Dd;
  const e = await despesa(A, 25);
  const pg = await chamar(A.tok.owner, R.payablesPay, "POST", "emporio/payables/pay", { entry_ids: [e.id], from: { bank_account_id: A.conta } });
  check("(fixture) o Dono paga uma despesa de 25 pela conta: 201", pg.status === 201, `${pg.status} ${j(pg.corpo)}`);
  const regra = await Cx.definirRegraCartaoAction(A.db, A.owner, { establishment_id: A.L1, kind: "credito_vista", fee_pct: 2, days: 1, bank_account_id: A.conta });
  if (!regra.ok) throw new Error(`regra de cartão: ${j(regra)}`);
  const cli = await cliente(A, "Carimbo cartao");
  await vender(A, cli, 10, [{ kind: "credito_vista", amount: 100 }], { sold_at: new Date(Date.now() - DIA) });
  const cartao = (await A.db.cardReceivable.findFirst({ where: { bank_account_id: A.conta, canceled_at: null } })) as Dado;
  check("(fixture) existe a parcela de cartão da conta", !!cartao?.id, j(cartao));
  const movs = (await A.db.cashMovement.findMany({ where: { bank_account_id: A.conta }, orderBy: { created_at: "asc" } })) as Dado[];
  const movInicial = movs[0];
  const movSaida = movs.find((m) => m.direction === "saida");
  check("(fixture) a conta tem o saldo inicial e a saída paga", !!movInicial?.id && !!movSaida?.id, `${movs.length}`);

  console.log("  (a) o extrato mostra o carimbo vazio");
  const x0 = await extrato(A.tok.fin);
  check("o extrato: 200 e toda linha traz reconciled_at e reconciled_by nulos", x0.r.status === 200 && x0.linhas.length >= 3 && x0.linhas.every((l) => l.reconciled_at === null && l.reconciled_by === null), `${x0.r.status} ${j(x0.linhas.slice(0, 2))}`);
  const somaAbs = (ls: Dado[]) => ls.reduce((s, l) => s + Math.abs(n(l.amount)), 0);
  check("unreconciled_count é a quantidade de linhas sem carimbo", x0.x?.unreconciled_count === x0.linhas.length, `${x0.x?.unreconciled_count} vs ${x0.linhas.length}`);
  check("unreconciled_total é a soma dos valores absolutos das linhas sem carimbo", perto(x0.x?.unreconciled_total, somaAbs(x0.linhas)), `${x0.x?.unreconciled_total} vs ${somaAbs(x0.linhas)}`);
  const h0 = (await chamar(A.tok.fin, R.today, "GET", "emporio/finance/today")).corpo?.data as Dado;
  check("o Hoje traz unreconciled com a mesma contagem e o mesmo total do extrato da conta", h0?.unreconciled?.count === x0.linhas.length && perto(h0?.unreconciled?.total, somaAbs(x0.linhas)), `${j(h0?.unreconciled)} vs ${x0.linhas.length}/${somaAbs(x0.linhas)}`);

  console.log("  (b) carimbar movimento de conta");
  const cGestor = await carimbar(A.tok.gestor, "movimento", movSaida?.id);
  check("o Gestor da loja não carimba: 403", cGestor.status === 403, `${cGestor.status} ${j(cGestor.corpo)}`);
  const cVend = await carimbar(A.tok.vend, "movimento", movSaida?.id);
  check("o Vendedor não carimba: 403", cVend.status === 403, `${cVend.status}`);
  check("os 403 não carimbaram", (await A.db.cashMovement.findFirst({ where: { id: movSaida?.id } })).reconciled_at === null);
  const c1 = await carimbar(A.tok.fin, "movimento", movSaida?.id);
  check("o Financeiro carimba o movimento: 200", c1.status === 200, `${c1.status} ${j(c1.corpo)}`);
  check("a resposta traz kind, id, reconciled_at e o nome de quem carimbou", c1.corpo?.data?.kind === "movimento" && c1.corpo?.data?.id === movSaida?.id && typeof c1.corpo?.data?.reconciled_at === "string" && c1.corpo?.data?.reconciled_by === "M100 fin", j(c1.corpo));
  const m1 = (await A.db.cashMovement.findFirst({ where: { id: movSaida?.id } })) as Dado;
  check("grava reconciled_at e reconciled_by_user_id no movimento", !!m1?.reconciled_at && m1?.reconciled_by_user_id === A.fin.id, j(m1));
  check("carimbar não mexe no valor nem no saldo (o amount segue o mesmo)", perto(n(m1?.amount), n(movSaida?.amount)));
  const hc = (await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "conciliacao.carimbar" } })) as Dado[];
  check("o Histórico grava conciliacao.carimbar no alvo conta", hc.length === 1 && hc[0].target_type === "conta" && hc[0].target_id === A.conta, j(hc.map((h) => [h.target_type, h.target_id, h.summary])));
  X.movCarimbado = String(movSaida?.id ?? "");

  console.log("  (c) carimbar parcela de cartão");
  const c2 = await carimbar(A.tok.fin, "cartao", cartao?.id);
  check("carimba a parcela de cartão: 200", c2.status === 200 && c2.corpo?.data?.kind === "cartao", `${c2.status} ${j(c2.corpo)}`);
  const k1 = (await A.db.cardReceivable.findFirst({ where: { id: cartao?.id } })) as Dado;
  check("grava reconciled_at e reconciled_by_user_id na parcela", !!k1?.reconciled_at && k1?.reconciled_by_user_id === A.fin.id, j(k1));
  X.cartaoCarimbado = String(cartao?.id ?? "");

  console.log("  (d) o que não é linha de conta");
  const gaveta = (await A.db.cashMovement.findFirst({ where: { establishment_id: A.L1, bank_account_id: null, manager_establishment_id: null } })) as Dado;
  const gerencia = (await A.db.cashMovement.findFirst({ where: { manager_establishment_id: A.L1, bank_account_id: null } })) as Dado;
  const rGav = await carimbar(A.tok.fin, "movimento", gaveta?.id);
  check("movimento de gaveta: 422 LINHA_NAO_E_DE_CONTA no campo id", erro(rGav, 422, "LINHA_NAO_E_DE_CONTA", "id"), `${rGav.status} ${j(rGav.corpo)}`);
  const rGer = await carimbar(A.tok.fin, "movimento", gerencia?.id);
  check("movimento de gerência: 422 LINHA_NAO_E_DE_CONTA no campo id", erro(rGer, 422, "LINHA_NAO_E_DE_CONTA", "id"), `${rGer.status} ${j(rGer.corpo)}`);
  check("a recusa não carimbou a gaveta", (await A.db.cashMovement.findFirst({ where: { id: gaveta?.id } })).reconciled_at === null);
  const rNada = await carimbar(A.tok.fin, "movimento", "nao-existe");
  check("linha que não existe: 404", rNada.status === 404, `${rNada.status} ${j(rNada.corpo)}`);
  const rKind = await carimbar(A.tok.fin, "lixo", movSaida?.id);
  check("kind inválido: 422", rKind.status === 422, `${rKind.status} ${j(rKind.corpo)}`);

  console.log("  (e) já carimbado e descarimbar");
  const c3 = await carimbar(A.tok.fin, "movimento", movSaida?.id);
  check("carimbar de novo: 409 JA_CARIMBADO no campo id", erro(c3, 409, "JA_CARIMBADO", "id"), `${c3.status} ${j(c3.corpo)}`);
  const antesTs = (await A.db.cashMovement.findFirst({ where: { id: movSaida?.id } })).reconciled_at;
  check("e o carimbo original ficou intacto", diaDe(antesTs) === diaDe(m1?.reconciled_at) && new Date(antesTs).getTime() === new Date(m1?.reconciled_at).getTime());
  const dGest = await descarimbar(A.tok.gestor, "movimento", movSaida?.id);
  check("o Gestor da loja não descarimba: 403", dGest.status === 403, `${dGest.status}`);
  const d0 = await descarimbar(A.tok.fin, "movimento", movInicial?.id);
  check("descarimbar linha sem carimbo: 409 SEM_CARIMBO no campo id", erro(d0, 409, "SEM_CARIMBO", "id"), `${d0.status} ${j(d0.corpo)}`);
  const d1 = await descarimbar(A.tok.fin, "movimento", movSaida?.id);
  check("descarimbar o movimento carimbado: 200", d1.status === 200, `${d1.status} ${j(d1.corpo)}`);
  const m2 = (await A.db.cashMovement.findFirst({ where: { id: movSaida?.id } })) as Dado;
  check("limpa reconciled_at e reconciled_by_user_id", m2?.reconciled_at === null && m2?.reconciled_by_user_id === null, j(m2));
  check("o Histórico grava conciliacao.descarimbar", (await prisma.emporioAuditLog.count({ where: { tenant_id: A.tenantId, action: "conciliacao.descarimbar" } })) === 1);
  const c4 = await carimbar(A.tok.fin, "movimento", movSaida?.id);
  check("depois de descarimbar dá para carimbar de novo: 200", c4.status === 200, `${c4.status} ${j(c4.corpo)}`);

  console.log("  (f) o extrato com carimbo, o filtro e o total");
  const x1 = await extrato(A.tok.fin);
  const lMov = x1.linhas.find((l) => l.id === movSaida?.id);
  const lCar = x1.linhas.find((l) => l.id === cartao?.id);
  check("a linha do movimento carimbado mostra reconciled_at e o nome em reconciled_by", typeof lMov?.reconciled_at === "string" && lMov?.reconciled_by === "M100 fin", j(lMov));
  check("a linha do cartão carimbado também", typeof lCar?.reconciled_at === "string" && lCar?.reconciled_by === "M100 fin", j(lCar));
  const semCarimbo = x1.linhas.filter((l) => l.reconciled_at === null);
  check("unreconciled_count caiu em 2 (o movimento e o cartão)", x1.x?.unreconciled_count === x0.linhas.length - 2 && x1.x?.unreconciled_count === semCarimbo.length, `${x1.x?.unreconciled_count}`);
  check("unreconciled_total caiu o valor das duas linhas e bate com a soma das linhas sem carimbo", perto(x1.x?.unreconciled_total, somaAbs(semCarimbo)) && x1.x?.unreconciled_total < x0.x?.unreconciled_total, `${x1.x?.unreconciled_total}`);
  const xf = await extrato(A.tok.fin, "&apenas_sem_carimbo=1");
  check("apenas_sem_carimbo=1 traz só as linhas sem carimbo", xf.r.status === 200 && xf.linhas.length === semCarimbo.length && xf.linhas.every((l) => l.reconciled_at === null), `${xf.r.status} ${xf.linhas.length} vs ${semCarimbo.length}`);
  check("o total sem carimbo é calculado ANTES do filtro (o mesmo com e sem)", xf.x?.unreconciled_count === x1.x?.unreconciled_count && perto(xf.x?.unreconciled_total, x1.x?.unreconciled_total), `${xf.x?.unreconciled_count}/${xf.x?.unreconciled_total} vs ${x1.x?.unreconciled_count}/${x1.x?.unreconciled_total}`);
  const h1 = (await chamar(A.tok.fin, R.today, "GET", "emporio/finance/today")).corpo?.data as Dado;
  check("o Hoje acompanha: count e total sem carimbo caíram igual ao extrato", h1?.unreconciled?.count === semCarimbo.length && perto(h1?.unreconciled?.total, somaAbs(semCarimbo)), `${j(h1?.unreconciled)}`);
  const gav = await chamar(A.tok.fin, R.statement, "GET", `emporio/finance/statement?kind=gaveta&id=${A.L1}&de=${de}&ate=${ate}`);
  check("o extrato da gaveta não tem carimbo: unreconciled 0 e linhas sem reconciled_at", gav.status === 200 && gav.corpo?.data?.unreconciled_count === 0 && gav.corpo?.data?.unreconciled_total === 0 && (gav.corpo?.data?.lines ?? []).every((l: Dado) => l.reconciled_at === null), `${gav.status} ${j(gav.corpo?.data?.unreconciled_count)}`);
}

// ---------------------------------------------------------------------------
// Seção 5: isolamento
// ---------------------------------------------------------------------------

async function secao5() {
  console.log("\nSeção 5: o Financeiro de um tenant não alcança acordo, pedido e carimbo do outro");
  const { A, B } = M!;
  const { prisma } = await import("@/lib/prisma");
  const pedidoAntes = (await (prisma as Dado).emporioPaymentRequest.findUnique({ where: { id: X.pedidoId } })) as Dado;
  check("(fixture) o pedido pendente de A existe", pedidoAntes?.status === "pendente", j(pedidoAntes));
  const acordosAntes = await (prisma as Dado).emporioCreditAgreement.count({ where: { tenant_id: A.tenantId } });
  const entradasA = (await prisma.financialEntry.findMany({ where: { tenant_id: A.tenantId, emporio_customer_id: X.clienteAcordo } })) as Dado[];
  const alvo = { id: X.clienteAcordo };

  console.log("  acordo");
  const lido = await chamar(B.tok.fin, R.agreements, "GET", `emporio/customers/${X.clienteAcordo}/agreements`, undefined, X.clienteAcordo);
  check("ler os acordos do cliente de A: 404", lido.status === 404, `${lido.status} ${j(lido.corpo)}`);
  check("e a resposta não vaza o acordo", !j(lido.corpo).includes(X.acordoId) && !j(lido.corpo).includes("M100 Acordo base"), j(lido.corpo));
  const origemA = entradasA.find((e) => e.status === "cancelled");
  const fazer = await acordar(B.tok.fin, alvo, [String(origemA?.id ?? "x")], partes(1000, 1, 5));
  check("fazer acordo sobre o cliente de A: 404 (e nunca 201)", fazer.status === 404, `${fazer.status} ${j(fazer.corpo)}`);
  const cliB = await cliente(B, "Isolamento acordo");
  const entradaA = (await prisma.financialEntry.findFirst({ where: { tenant_id: A.tenantId, category: "Acordo de fiado" } })) as Dado;
  const misto = await acordar(B.tok.fin, cliB, [String(entradaA?.id ?? "x")], partes(1000, 1, 5));
  check("fazer acordo do cliente de B com a entrada de A: 422 ACORDO_SEM_ORIGEM", erro(misto, 422, "ACORDO_SEM_ORIGEM", "entry_ids"), `${misto.status} ${j(misto.corpo)}`);

  console.log("  pedido de pagamento");
  const lista = await chamar(B.tok.fin, R.requests, "GET", "emporio/finance/payment-requests");
  check("a lista de pedidos de B: 200 e sem o pedido de A", lista.status === 200 && !j(lista.corpo).includes(X.pedidoId), `${lista.status} ${j(lista.corpo).slice(0, 200)}`);
  const ap = await chamar(B.tok.owner, R.approve, "POST", `emporio/finance/payment-requests/${X.pedidoId}/approve`, {}, X.pedidoId);
  check("aprovar o pedido de A pelo Dono de B: 404", ap.status === 404, `${ap.status} ${j(ap.corpo)}`);
  const rj = await chamar(B.tok.owner, R.reject, "POST", `emporio/finance/payment-requests/${X.pedidoId}/reject`, { reason: "Tentativa de outro tenant" }, X.pedidoId);
  check("recusar o pedido de A pelo Dono de B: 404", rj.status === 404, `${rj.status} ${j(rj.corpo)}`);
  const depoisPed = (await (prisma as Dado).emporioPaymentRequest.findUnique({ where: { id: X.pedidoId } })) as Dado;
  check("o pedido de A segue pendente e sem decisor", depoisPed?.status === "pendente" && !depoisPed?.decided_by_user_id && !depoisPed?.decided_at, j(depoisPed));
  const hjB = (await chamar(B.tok.fin, R.today, "GET", "emporio/finance/today")).corpo?.data as Dado;
  check("o Hoje de B não conta o pedido de A (pending_approvals zerado)", hjB?.pending_approvals?.count === 0 && perto(hjB?.pending_approvals?.total, 0), j(hjB?.pending_approvals));
  const hjA = (await chamar(A.tok.fin, R.today, "GET", "emporio/finance/today")).corpo?.data as Dado;
  check("e o Hoje de A conta (1 pedido)", hjA?.pending_approvals?.count === 1, j(hjA?.pending_approvals));
  const tetoB = await chamar(B.tok.owner, R.approval, "PATCH", "emporio/settings/approval", { payment_approval_limit: 7 });
  const sA = (await (prisma as Dado).emporioSettings.findFirst({ where: { tenant_id: A.tenantId } })) as Dado;
  const sB = (await (prisma as Dado).emporioSettings.findFirst({ where: { tenant_id: B.tenantId } })) as Dado;
  check("o teto de B grava em B (7) e não mexe no de A (100)", tetoB.status === 200 && perto(n(sB?.payment_approval_limit), 7) && perto(n(sA?.payment_approval_limit), 100), `${tetoB.status} B=${sB?.payment_approval_limit} A=${sA?.payment_approval_limit}`);

  console.log("  carimbo");
  const cB = await chamar(B.tok.fin, R.reconcile, "POST", "emporio/finance/statement/reconcile", { kind: "movimento", id: X.movCarimbado });
  check("carimbar o movimento de A pelo Financeiro de B: 404 (ou 409 se não fosse isolado, nunca 200)", cB.status === 404, `${cB.status} ${j(cB.corpo)}`);
  const dB = await chamar(B.tok.fin, R.reconcile, "DELETE", "emporio/finance/statement/reconcile", { kind: "movimento", id: X.movCarimbado });
  check("descarimbar o movimento de A pelo Financeiro de B: 404", dB.status === 404, `${dB.status} ${j(dB.corpo)}`);
  const kB = await chamar(B.tok.fin, R.reconcile, "DELETE", "emporio/finance/statement/reconcile", { kind: "cartao", id: X.cartaoCarimbado });
  check("descarimbar a parcela de cartão de A pelo Financeiro de B: 404", kB.status === 404, `${kB.status} ${j(kB.corpo)}`);
  const mA = (await A.db.cashMovement.findFirst({ where: { id: X.movCarimbado } })) as Dado;
  const kA = (await A.db.cardReceivable.findFirst({ where: { id: X.cartaoCarimbado } })) as Dado;
  check("os carimbos de A seguem de pé", !!mA?.reconciled_at && !!kA?.reconciled_at, j([mA?.reconciled_at, kA?.reconciled_at]));
  const exB = await chamar(B.tok.fin, R.statement, "GET", `emporio/finance/statement?bank_account_id=${A.conta}&de=${emDias(-30)}&ate=${emDias(1)}`);
  check("o extrato da conta de A lido por B: não devolve 200 com dado de A", exB.status !== 0 && (exB.status !== 200 || (exB.corpo?.data?.lines ?? []).length === 0), `${exB.status}`);
  const exBpro = await chamar(B.tok.fin, R.statement, "GET", `emporio/finance/statement?bank_account_id=${B.conta}&de=${emDias(-30)}&ate=${emDias(1)}`);
  const linhasB = (exBpro.corpo?.data?.lines ?? []) as Dado[];
  check("o extrato de B só tem as linhas de B (nenhuma carimbada, contagem é a das próprias)", exBpro.status === 200 && linhasB.every((l) => l.reconciled_at === null) && exBpro.corpo?.data?.unreconciled_count === linhasB.length, `${exBpro.status} ${j(exBpro.corpo?.data?.unreconciled_count)} vs ${linhasB.length}`);
  check("nada mudou no acordo de A (mesmo número de acordos e as entradas do cliente)",
    (await (prisma as Dado).emporioCreditAgreement.count({ where: { tenant_id: A.tenantId } })) === acordosAntes
    && (await prisma.financialEntry.count({ where: { tenant_id: A.tenantId, emporio_customer_id: X.clienteAcordo } })) === entradasA.length);
}

// ---------------------------------------------------------------------------

async function limpar() {
  if (tenantIds.length === 0) return;
  const { prisma } = await import("@/lib/prisma");
  for (const id of tenantIds) {
    await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
  }
  const modelos = [
    "emporioPaymentRequest", "emporioCreditRelease", "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "cardReceivable", "cardFeeRate", "cardAcquirer", "emporioSalePayment", "emporioSaleReturnItem",
    "stockMovement", "emporioSaleItem", "emporioSaleReturn", "emporioCheck", "emporioQuoteItem", "emporioQuote", "emporioSale", "emporioPurchaseItem",
    "emporioPurchase", "financialPayment", "financialEntry", "emporioCreditAgreement", "emporioCustomer", "emporioSupplier", "cashHandover", "cashSession", "cashRegister", "emporioCounter",
    "emporioSettings", "userEstablishment", "establishment", "bankAccount", "contact", "user", "tenantProfile", "tenantFeature",
  ];
  // duas passadas: o acordo e a entrada se referenciam, e a ordem de uma só pode deixar sobra
  for (let passada = 0; passada < 2; passada += 1) {
    for (const id of tenantIds) {
      for (const m of modelos) {
        try {
          await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: id } });
        } catch {
          // modelo ausente nesta versão do schema, ou referência que a próxima passada resolve: segue
        }
      }
    }
  }
  for (const id of tenantIds) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
  const sobrou = await prisma.tenant.count({ where: { id: { in: tenantIds } } });
  check("a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
}

async function main() {
  try {
    await rodar("1 pura", secao1Pura);
    await comBanco(async () => {
      await rodar("montagem", async () => {
        M = { A: await montar("A"), B: await montar("B") };
      });
      if (!M) {
        check("a montagem dos tenants terminou (sem ela as seções 2 a 5 não rodam)", false);
        return;
      }
      await rodar("2", secao2);
      await rodar("3", secao3);
      await rodar("4", secao4);
      await rodar("5", secao5);
    });
  } finally {
    await limpar();
  }
  console.log(falhas === 0 ? "\n✅ M100 verde" : `\n❌ M100: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
