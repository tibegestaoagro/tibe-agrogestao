import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M101: Módulo 39 (Meu Empório), financeiro das lojas, entrega 4: projeção, relatórios e rateio automático.
 * Roda: `npm run test:m101`
 *
 * Escrita da spec (2026-11-07, "Entrega 4") e do plano (2026-11-08), sem ler a implementação.
 *
 * Seção 1: as funções puras (rateio por peso, semanas da janela, faixas de idade). Sem banco.
 * Seção 2: a loja ganha área e funcionários (quem grava, recusas, Histórico).
 * Seção 3: o rateio automático da despesa fixa (faturamento, área, funcionários).
 * Seção 4: o fluxo de caixa projetado, por semana.
 * Seção 5: os três relatórios (a receber por idade, a pagar por vencimento, posição por lugar).
 * Seção 6: isolamento entre tenants.
 *
 * Tenants: A (loja e rateio), P (projeção e relatórios, um mundo controlado), E (estimativa de despesa fixa), F (estimativa
 * depois da revisão: base de hoje, mês nascido, troca de critério), B (isolamento).
 * As fixtures passam pelas actions e por Prisma (datas); o que está sob prova passa pela ROTA quando há rota.
 * A suíte nasce vermelha: as rotas e as regras das Tasks 1, 3 e 4 ainda não existem.
 */

let falhas = 0;
let secaoAtual = "0";
const contagem: Record<string, { ok: number; falhas: number }> = {};
function check(nome: string, cond: boolean, detalhe?: string) {
  const c = (contagem[secaoAtual] ??= { ok: 0, falhas: 0 });
  if (cond) {
    c.ok += 1;
    console.log(`  ✅ ${nome}`);
  } else {
    c.falhas += 1;
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

const j = (x: unknown) => JSON.stringify(x);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;

console.log("🧾 M101: Módulo 39 (Meu Empório), financeiro das lojas, entrega 4: projeção, relatórios e rateio\n");

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
const mesCorrente = hojeStr.slice(0, 7);
const somaMes = (ym: string, k: number) => {
  const [a, m] = ym.split("-").map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const civil = (ym: string) => ({ ano: Number(ym.slice(0, 4)), mes: Number(ym.slice(5, 7)) });
const mesAnterior = somaMes(mesCorrente, -1);
const mesSeguinte = somaMes(mesCorrente, 1);

// ---------------------------------------------------------------------------
// Seção 1 (pura)
// ---------------------------------------------------------------------------

async function secao1Pura() {
  secaoAtual = "1";
  console.log("Seção 1: as funções puras (sem banco)");
  const Ra: Dado = await import("@/lib/emporio/rateio");
  const Pr: Dado = await import("@/lib/emporio/projecao");
  const rp = (total: number, pesos: number[]) => Ra.ratearPorPeso(total, pesos) as { partes: number[]; iguais: boolean };

  console.log("  ratearPorPeso");
  check("10000 com pesos 3 e 1 dá 7500 e 2500", j(rp(10000, [3, 1]).partes) === j([7500, 2500]), j(rp(10000, [3, 1])));
  check("com pesos diferentes de zero, iguais é false", rp(10000, [3, 1]).iguais === false);
  check("10001 em três pesos iguais: o resto vai para a primeira (3335, 3333, 3333)", j(rp(10001, [1, 1, 1]).partes) === j([3335, 3333, 3333]), j(rp(10001, [1, 1, 1])));
  check("peso zero recebe zero (10000 com 0 e 2 dá 0 e 10000)", j(rp(10000, [0, 2]).partes) === j([0, 10000]), j(rp(10000, [0, 2])));
  const r00 = rp(10000, [0, 0]);
  check("todos os pesos zero: partes iguais (5000, 5000) e iguais true", j(r00.partes) === j([5000, 5000]) && r00.iguais === true, j(r00));
  const r001 = rp(10001, [0, 0, 0]);
  check("todos os pesos zero com resto: 3334, 3334, 3333 não, o resto é da primeira (3335, 3333, 3333)", j(r001.partes) === j([3335, 3333, 3333]) && r001.iguais === true, j(r001));
  const resto = rp(10000, [0, 1, 1]);
  check("o resto vai para a primeira loja com peso maior que zero, não para a de peso zero", resto.partes[0] === 0 && resto.partes[1] + resto.partes[2] === 10000, j(resto));
  const impar = rp(10001, [0, 1, 1]);
  check("10001 com pesos 0, 1, 1: a primeira com peso (índice 1) fica com o centavo (0, 5001, 5000)", j(impar.partes) === j([0, 5001, 5000]), j(impar));
  const tres = rp(1000, [3, 1, 1]);
  check("a soma das partes é sempre o total (1000 com 3, 1, 1: 600, 200, 200)", j(tres.partes) === j([600, 200, 200]), j(tres));
  let somaSempre = true;
  for (const [t, ps] of [[9999, [7, 3, 11]], [1, [1, 1, 1]], [12345, [2, 5]], [100, [1, 2, 3, 4]]] as [number, number[]][]) {
    if (rp(t, ps).partes.reduce((s, x) => s + x, 0) !== t) somaSempre = false;
  }
  check("a soma das partes é o total em quatro casos variados", somaSempre);
  let semLancar = true;
  try {
    rp(0, [1, 1]);
    rp(100, []);
  } catch {
    semLancar = false;
  }
  check("total zero e lista vazia não lançam", semLancar);
  check("total zero devolve partes zeradas", rp(0, [1, 1]).partes.every((x) => x === 0));
  check("lista vazia devolve partes vazias", rp(100, []).partes.length === 0);

  console.log("  critérios automáticos");
  check("ehCriterioAutomatico: faturamento, area e funcionarios são automáticos", ["faturamento", "area", "funcionarios"].every((k) => Ra.ehCriterioAutomatico(k) === true));
  check("ehCriterioAutomatico: percentual, valor e lixo não são", ["percentual", "valor", "lixo", ""].every((k) => Ra.ehCriterioAutomatico(k) === false));

  console.log("  semanasDaJanela");
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const s30 = Pr.semanasDaJanela(d("2026-11-08"), 30) as { numero: number; de: string; ate: string }[];
  check("30 dias dão 5 semanas", s30.length === 5, String(s30.length));
  check("a primeira vai de 08/11 a 14/11", s30[0]?.de === "2026-11-08" && s30[0]?.ate === "2026-11-14" && s30[0]?.numero === 1, j(s30[0]));
  check("a segunda começa no dia seguinte (15/11 a 21/11)", s30[1]?.de === "2026-11-15" && s30[1]?.ate === "2026-11-21" && s30[1]?.numero === 2, j(s30[1]));
  check("a quinta tem 2 dias: 06/12 a 07/12", s30[4]?.de === "2026-12-06" && s30[4]?.ate === "2026-12-07" && s30[4]?.numero === 5, j(s30[4]));
  check("60 dias dão 9 semanas e 90 dão 13", (Pr.semanasDaJanela(d("2026-11-08"), 60) as unknown[]).length === 9 && (Pr.semanasDaJanela(d("2026-11-08"), 90) as unknown[]).length === 13);
  const s90 = Pr.semanasDaJanela(d("2026-11-08"), 90) as { numero: number; de: string; ate: string }[];
  check("a última semana de 90 termina em hoje + 89 (05/02/2027)", s90[12]?.ate === "2027-02-05", j(s90[12]));
  const { hojeEmBrasilia } = await import("@/lib/emporio/cartao");
  const sReal = Pr.semanasDaJanela(hojeEmBrasilia(), 30) as { de: string }[];
  check("com o valor real de hojeEmBrasilia(), a semana 1 começa no dia de hoje em São Paulo (não na véspera)", sReal[0]?.de === hojeStr, `${sReal[0]?.de} vs ${hojeStr}`);
  check("as semanas são contíguas e numeradas", s90.every((s, i) => s.numero === i + 1 && (i === 0 || s.de === new Date(new Date(`${s90[i - 1].ate}T00:00:00Z`).getTime() + DIA).toISOString().slice(0, 10))));

  console.log("  faixaDeIdade");
  const fx = (x: number) => Pr.faixaDeIdade(x);
  check("0 dia de atraso é em_dia", fx(0) === "em_dia", String(fx(0)));
  check("1 e 15 são 1-15", fx(1) === "1-15" && fx(15) === "1-15", `${fx(1)} ${fx(15)}`);
  check("16 e 30 são 16-30", fx(16) === "16-30" && fx(30) === "16-30", `${fx(16)} ${fx(30)}`);
  check("31 e 400 são 30+", fx(31) === "30+" && fx(400) === "30+", `${fx(31)} ${fx(400)}`);
  check("FAIXAS_DE_IDADE na ordem em_dia, 1-15, 16-30, 30+", j(Pr.FAIXAS_DE_IDADE) === j(["em_dia", "1-15", "16-30", "30+"]), j(Pr.FAIXAS_DE_IDADE));
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
  gestor: Usuario; // gestor só da L1
  vend: Usuario; // vendedor da L1
  fin: Usuario; // financeiro, sem loja
  tok: Record<"owner" | "gestor" | "vend" | "fin", string>;
  L1: string;
  L2: string;
  reg: Record<string, string>;
  conta: string; // conta bancária com saldo inicial de 1000
  prodId: string;
  presId: string;
};

let M: { A: Mundo; P: Mundo; E: Mundo; F: Mundo; B: Mundo } | null = null;

const PADRAO = { fiado_due_days: 30, fiado_block_after_days: 365, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null };

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
    data: { name: `M101 ${rotulo} ${stamp}`, document: `M101${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  await (prisma as Dado).emporioSettings.upsert({ where: { tenant_id: t.id }, create: { tenant_id: t.id, ...PADRAO }, update: PADRAO });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M101 ${suf}`, email: `m101-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vend = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: ["lancar_compra"] });
  const fin = await mk("fin", "OPERADOR", papelFinanceiro());

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M101 ${rotulo} Loja 1` });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M101 ${rotulo} Loja 2` });
  if (!l1.ok || !l2.ok) throw new Error(`lojas: ${j([l1, l2])}`);
  const L1 = l1.data.id as string;
  const L2 = l2.data.id as string;
  await vincularTodas(prisma, t.id, [gestor.id, vend.id], [L1]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M101 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M101 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  for (const L of [L1, L2]) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  }
  const c1 = await Cx.criarContaAction(db, owner, { name: `M101 Conta ${rotulo} ${stamp}`, bank: "Banco M101" });
  if (!c1.ok) throw new Error(`conta: ${j(c1)}`);
  const conta = c1.data.id as string;
  for (const input of [
    { bank_account_id: conta, amount: 1000 },
    { establishment_id: L1, amount: 200 },
    { manager_establishment_id: L1, amount: 50 },
  ]) {
    const s = await Cx.saldoInicialCaixaAction(db, owner, input);
    if (!s.ok) throw new Error(`saldo inicial ${j(input)}: ${j(s)}`);
  }
  // o saldo inicial da gaveta só vale antes do primeiro turno
  for (const L of [L1, L2]) await abrirTurnoDeTeste(db, owner, L);
  const reg: Record<string, string> = {};
  for (const L of [L1, L2]) reg[L] = (await db.cashRegister.findFirst({ where: { establishment_id: L, number: 1 } }))?.id as string;
  const regra = await Cx.definirRegraCartaoAction(db, owner, { establishment_id: L1, kind: "credito_vista", fee_pct: 2, days: 1, bank_account_id: conta });
  if (!regra.ok) throw new Error(`regra de cartão: ${j(regra)}`);

  const tok = {} as Mundo["tok"];
  const pares: [keyof Mundo["tok"], Usuario][] = [["owner", owner], ["gestor", gestor], ["vend", vend], ["fin", fin]];
  for (const [k, u] of pares) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { rotulo, tenantId: t.id, db, owner, gestor, vend, fin, tok, L1, L2, reg, conta, prodId: prod.data.id, presId: pres.data.id };
}

// Rotas (import literal, para o bundler do tsx resolver os colchetes). As da entrega 4 ainda não existem.
const R = {
  estab: () => import("@/app/api/v1/emporio/establishments/[id]/route"),
  fixed: () => import("@/app/api/v1/emporio/fixed-expenses/route"),
  fixedId: () => import("@/app/api/v1/emporio/fixed-expenses/[id]/route"),
  fixedEnd: () => import("@/app/api/v1/emporio/fixed-expenses/[id]/end/route"),
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  saleReturn: () => import("@/app/api/v1/emporio/sales/[id]/return/route"),
  agreements: () => import("@/app/api/v1/emporio/customers/[id]/agreements/route"),
  purchases: () => import("@/app/api/v1/emporio/purchases/route"),
  payablesPay: () => import("@/app/api/v1/emporio/payables/pay/route"),
  today: () => import("@/app/api/v1/emporio/finance/today/route"),
  projection: () => import("@/app/api/v1/emporio/finance/projection/route"),
  aging: () => import("@/app/api/v1/emporio/finance/reports/receivables-aging/route"),
  payablesByDue: () => import("@/app/api/v1/emporio/finance/reports/payables-by-due/route"),
  cashByPlace: () => import("@/app/api/v1/emporio/finance/reports/cash-by-place/route"),
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
const chave = (p: string) => `m101-${p}-${stamp}-${(seq += 1)}`;

// --- fixtures ---

async function cliente(w: Mundo, nome: string, extra: Dado = {}) {
  const { prisma } = await import("@/lib/prisma");
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: `M101 ${nome}`, ...extra } as Dado })) as Dado;
}

const itens = (w: Mundo, qty: number) => [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: qty }];

async function vender(w: Mundo, cli: Dado, loja: string, qty: number, payments: Dado[], over: Dado = {}): Promise<string> {
  const V = await import("@/lib/actions/emporio-vendas");
  const r = await V.venderAction(w.db, w.owner, {
    operation_key: chave("venda"), establishment_id: loja, cash_register_id: w.reg[loja],
    customer_id: cli.id, items: itens(w, qty), payments, ...over,
  } as Dado);
  if (!r.ok) throw new Error(`venda de preparação: ${j(r)}`);
  return (r.data as Dado).id as string;
}

const entradaDaVenda = async (w: Mundo, vendaId: string, cli: Dado) =>
  ((await w.db.financialEntry.findFirst({ where: { related_module: "emporio", related_id: vendaId, entry_type: "income" } }))
    ?? (await w.db.financialEntry.findFirst({ where: { emporio_customer_id: cli.id, entry_type: "income" }, orderBy: { created_at: "desc" } }))) as Dado;

/** Fiado de `valor` reais (preço 10 o quilo) vencendo daqui a `venc` dias (negativo: já vencido, com a venda cinco dias antes do vencimento). */
async function fiado(w: Mundo, cli: Dado, loja: string, valor: number, venc: number): Promise<{ vendaId: string; entry: Dado }> {
  const vendaId = await vender(w, cli, loja, valor / 10, [{ kind: "fiado", amount: valor, due_date: meioDia(emDias(venc)) }],
    venc < 0 ? { sold_at: new Date(Date.now() - (-venc + 5) * DIA) } : {});
  return { vendaId, entry: await entradaDaVenda(w, vendaId, cli) };
}

const numDe = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : NaN);
/** Acha o primeiro número sob uma das chaves, em qualquer profundidade (a view do Resultado não tem o nome fixado). */
function pega(d: Dado, aliases: string[]): number {
  const fila: Dado[] = [d];
  while (fila.length) {
    const x = fila.shift();
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    for (const a of aliases) if (a in x && !Number.isNaN(numDe(x[a]))) return numDe(x[a]);
    for (const v of Object.values(x)) if (v && typeof v === "object" && !Array.isArray(v)) fila.push(v);
  }
  return NaN;
}
/** Chama o gatilho sem derrubar a seção quando ele ainda não existe (devolve -1). */
async function garantirSeguro(Dd: Dado, db: Dado, ator: Usuario, mes: { ano: number; mes: number }): Promise<number> {
  try {
    return (await Dd.garantirOcorrenciasDoMes(db, ator, mes)) as number;
  } catch {
    return -1;
  }
}
const A_FIXAS = ["fixed", "fixed_expenses", "fixas", "fixed_total"];

// ---------------------------------------------------------------------------
// Seção 2: a loja
// ---------------------------------------------------------------------------

async function secao2() {
  secaoAtual = "2";
  console.log("\nSeção 2: a loja ganha área e funcionários");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");
  const patch = (tok: string, loja: string, corpo: unknown) => chamar(tok, R.estab, "PATCH", `emporio/establishments/${loja}`, corpo, loja);
  const lojaDb = async (id: string) => (await A.db.establishment.findFirst({ where: { id } })) as Dado;

  console.log("  (a) quem grava");
  const g1 = await patch(A.tok.fin, A.L1, { area_m2: 60, employees_count: 3 });
  check("o Financeiro grava área e funcionários da Loja 1: 200", g1.status === 200, `${g1.status} ${j(g1.corpo)}`);
  check("a view traz area_m2 60 e employees_count 3", perto(g1.corpo?.data?.area_m2, 60) && g1.corpo?.data?.employees_count === 3, j(g1.corpo?.data));
  const l1 = await lojaDb(A.L1);
  check("no banco: area_m2 60 e employees_count 3", perto(n(l1?.area_m2), 60) && l1?.employees_count === 3, j([l1?.area_m2, l1?.employees_count]));
  const g2 = await patch(A.tok.fin, A.L2, { area_m2: 40, employees_count: 1 });
  check("o Financeiro grava a Loja 2 (40 m², 1 funcionário): 200", g2.status === 200, `${g2.status} ${j(g2.corpo)}`);
  const gg = await patch(A.tok.gestor, A.L1, { area_m2: 60, employees_count: 3 });
  check("o Gestor da loja também grava área e funcionários da loja dele: 200", gg.status === 200, `${gg.status} ${j(gg.corpo)}`);
  const dono = await patch(A.tok.owner, A.L1, { area_m2: 60 });
  check("o Dono grava: 200", dono.status === 200, `${dono.status} ${j(dono.corpo)}`);

  console.log("  (b) o Financeiro não grava o resto da loja");
  const nome = await patch(A.tok.fin, A.L1, { name: "Nome trocado pelo financeiro" });
  check("o Financeiro grava o nome: 403", nome.status === 403, `${nome.status} ${j(nome.corpo)}`);
  const misto = await patch(A.tok.fin, A.L1, { area_m2: 99, name: "Misto" });
  check("área junto com o nome: 403 (qualquer outro campo derruba)", misto.status === 403, `${misto.status} ${j(misto.corpo)}`);
  const depois = await lojaDb(A.L1);
  check("a recusa não gravou nada (nome e área de antes)", depois?.name === l1?.name && perto(n(depois?.area_m2), 60), j([depois?.name, depois?.area_m2]));
  const vend = await patch(A.tok.vend, A.L1, { area_m2: 10 });
  check("o Vendedor grava área: 403", vend.status === 403, `${vend.status} ${j(vend.corpo)}`);
  check("o 403 do Vendedor não mexeu na área", perto(n((await lojaDb(A.L1))?.area_m2), 60));

  console.log("  (c) as recusas do corpo");
  const neg = await patch(A.tok.fin, A.L1, { area_m2: -1 });
  check("área negativa: 422 no campo area_m2", erro(neg, 422, undefined, "area_m2"), `${neg.status} ${j(neg.corpo)}`);
  const grande = await patch(A.tok.fin, A.L1, { area_m2: 1000000 });
  check("área acima de 999.999,99: 422 no campo area_m2", erro(grande, 422, undefined, "area_m2"), `${grande.status} ${j(grande.corpo)}`);
  const frac = await patch(A.tok.fin, A.L1, { employees_count: 2.5 });
  check("funcionários 2,5: 422 no campo employees_count", erro(frac, 422, undefined, "employees_count"), `${frac.status} ${j(frac.corpo)}`);
  const negF = await patch(A.tok.fin, A.L1, { employees_count: -1 });
  check("funcionários negativo: 422 no campo employees_count", erro(negF, 422, undefined, "employees_count"), `${negF.status} ${j(negF.corpo)}`);
  const l1b = await lojaDb(A.L1);
  check("as recusas não gravaram (60 m² e 3 funcionários seguem)", perto(n(l1b?.area_m2), 60) && l1b?.employees_count === 3, j([l1b?.area_m2, l1b?.employees_count]));

  console.log("  (d) o Histórico");
  const hist = (await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "estabelecimento.editar" } })) as Dado[];
  const campos = hist.flatMap((h) => ((h.changes as Dado[]) ?? []).map((c) => c.campo));
  check("estabelecimento.editar traz o rótulo 'Área (m²)'", campos.includes("Área (m²)"), j(campos));
  check("estabelecimento.editar traz o rótulo 'Funcionários'", campos.includes("Funcionários"), j(campos));
}

// ---------------------------------------------------------------------------
// Seção 3: o rateio automático
// ---------------------------------------------------------------------------

async function secao3() {
  secaoAtual = "3";
  console.log("\nSeção 3: o rateio automático da despesa fixa");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");
  const Dd = await import("@/lib/actions/emporio-despesas");
  const Res = await import("@/lib/actions/emporio-resultado");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const patchLoja = (loja: string, corpo: unknown) => chamar(A.tok.fin, R.estab, "PATCH", `emporio/establishments/${loja}`, corpo, loja);

  const criar = (tok: string, nome: string, extra: Dado = {}) =>
    chamar(tok, R.fixed, "POST", "emporio/fixed-expenses", { name: nome, category: "M101 Aluguel", amount: 1000, due_day: 20, starts_on: `${mesCorrente}-01`, ...extra });
  const ocorrencias = async (tpl: string) => (await A.db.fixedExpenseOccurrence.findMany({ where: { template_id: tpl }, orderBy: { period: "asc" } })) as Dado[];
  /** estabelecimento -> a entrada (valor e status) da ocorrência daquele mês */
  async function doMes(tpl: string, ym: string): Promise<Record<string, { amount: number; status: string; id: string }>> {
    const out: Record<string, { amount: number; status: string; id: string }> = {};
    for (const o of await ocorrencias(tpl)) {
      if (diaDe(o.period).slice(0, 7) !== ym) continue;
      const e = (await A.db.financialEntry.findFirst({ where: { id: o.financial_entry_id } })) as Dado;
      out[o.establishment_id] = { amount: n(e?.amount), status: String(e?.status), id: String(e?.id) };
    }
    return out;
  }
  const parteDaView = (v: Dado, loja: string) => (v?.splits ?? []).find((s: Dado) => s.establishment_id === loja)?.value;
  const pagar = (ids: string[]) => chamar(A.tok.owner, R.payablesPay, "POST", "emporio/payables/pay", { entry_ids: ids, from: { bank_account_id: A.conta } });
  const cliente1 = await cliente(A, "Rateio cliente");

  // ---- o faturamento do mês anterior: L1 vendeu 400 e devolveu 100 (líquido 300), L2 vendeu 100
  const soldPrev = new Date(`${mesAnterior}-10T15:00:00Z`);
  const vL1 = await vender(A, cliente1, A.L1, 40, [{ kind: "dinheiro", amount: 400 }], { sold_at: soldPrev });
  await vender(A, cliente1, A.L2, 10, [{ kind: "dinheiro", amount: 100 }], { sold_at: soldPrev });
  const item = (await A.db.emporioSaleItem.findFirst({ where: { sale_id: vL1 } })) as Dado;
  const dev = await chamar(A.tok.owner, R.saleReturn, "POST", `emporio/sales/${vL1}/return`,
    { operation_key: chave("dev"), refund_kind: "dinheiro", cash_register_id: A.reg[A.L1], items: [{ sale_item_id: item?.id, quantity: 10 }] }, vL1);
  check("(fixture) a devolução de R$ 100 na Loja 1 foi aceita", ok2xx(dev), `${dev.status} ${j(dev.corpo)}`);
  await (prisma as Dado).emporioSaleReturn.updateMany({ where: { sale_id: vL1 }, data: { returned_at: new Date(`${mesAnterior}-12T15:00:00Z`) } });

  console.log("  (a) por faturamento do mês anterior (300 e 100: 750 e 250)");
  const rFat = await criar(A.tok.owner, "M101 Fat", { split_kind: "faturamento" });
  check("criar o modelo por faturamento (R$ 1.000, sem splits): 201", rFat.status === 201, `${rFat.status} ${j(rFat.corpo)}`);
  const vFat = rFat.corpo?.data as Dado;
  const T_fat = String(vFat?.id ?? "");
  const ocFat = await ocorrencias(T_fat);
  check("nasce só a ocorrência do mês corrente (uma por loja: 2 no total)", ocFat.length === 2 && ocFat.every((o) => diaDe(o.period).slice(0, 7) === mesCorrente), `${ocFat.length} ${j(ocFat.map((o) => diaDe(o.period)))}`);
  const fat0 = await doMes(T_fat, mesCorrente);
  check("a Loja 1 recebe 750 e a Loja 2 recebe 250 (a devolução entra na base: 300 contra 100)", perto(fat0[A.L1]?.amount, 750) && perto(fat0[A.L2]?.amount, 250), j(fat0));
  check("a view traz split_kind faturamento e months_ahead 1", vFat?.split_kind === "faturamento" && vFat?.months_ahead === 1, j([vFat?.split_kind, vFat?.months_ahead]));
  check("a view traz as partes: 750 para a Loja 1 e 250 para a Loja 2", perto(n(parteDaView(vFat, A.L1)), 750) && perto(n(parteDaView(vFat, A.L2)), 250), j(vFat?.splits));
  check("a view traz base_label citando o faturamento e avisos como lista", typeof vFat?.base_label === "string" && /faturamento/i.test(vFat.base_label) && Array.isArray(vFat?.avisos), j([vFat?.base_label, vFat?.avisos]));

  console.log("  (b) por área (60 m² e 40 m²: 600 e 400)");
  const rArea = await criar(A.tok.owner, "M101 Area", { split_kind: "area" });
  check("criar o modelo por área: 201", rArea.status === 201, `${rArea.status} ${j(rArea.corpo)}`);
  const T_area = String(rArea.corpo?.data?.id ?? "");
  const area0 = await doMes(T_area, mesCorrente);
  check("a Loja 1 recebe 600 e a Loja 2 recebe 400", perto(area0[A.L1]?.amount, 600) && perto(area0[A.L2]?.amount, 400), j(area0));
  check("a view diz months_ahead 1 e base_label", rArea.corpo?.data?.months_ahead === 1 && typeof rArea.corpo?.data?.base_label === "string", j([rArea.corpo?.data?.months_ahead, rArea.corpo?.data?.base_label]));

  console.log("  (c) por funcionários (3 e 1: 750 e 250)");
  const rFun = await criar(A.tok.owner, "M101 Func", { split_kind: "funcionarios" });
  check("criar o modelo por funcionários: 201", rFun.status === 201, `${rFun.status} ${j(rFun.corpo)}`);
  const T_fun = String(rFun.corpo?.data?.id ?? "");
  const fun0 = await doMes(T_fun, mesCorrente);
  check("a Loja 1 recebe 750 e a Loja 2 recebe 250", perto(fun0[A.L1]?.amount, 750) && perto(fun0[A.L2]?.amount, 250), j(fun0));

  console.log("  (d) percentual e valor seguem nascendo em lote de 12 meses");
  const rPerc = await criar(A.tok.owner, "M101 Perc", { amount: 500, split_kind: "percentual", splits: [{ establishment_id: A.L1, value: 60 }, { establishment_id: A.L2, value: 40 }] });
  check("percentual 60/40: 201", rPerc.status === 201, `${rPerc.status} ${j(rPerc.corpo)}`);
  check("percentual: 12 meses x 2 lojas = 24 ocorrências", (await ocorrencias(String(rPerc.corpo?.data?.id ?? "x"))).length === 24);
  const rVal = await criar(A.tok.owner, "M101 Valor", { amount: 80, split_kind: "valor", splits: [{ establishment_id: A.L1, value: 80 }] });
  check("valor em uma loja: 201", rVal.status === 201, `${rVal.status} ${j(rVal.corpo)}`);
  check("valor: 12 ocorrências", (await ocorrencias(String(rVal.corpo?.data?.id ?? "x"))).length === 12);
  const rBad = await criar(A.tok.owner, "M101 Ruim", { split_kind: "outro" });
  check("critério fora dos cinco: 422 no campo split_kind", erro(rBad, 422, undefined, "split_kind"), `${rBad.status} ${j(rBad.corpo)}`);

  console.log("  (e) o gatilho de leitura do mês seguinte, com a base daquele momento");
  const hoje = await cliente(A, "Rateio mes corrente");
  await vender(A, hoje, A.L1, 10, [{ kind: "dinheiro", amount: 100 }]);
  await vender(A, hoje, A.L2, 30, [{ kind: "dinheiro", amount: 300 }]);
  const antes = await ocorrencias(T_fat);
  check("(fixture) antes do gatilho o modelo só tem as 2 ocorrências do mês corrente", antes.length === 2, String(antes.length));
  const seg = civil(mesSeguinte);
  let gerou: unknown[] = [];
  let lancou = "";
  try {
    gerou = await Promise.all([
      (Dd as Dado).garantirOcorrenciasDoMes(A.db, A.owner, seg),
      (Dd as Dado).garantirOcorrenciasDoMes(A.db, A.owner, seg),
    ]);
  } catch (e) {
    lancou = e instanceof Error ? e.message.slice(0, 120) : String(e);
  }
  check("duas chamadas em paralelo não lançam e devolvem número", lancou === "" && gerou.length === 2 && gerou.every((x) => typeof x === "number"), lancou || j(gerou));
  const segFat = await doMes(T_fat, mesSeguinte);
  const ocSeg = (await ocorrencias(T_fat)).filter((o) => diaDe(o.period).slice(0, 7) === mesSeguinte);
  check("nasce uma ocorrência por loja no mês seguinte (2, nunca em duplicata)", ocSeg.length === 2 && Object.keys(segFat).length === 2, `${ocSeg.length} ${j(segFat)}`);
  check("a base é a daquele momento: faturamento do mês corrente (100 e 300) dá 250 e 750", perto(segFat[A.L1]?.amount, 250) && perto(segFat[A.L2]?.amount, 750), j(segFat));
  const segArea = await doMes(T_area, mesSeguinte);
  const segFun = await doMes(T_fun, mesSeguinte);
  check("os modelos por área e por funcionários também nasceram no mês seguinte (600/400 e 750/250)",
    perto(segArea[A.L1]?.amount, 600) && perto(segArea[A.L2]?.amount, 400) && perto(segFun[A.L1]?.amount, 750) && perto(segFun[A.L2]?.amount, 250), j([segArea, segFun]));
  const depoisPerc = (await ocorrencias(String(rPerc.corpo?.data?.id ?? "x"))).length;
  check("percentual não ganha ocorrência extra (segue com 24)", depoisPerc === 24, String(depoisPerc));
  await garantirSeguro(Dd, A.db, A.owner, seg);
  check("chamar de novo é idempotente (ainda 2 ocorrências do mês seguinte)", (await ocorrencias(T_fat)).filter((o) => diaDe(o.period).slice(0, 7) === mesSeguinte).length === 2);
  const hist = (await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "despesa.fixa" } })) as Dado[];
  const nasceu = hist.filter((h) => String(h.summary).includes("M101 Fat") && /nasceu/i.test(String(h.summary)));
  check("o Histórico grava UMA linha despesa.fixa 'nasceu' para o modelo (as duas chamadas não duplicam)", nasceu.length === 1, `${nasceu.length}: ${j(nasceu.map((h) => h.summary))}`);

  console.log("  (f) editar o modelo automático recalcula só a futura não paga");
  const pg = await pagar([fat0[A.L1]?.id]);
  check("(fixture) pagar a ocorrência da Loja 1 do mês corrente (750) pela conta: 201", pg.status === 201, `${pg.status} ${j(pg.corpo)}`);
  const ed = await chamar(A.tok.owner, R.fixedId, "PATCH", `emporio/fixed-expenses/${T_fat}`, { amount: 2000 }, T_fat);
  check("editar o valor de 1.000 para 2.000: 200", ed.status === 200, `${ed.status} ${j(ed.corpo)}`);
  const f1 = await doMes(T_fat, mesCorrente);
  check("a ocorrência paga fica como estava (750 e paid)", perto(f1[A.L1]?.amount, 750) && f1[A.L1]?.status === "paid", j(f1[A.L1]));
  check("a ocorrência não paga da Loja 2 é recalculada: 250 vira 500 (1/4 de 2.000)", perto(f1[A.L2]?.amount, 500) && f1[A.L2]?.status === "pending", j(f1[A.L2]));
  const f2 = await doMes(T_fat, mesSeguinte);
  check("as duas do mês seguinte (não pagas) também foram recalculadas: somam 2.000", perto((f2[A.L1]?.amount ?? 0) + (f2[A.L2]?.amount ?? 0), 2000), j(f2));

  console.log("  (g) encerrar cancela as futuras");
  const enc = await chamar(A.tok.owner, R.fixedEnd, "POST", `emporio/fixed-expenses/${T_fat}/end`, {}, T_fat);
  check("encerrar o modelo: 2xx", ok2xx(enc), `${enc.status} ${j(enc.corpo)}`);
  const g1 = await doMes(T_fat, mesSeguinte);
  check("as duas ocorrências do mês seguinte ficam canceladas", g1[A.L1]?.status === "cancelled" && g1[A.L2]?.status === "cancelled", j(g1));
  check("a paga continua paga", (await doMes(T_fat, mesCorrente))[A.L1]?.status === "paid");
  const aposSeg = civil(somaMes(mesCorrente, 2));
  await garantirSeguro(Dd, A.db, A.owner, aposSeg);
  check("modelo encerrado não gera mais nada (nenhuma ocorrência em mês +2)", (await ocorrencias(T_fat)).filter((o) => diaDe(o.period).slice(0, 7) === somaMes(mesCorrente, 2)).length === 0);

  console.log("  (h) o Resultado da Loja soma a ocorrência pelo vencimento, como um modelo em valor");
  const fixas = async () => {
    const r = await (Res as Dado).resultadoDaLojaAction(A.db, A.owner, { establishment_id: A.L2, month: mesCorrente });
    return { ok: !!r?.ok, valor: r?.ok ? pega(r.data, A_FIXAS) : NaN, detalhe: j(r).slice(0, 160) };
  };
  const f0 = await fixas();
  check("(fixture) o Resultado do mês corrente da Loja 2 traz as fixas", f0.ok && !Number.isNaN(f0.valor), f0.detalhe);
  const rAut = await criar(A.tok.owner, "M101 Resultado auto", { amount: 400, due_day: 25, split_kind: "faturamento" });
  const f1r = await fixas();
  check("a ocorrência automática da Loja 2 (1/4 de 400 = 100) entra nas fixas do mês", rAut.status === 201 && perto(f1r.valor - f0.valor, 100), `${rAut.status} ${f1r.valor - f0.valor}`);
  const rMan = await criar(A.tok.owner, "M101 Resultado valor", { amount: 100, due_day: 25, split_kind: "valor", splits: [{ establishment_id: A.L2, value: 100 }] });
  const f2r = await fixas();
  check("um modelo em valor com a mesma parte (100) soma o mesmo: a conta fecha igual", rMan.status === 201 && perto(f2r.valor - f1r.valor, 100), `${rMan.status} ${f2r.valor - f1r.valor}`);

  console.log("  (i) critério automático exige todas as lojas no alcance");
  const nTpl = await A.db.fixedExpenseTemplate.count();
  const gest = await criar(A.tok.gestor, "M101 Gestor auto", { split_kind: "faturamento" });
  check("o Gestor de uma loja só: 403 CRITERIO_SEM_LOJAS no campo split_kind", erro(gest, 403, "CRITERIO_SEM_LOJAS", "split_kind"), `${gest.status} ${j(gest.corpo)}`);
  check("a recusa não criou modelo", (await A.db.fixedExpenseTemplate.count()) === nTpl);
  const gestVal = await criar(A.tok.gestor, "M101 Gestor valor", { amount: 50, split_kind: "valor", splits: [{ establishment_id: A.L1, value: 50 }] });
  check("(controle) o mesmo Gestor cria um modelo em valor da loja dele: 201", gestVal.status === 201, `${gestVal.status} ${j(gestVal.corpo)}`);
  const vendCria = await criar(A.tok.vend, "M101 Vend auto", { split_kind: "area" });
  check("o Vendedor não cria despesa fixa: 403", vendCria.status === 403, `${vendCria.status} ${j(vendCria.corpo)}`);

  console.log("  (j) loja sem base recebe zero, e sem nenhuma base as partes são iguais");
  const l3 = await Cat.criarEstabelecimentoAction(A.db, A.owner, { name: `M101 A Loja 3 ${stamp}` });
  if (!l3.ok) throw new Error(`loja 3: ${j(l3)}`);
  const L3 = l3.data.id as string;
  const rSem = await criar(A.tok.owner, "M101 Area com L3 sem area", { split_kind: "area" });
  check("modelo por área com uma loja sem área: 201", rSem.status === 201, `${rSem.status} ${j(rSem.corpo)}`);
  const sem = await doMes(String(rSem.corpo?.data?.id ?? "x"), mesCorrente);
  check("as lojas com área recebem 600 e 400", perto(sem[A.L1]?.amount, 600) && perto(sem[A.L2]?.amount, 400), j(sem));
  check("a Loja 3 (sem área) recebe zero na view", perto(n(parteDaView(rSem.corpo?.data, L3)), 0), j(rSem.corpo?.data?.splits));
  check("avisos cita a Loja 3", (rSem.corpo?.data?.avisos ?? []).some((a: string) => a.includes(`M101 A Loja 3 ${stamp}`)), j(rSem.corpo?.data?.avisos));
  const l1Nula = await patchLoja(A.L1, { area_m2: null });
  const l2Nula = await patchLoja(A.L2, { area_m2: null });
  check("limpar a área (nulo) das duas lojas: 200", l1Nula.status === 200 && l2Nula.status === 200, `${l1Nula.status} ${l2Nula.status}`);
  const rNada = await criar(A.tok.owner, "M101 Area sem ninguem", { split_kind: "area" });
  check("modelo por área com nenhuma loja com área: 201", rNada.status === 201, `${rNada.status} ${j(rNada.corpo)}`);
  const nada = await doMes(String(rNada.corpo?.data?.id ?? "x"), mesCorrente);
  const valoresNada = Object.values(nada).map((x) => x.amount);
  check("partes iguais entre as 3 lojas: três ocorrências de 333,33 ou 333,34 que somam 1.000",
    valoresNada.length === 3 && valoresNada.every((v) => v >= 333.33 - 0.001 && v <= 333.34 + 0.001) && perto(valoresNada.reduce((s, v) => s + v, 0), 1000), j(nada));
  check("avisos diz que nenhuma loja tem base", (rNada.corpo?.data?.avisos ?? []).some((a: string) => /nenhuma loja tem base/i.test(a)), j(rNada.corpo?.data?.avisos));

  console.log("  (k) mês nascido: a loja que ganha área no meio do mês não cria parte nova");
  const somaVivas = (m: Record<string, { amount: number; status: string }>) =>
    Object.values(m).filter((x) => x.status !== "cancelled").reduce((s, x) => s + x.amount, 0);
  await patchLoja(A.L1, { area_m2: 60 });
  await patchLoja(A.L2, { area_m2: 40 });
  const rTarde = await criar(A.tok.owner, "M101 Area tarde", { split_kind: "area" });
  const T_tarde = String(rTarde.corpo?.data?.id ?? "");
  const tarde0 = await doMes(T_tarde, mesCorrente);
  check("(fixture) nasce 600 e 400, a Loja 3 (sem área) fica sem parte", rTarde.status === 201 && perto(tarde0[A.L1]?.amount, 600) && perto(tarde0[A.L2]?.amount, 400) && tarde0[L3] === undefined, `${rTarde.status} ${j(tarde0)}`);
  const pl3 = await patchLoja(L3, { area_m2: 100 });
  check("(fixture) a Loja 3 ganha 100 m²: 200", pl3.status === 200, `${pl3.status} ${j(pl3.corpo)}`);
  await (Dd as Dado).garantirOcorrenciasDoMes(A.db, A.owner, civil(mesCorrente));
  const tarde1 = await doMes(T_tarde, mesCorrente);
  check("o gatilho não cria a parte da Loja 3 no mês que já nasceu: segue 2 ocorrências somando 1.000", Object.keys(tarde1).length === 2 && perto(somaVivas(tarde1), 1000), j(tarde1));

  console.log("  (l) manual com loja que saiu do rateio, trocado para automático: a loja volta nos meses seguintes");
  const rSai = await criar(A.tok.owner, "M101 Saiu e virou", { split_kind: "percentual", splits: [{ establishment_id: A.L1, value: 50 }, { establishment_id: A.L2, value: 50 }] });
  const T_sai = String(rSai.corpo?.data?.id ?? "");
  const soL1 = await chamar(A.tok.owner, R.fixedId, "PATCH", `emporio/fixed-expenses/${T_sai}`, { split_kind: "percentual", splits: [{ establishment_id: A.L1, value: 100 }] }, T_sai);
  const virou = await chamar(A.tok.owner, R.fixedId, "PATCH", `emporio/fixed-expenses/${T_sai}`, { split_kind: "area" }, T_sai);
  check("(fixture) a Loja 2 saiu do rateio e o modelo virou área: 200 e 200", soL1.status === 200 && virou.status === 200, `${soL1.status} ${virou.status} ${j(virou.corpo)}`);
  const mais2 = somaMes(mesCorrente, 2);
  await (Dd as Dado).garantirOcorrenciasDoMes(A.db, A.owner, civil(mais2));
  const sai2 = await doMes(T_sai, mais2);
  check("no mês +2 as três lojas têm parte e a soma fecha em 1.000", Object.keys(sai2).length === 3 && perto(somaVivas(sai2), 1000), j(sai2));

  console.log("  (m) três gatilhos em paralelo deixam uma linha do Histórico");
  const nasceuDe = async (tpl: string) =>
    ((await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "despesa.fixa", target_id: tpl } })) as Dado[]).filter((h) => /nasceu/i.test(String(h.summary))).length;
  const antesLinhas = await nasceuDe(T_sai);
  const mais3 = somaMes(mesCorrente, 3);
  const tres = await Promise.all([1, 2, 3].map(() => (Dd as Dado).garantirOcorrenciasDoMes(A.db, A.owner, civil(mais3))));
  check("a soma do mês +3 fecha em 1.000 e uma só linha 'nasceu' nova", perto(somaVivas(await doMes(T_sai, mais3)), 1000) && (await nasceuDe(T_sai)) - antesLinhas === 1, `${j(tres)} ${(await nasceuDe(T_sai)) - antesLinhas}`);
}

// ---------------------------------------------------------------------------
// Seção 4: a projeção
// ---------------------------------------------------------------------------

const X = { entradaCompra8: "", cartaoHoje: 0, cartaoDez: 0, aluguelP: "M101 Aluguel P" };

type Semana = { numero: number; de: string; ate: string; receivables: Dado; payables: Dado; net: number; closing_balance: number };
const proj = (w: Mundo, tok: string, qs = "") => chamar(tok, R.projection, "GET", `emporio/finance/projection${qs}`);
const semanaDe = (v: Dado, offset: number): Semana | undefined => (v?.weeks ?? []).find((s: Semana) => s.de <= emDias(offset) && emDias(offset) <= s.ate);
const somaSemanas = (v: Dado, f: (s: Semana) => unknown) => (v?.weeks ?? []).reduce((s: number, x: Semana) => s + n(f(x)), 0);

async function secao4() {
  secaoAtual = "4";
  console.log("\nSeção 4: o fluxo de caixa projetado");
  const { P } = M!;
  const { prisma } = await import("@/lib/prisma");
  void prisma;

  // ---- fixtures
  const c1 = await cliente(P, "Proj vencido");
  await fiado(P, c1, P.L1, 30, -3);
  const c2 = await cliente(P, "Proj vence 20");
  await fiado(P, c2, P.L1, 50, 20);
  const c3 = await cliente(P, "Proj acordo");
  const f3 = await fiado(P, c3, P.L1, 40, 10);
  const ac = await chamar(P.tok.fin, R.agreements, "POST", `emporio/customers/${c3.id}/agreements`,
    { entry_ids: [f3.entry.id], installments: [{ due_date: emDias(0), amount: 20 }, { due_date: emDias(35), amount: 20 }] }, c3.id);
  check("(fixture) acordo de 40 em 2 parcelas (hoje e daqui a 35 dias): 201", ac.status === 201, `${ac.status} ${j(ac.corpo)}`);
  const parcelas = (await P.db.financialEntry.findMany({ where: { agreement_id: String(ac.corpo?.data?.id ?? "x"), category: "Acordo de fiado", status: { not: "cancelled" } }, orderBy: { due_date: "asc" } })) as Dado[];
  if (parcelas[0]?.id) await P.db.financialEntry.update({ where: { id: parcelas[0].id }, data: { due_date: meioDia(emDias(-20)) } });
  const c4 = await cliente(P, "Proj loja 2");
  await fiado(P, c4, P.L2, 10, 2);

  const cCard = await cliente(P, "Proj cartao");
  await vender(P, cCard, P.L1, 10, [{ kind: "credito_vista", amount: 100 }], { sold_at: new Date(Date.now() - DIA) });
  await vender(P, cCard, P.L1, 20, [{ kind: "credito_vista", amount: 200 }]);
  const cartoes = (await P.db.cardReceivable.findMany({ where: { canceled_at: null }, orderBy: { created_at: "asc" } })) as Dado[];
  check("(fixture) existem duas parcelas de cartão", cartoes.length === 2, String(cartoes.length));
  await P.db.cardReceivable.update({ where: { id: cartoes[0].id }, data: { expected_on: meioDia(emDias(0)) } });
  await P.db.cardReceivable.update({ where: { id: cartoes[1].id }, data: { expected_on: meioDia(emDias(10)) } });
  X.cartaoHoje = n(cartoes[0].net_amount);
  X.cartaoDez = n(cartoes[1].net_amount);

  await vender(P, cCard, P.L1, 6, [{ kind: "cheque", amount: 60, check: { number: "M101-1", bank: "Banco M101", good_for: meioDia(emDias(40)) } }]);
  await vender(P, cCard, P.L1, 3, [{ kind: "cheque", amount: 30, check: { number: "M101-2", bank: "Banco M101", good_for: meioDia(emDias(3)) } }]);
  await (prisma as Dado).emporioCheck.updateMany({ where: { tenant_id: P.tenantId, number: "M101-2" }, data: { status: "compensado" } });

  const compra = async (valor: number, venc: number) => {
    const r = await chamar(P.tok.owner, R.purchases, "POST", "emporio/purchases", {
      operation_key: chave("compra"), establishment_id: P.L1, purchased_at: new Date().toISOString(), received: false,
      items: [{ emporio_product_id: P.prodId, presentation_id: P.presId, quantity: 1, item_total: valor }],
      payment: { kind: "a_prazo", due_date: `${emDias(venc)}T12:00:00Z` },
    });
    if (!ok2xx(r)) throw new Error(`compra: ${r.status} ${j(r.corpo)}`);
    return (await P.db.financialEntry.findFirst({ where: { related_module: "emporio", related_id: String(r.corpo?.data?.id), entry_type: "expense" } })) as Dado;
  };
  const eVencida = await compra(70, 5);
  await P.db.financialEntry.update({ where: { id: eVencida.id }, data: { due_date: meioDia(emDias(-2)) } });
  const e8 = await compra(150, 8);
  X.entradaCompra8 = String(e8?.id ?? "");
  const fx = await chamar(P.tok.owner, R.fixed, "POST", "emporio/fixed-expenses", {
    name: X.aluguelP, category: "M101 Aluguel P", amount: 100, due_day: Number(emDias(3).slice(8)), starts_on: `${emDias(3).slice(0, 7)}-01`,
    split_kind: "valor", splits: [{ establishment_id: P.L1, value: 100 }],
  });
  check("(fixture) a despesa fixa de 100 vencendo daqui a 3 dias: 201", fx.status === 201, `${fx.status} ${j(fx.corpo)}`);

  console.log("  (a) o formato e o saldo de hoje");
  const hj = await chamar(P.tok.fin, R.today, "GET", "emporio/finance/today");
  const p30 = await proj(P, P.tok.fin, "?days=30");
  const v30 = p30.corpo?.data as Dado;
  check("o Financeiro lê a projeção de 30 dias: 200", p30.status === 200, `${p30.status} ${j(p30.corpo).slice(0, 200)}`);
  check("today é o dia de São Paulo, days 30 e establishment_id nulo", v30?.today === hojeStr && v30?.days === 30 && v30?.establishment_id === null, j([v30?.today, v30?.days, v30?.establishment_id]));
  check("30 dias dão 5 semanas, de hoje a hoje + 29", v30?.weeks?.length === 5 && v30?.weeks?.[0]?.de === hojeStr && v30?.weeks?.[4]?.ate === emDias(29), j((v30?.weeks ?? []).map((s: Semana) => [s.de, s.ate])));
  check("o saldo de hoje é o total_balance do Hoje", perto(v30?.opening_balance, n(hj.corpo?.data?.total_balance)), `${v30?.opening_balance} vs ${hj.corpo?.data?.total_balance}`);
  const semPadrao = await proj(P, P.tok.fin);
  check("sem days, o padrão é 30 (5 semanas)", semPadrao.status === 200 && semPadrao.corpo?.data?.days === 30 && semPadrao.corpo?.data?.weeks?.length === 5, `${semPadrao.status}`);
  const dono = await proj(P, P.tok.owner, "?days=30");
  check("o Dono também lê: 200", dono.status === 200, `${dono.status}`);

  console.log("  (b) a receber: fiado, acordo, cartão e cheque");
  const s1 = v30?.weeks?.[0] as Semana;
  check("semana 1, fiado: o vencido de 30, a parcela de acordo vencida de 20 e o fiado da Loja 2 (10) somam 60", perto(s1?.receivables?.fiado, 60), j(s1?.receivables));
  const s3 = semanaDe(v30, 20);
  check("o fiado que vence em 20 dias cai na semana 3 (14 a 20): 50", s3?.numero === 3 && perto(s3?.receivables?.fiado, 50), j(s3));
  check("a parcela de acordo de daqui a 35 dias não entra na janela de 30", perto(somaSemanas(v30, (s) => s.receivables?.fiado), 110), String(somaSemanas(v30, (s) => s.receivables?.fiado)));
  check("o cartão que vence hoje NÃO entra (já está no saldo): semana 1 sem cartão", perto(s1?.receivables?.cards, 0), j(s1?.receivables));
  const s2 = semanaDe(v30, 10);
  check("o cartão que vence em 10 dias entra na semana 2, pelo líquido", s2?.numero === 2 && perto(s2?.receivables?.cards, X.cartaoDez), `${j(s2?.receivables)} esperado ${X.cartaoDez}`);
  check("só uma parcela de cartão aparece na janela (a de hoje fica de fora)", perto(somaSemanas(v30, (s) => s.receivables?.cards), X.cartaoDez), String(somaSemanas(v30, (s) => s.receivables?.cards)));
  check("o cheque de 40 dias não aparece na janela de 30, e o compensado de 25 não entra nunca", perto(somaSemanas(v30, (s) => s.receivables?.checks), 0), String(somaSemanas(v30, (s) => s.receivables?.checks)));
  const p60 = await proj(P, P.tok.fin, "?days=60");
  const v60 = p60.corpo?.data as Dado;
  check("60 dias: 200 com 9 semanas", p60.status === 200 && v60?.weeks?.length === 9, `${p60.status} ${v60?.weeks?.length}`);
  const s6 = semanaDe(v60, 40);
  check("o cheque recebido com good_for em 40 dias entra na semana 6 (35 a 41) do período de 60: 60", s6?.numero === 6 && perto(s6?.receivables?.checks, 60), j(s6));
  check("a parcela de acordo de 35 dias entra na mesma semana 6: fiado 20", perto(s6?.receivables?.fiado, 20), j(s6?.receivables));
  check("o total de cheques na janela de 60 é só o de 60 (o compensado segue fora)", perto(somaSemanas(v60, (s) => s.receivables?.checks), 60));
  const p90 = await proj(P, P.tok.fin, "?days=90");
  check("90 dias: 200 com 13 semanas", p90.status === 200 && p90.corpo?.data?.weeks?.length === 13, `${p90.status} ${p90.corpo?.data?.weeks?.length}`);

  console.log("  (c) a pagar");
  check("semana 1, a pagar: a conta vencida (70) e a despesa fixa que vence daqui a 3 dias (100)", perto(s1?.payables?.entries, 170), j(s1?.payables));
  check("semana 2, a pagar: a conta que vence em 8 dias (150)", perto(s2?.payables?.entries, 150), j(s2?.payables));
  check("nenhuma estimativa de despesa fixa onde não há modelo automático", perto(somaSemanas(v30, (s) => s.payables?.fixed_estimated), 0));

  console.log("  (d) a conta fecha: o saldo projetado de cada semana");
  for (const [rotulo, v] of [["30", v30], ["60", v60], ["90", p90.corpo?.data as Dado]] as [string, Dado][]) {
    let anterior = n(v?.opening_balance);
    let fecha = (v?.weeks ?? []).length > 0;
    let totaisOk = (v?.weeks ?? []).length > 0;
    let detalhe = "";
    for (const s of (v?.weeks ?? []) as Semana[]) {
      const rec = n(s.receivables?.total);
      const pag = n(s.payables?.total);
      if (!perto(s.closing_balance, anterior + rec - pag) || !perto(s.net, rec - pag)) {
        fecha = false;
        detalhe = `semana ${s.numero}: ${j(s)}`;
      }
      if (!perto(rec, n(s.receivables?.fiado) + n(s.receivables?.cards) + n(s.receivables?.checks)) || !perto(pag, n(s.payables?.entries) + n(s.payables?.fixed_estimated))) totaisOk = false;
      anterior = n(s.closing_balance);
    }
    check(`${rotulo} dias: cada semana fecha com o anterior mais recebimentos menos pagamentos`, fecha, detalhe);
    check(`${rotulo} dias: o total de cada lado é a soma das partes e o closing_balance é o da última semana`, totaisOk && perto(v?.closing_balance, anterior), j([v?.closing_balance, anterior]));
  }
  check("a semana 1 parte do saldo de hoje: closing = abertura + 60 - 170", perto(s1?.closing_balance, n(v30?.opening_balance) + n(s1?.receivables?.total) - n(s1?.payables?.total)));

  console.log("  (e) por loja");
  const pL2 = await proj(P, P.tok.fin, `?days=30&establishment_id=${P.L2}`);
  const vL2 = pL2.corpo?.data as Dado;
  check("a Loja 2: 200 com establishment_id preenchido", pL2.status === 200 && vL2?.establishment_id === P.L2, `${pL2.status} ${j(pL2.corpo).slice(0, 200)}`);
  check("a Loja 2 só tem o fiado dela (10, semana 1) e nada a pagar", perto(somaSemanas(vL2, (s) => s.receivables?.fiado), 10) && perto(somaSemanas(vL2, (s) => s.payables?.total), 0), j(vL2?.weeks?.[0]));
  check("o saldo da Loja 2 é gaveta mais gerência dela: zero", perto(vL2?.opening_balance, 0), String(vL2?.opening_balance));
  check("notes avisa que a conta bancária só entra em Todas as lojas", (vL2?.notes ?? []).some((x: string) => /conta banc[aá]ria/i.test(x)), j(vL2?.notes));
  const pL1 = await proj(P, P.tok.fin, `?days=30&establishment_id=${P.L1}`);
  const vL1 = pL1.corpo?.data as Dado;
  check("o saldo da Loja 1 é gaveta (200) mais gerência (50): 250, sem a conta bancária", pL1.status === 200 && perto(vL1?.opening_balance, 250), `${pL1.status} ${vL1?.opening_balance}`);
  check("a Loja 1 não traz o fiado da Loja 2 (semana 1 com 50)", perto(vL1?.weeks?.[0]?.receivables?.fiado, 50), j(vL1?.weeks?.[0]?.receivables));

  console.log("  (f) as recusas");
  const d45 = await proj(P, P.tok.fin, "?days=45");
  check("days 45: 422 no campo days", erro(d45, 422, undefined, "days"), `${d45.status} ${j(d45.corpo)}`);
  const dAbc = await proj(P, P.tok.fin, "?days=abc");
  check("days abc: 422 no campo days", erro(dAbc, 422, undefined, "days"), `${dAbc.status} ${j(dAbc.corpo)}`);
  const dV = await proj(P, P.tok.vend, "?days=30");
  check("o Vendedor não lê a projeção: 403", dV.status === 403, `${dV.status} ${j(dV.corpo)}`);
}

async function secao4Estimativa() {
  secaoAtual = "4";
  console.log("\nSeção 4 (cont.): a despesa fixa que ainda não nasceu entra como estimativa");
  const { E } = M!;
  const Dd = await import("@/lib/actions/emporio-despesas");
  const cf = await chamar(E.tok.owner, R.fixed, "POST", "emporio/fixed-expenses", {
    name: "M101 Aluguel E", category: "M101 Aluguel E", amount: 1000, due_day: 15, starts_on: `${mesCorrente}-01`, split_kind: "faturamento",
  });
  check("(fixture) o modelo por faturamento de R$ 1.000 (vencimento dia 15): 201", cf.status === 201, `${cf.status} ${j(cf.corpo)}`);
  const tpl = String(cf.corpo?.data?.id ?? "");
  const fim = emDias(89);
  const meses = [1, 2, 3].map((k) => somaMes(mesCorrente, k)).filter((ym) => `${ym}-15` <= fim && `${ym}-15` >= hojeStr);
  const p90 = await proj(E, E.tok.fin, "?days=90");
  const v90 = p90.corpo?.data as Dado;
  check("a projeção de 90 dias: 200", p90.status === 200, `${p90.status} ${j(p90.corpo).slice(0, 200)}`);
  check(`cada mês seguinte dentro da janela (${meses.length}) entra com R$ 1.000, e o mês corrente não ganha estimativa`,
    perto(somaSemanas(v90, (s) => s.payables?.fixed_estimated), 1000 * meses.length), `${somaSemanas(v90, (s) => s.payables?.fixed_estimated)} esperado ${1000 * meses.length}`);
  const sem1 = (v90?.weeks ?? []).find((s: Semana) => s.de <= `${meses[0]}-15` && `${meses[0]}-15` <= s.ate) as Semana | undefined;
  check("a estimativa do mês seguinte cai na semana do vencimento (dia 15)", !!sem1 && n(sem1.payables?.fixed_estimated) >= 1000 - 0.01, j(sem1?.payables));
  check("notes explica que o rateio automático dos meses seguintes é estimativa", (v90?.notes ?? []).some((x: string) => /estimativa/i.test(x)), j(v90?.notes));
  check("a estimativa entra no total a pagar da semana", !!sem1 && perto(sem1.payables?.total, n(sem1.payables?.entries) + n(sem1.payables?.fixed_estimated)), j(sem1?.payables));

  console.log("  o mês que já tem ocorrência não ganha estimativa");
  const nasc = await garantirSeguro(Dd, E.db, E.owner, civil(mesSeguinte));
  check("(fixture) a ocorrência do mês seguinte nasce (uma por loja)", typeof nasc === "number" && (await E.db.fixedExpenseOccurrence.count({ where: { template_id: tpl } })) === 4, String(nasc));
  const depois = await proj(E, E.tok.fin, "?days=90");
  const vd = depois.corpo?.data as Dado;
  const vencSeg = `${mesSeguinte}-15`;
  const semSeg = (vd?.weeks ?? []).find((s: Semana) => s.de <= vencSeg && vencSeg <= s.ate) as Semana | undefined;
  const restantes = meses.filter((ym) => ym !== mesSeguinte);
  check("a estimativa total cai 1.000 (só os meses sem ocorrência seguem estimados)", perto(somaSemanas(vd, (s) => s.payables?.fixed_estimated), 1000 * restantes.length), `${somaSemanas(vd, (s) => s.payables?.fixed_estimated)} esperado ${1000 * restantes.length}`);
  check("a ocorrência que nasceu aparece como conta a pagar (entries) na semana do vencimento", !!semSeg && n(semSeg.payables?.entries) >= 1000 - 0.01, j(semSeg?.payables));
}

/** Despesas fixas automáticas na projeção (depois da revisão da Task 4): base de hoje, mês nascido, troca de critério. */
async function secao4Fixas() {
  secaoAtual = "4";
  console.log("\nSeção 4 (cont.): a estimativa das fixas automáticas, depois da revisão");
  const { F } = M!;
  const fim = emDias(89);
  const meses28 = [1, 2, 3].map((k) => somaMes(mesCorrente, k)).filter((ym) => `${ym}-28` <= fim).length;
  const estimado = async (qs = "") => somaSemanas((await proj(F, F.tok.fin, `?days=90${qs}`)).corpo?.data, (s) => s.payables?.fixed_estimated);
  const criar = async (name: string, split_kind: string, amount: number, extra: Dado = {}) => {
    const r = await chamar(F.tok.owner, R.fixed, "POST", "emporio/fixed-expenses", {
      name, category: name, amount, due_day: 28, starts_on: `${mesCorrente}-01`, split_kind, ...extra,
    });
    check(`(fixture) ${name}: 201`, r.status === 201, `${r.status} ${j(r.corpo)}`);
    return String(r.corpo?.data?.id ?? "");
  };

  console.log("  (a) a base de hoje, por loja, e não a do mês estimado");
  const cli = await cliente(F, "Fixas faturamento");
  await vender(F, cli, F.L1, 10, [{ kind: "dinheiro", amount: 100 }], { sold_at: new Date(`${mesAnterior}-10T12:00:00Z`) });
  await vender(F, cli, F.L2, 10, [{ kind: "dinheiro", amount: 100 }]);
  const antesL1 = await estimado(`&establishment_id=${F.L1}`);
  const antesL2 = await estimado(`&establishment_id=${F.L2}`);
  await criar("M101 Fixa faturamento", "faturamento", 1000);
  const depoisL1 = await estimado(`&establishment_id=${F.L1}`);
  const depoisL2 = await estimado(`&establishment_id=${F.L2}`);
  check("a base de hoje é o faturamento do mês anterior (só a Loja 1): ela leva tudo em cada mês seguinte", perto(depoisL1 - antesL1, 1000 * meses28), `${depoisL1 - antesL1} esperado ${1000 * meses28}`);
  check("a Loja 2 (sem faturamento no mês anterior) não leva nada, apesar de vender neste mês", perto(depoisL2 - antesL2, 0), String(depoisL2 - antesL2));

  console.log("  (b) mês nascido não ganha estimativa quando uma loja ganha base depois");
  const Dd = await import("@/lib/actions/emporio-despesas");
  await F.db.establishment.update({ where: { id: F.L1 }, data: { area_m2: 60 } });
  const antesTodas = await estimado();
  await criar("M101 Fixa area", "area", 1000);
  const nasc = await garantirSeguro(Dd, F.db, F.owner, civil(mesCorrente));
  check("(fixture) o gatilho do mês corrente roda", nasc >= 0, String(nasc));
  await F.db.establishment.update({ where: { id: F.L2 }, data: { area_m2: 100 } });
  const depoisTodas = await estimado();
  check("a Loja 2 ganhou área depois do mês nascer: só os meses seguintes são estimados (nada por cima da conta real do mês corrente)", perto(depoisTodas - antesTodas, 1000 * meses28), `${depoisTodas - antesTodas} esperado ${1000 * meses28}`);

  console.log("  (c) a troca de manual para automático não faz os meses seguintes sumirem");
  const antesTroca = await estimado();
  const man = await criar("M101 Fixa manual", "valor", 600, { splits: [{ establishment_id: F.L1, value: 600 }] });
  const comManual = await estimado();
  check("(fixture) o modelo manual não é estimado (as contas dos meses seguintes já existem)", perto(comManual - antesTroca, 0), String(comManual - antesTroca));
  const tr = await chamar(F.tok.owner, R.fixedId, "PATCH", `emporio/fixed-expenses/${man}`, { split_kind: "area" }, man);
  check("(fixture) trocar o modelo para área: 200", tr.status === 200, `${tr.status} ${j(tr.corpo)}`);
  const apos = await estimado();
  check("depois da troca, cada mês seguinte da janela é estimado com 600", perto(apos - comManual, 600 * meses28), `${apos - comManual} esperado ${600 * meses28}`);
}

/** Achados do juiz da rodada 1: mês futuro fechado na troca de critério, estimativa da manual, teto de contas, funcionários. */
async function secao4Juiz() {
  secaoAtual = "4";
  console.log("\nSeção 4 (cont.): os achados do juiz (mês fechado, manual estimada, teto, funcionários)");
  const { F } = M!;
  const Dd = await import("@/lib/actions/emporio-despesas");
  const soma = (xs: Dado[]) => xs.reduce((s, x) => s + n(x.amount), 0);
  const doMes = async (tpl: string, ym: string) => {
    const ocs = (await F.db.fixedExpenseOccurrence.findMany({ where: { template_id: tpl }, include: { financial_entry: true } })) as Dado[];
    return ocs.filter((o) => diaDe(o.period).slice(0, 7) === ym).map((o) => o.financial_entry as Dado);
  };

  console.log("  (a) manual com ocorrência futura paga, trocado para área: o mês fechado soma o valor do modelo");
  const cf = await chamar(F.tok.owner, R.fixed, "POST", "emporio/fixed-expenses", {
    name: "M101 Fixa fechada", category: "M101 Fixa fechada", amount: 1000, due_day: 20, starts_on: `${mesCorrente}-01`,
    split_kind: "valor", splits: [{ establishment_id: F.L1, value: 750 }, { establishment_id: F.L2, value: 250 }],
  });
  check("(fixture) o modelo manual de R$ 1.000: 201", cf.status === 201, `${cf.status} ${j(cf.corpo)}`);
  const tpl = String(cf.corpo?.data?.id ?? "");
  const antes = (await doMes(tpl, mesSeguinte)) as Dado[];
  const paga = antes.find((e) => perto(n(e.amount), 250));
  check("(fixture) o mês seguinte tem duas contas (750 e 250)", antes.length === 2 && !!paga, j(antes.map((e) => e.amount)));
  const pg = await chamar(F.tok.owner, R.payablesPay, "POST", "emporio/payables/pay", { entry_ids: [String(paga?.id)], from: { bank_account_id: F.conta } });
  check("(fixture) a conta futura de 250 é paga: 2xx", ok2xx(pg), `${pg.status} ${j(pg.corpo)}`);
  const ocsAntes = await F.db.fixedExpenseOccurrence.count({ where: { template_id: tpl } });
  const tr = await chamar(F.tok.owner, R.fixedId, "PATCH", `emporio/fixed-expenses/${tpl}`, { split_kind: "area" }, tpl);
  check("(fixture) trocar para área: 200", tr.status === 200, `${tr.status} ${j(tr.corpo)}`);
  await garantirSeguro(Dd, F.db, F.owner, civil(mesSeguinte));
  const depois = await doMes(tpl, mesSeguinte);
  const vivas = depois.filter((e) => e.status !== "cancelled");
  check("o mês seguinte segue somando 1.000 (a paga de 250 e a irmã de 750 como parte manual)", perto(soma(vivas), 1000) && vivas.length === 2, j(depois.map((e) => `${e.amount} ${e.status}`)));
  check("a irmã não foi cancelada nem refeita", depois.every((e) => e.status !== "cancelled"), j(depois.map((e) => e.status)));
  check("nada nasceu: o número de ocorrências é o mesmo", (await F.db.fixedExpenseOccurrence.count({ where: { template_id: tpl } })) === ocsAntes);

  console.log("  (a2) manual com a conta do MÊS CORRENTE já paga, trocado para área: o mês corrente também é fechado (juiz, rodada 2)");
  const cf2 = await chamar(F.tok.owner, R.fixed, "POST", "emporio/fixed-expenses", {
    name: "M101 Fixa fechada hoje", category: "M101 Fixa fechada hoje", amount: 1000, due_day: 20, starts_on: `${mesCorrente}-01`,
    split_kind: "valor", splits: [{ establishment_id: F.L1, value: 750 }, { establishment_id: F.L2, value: 250 }],
  });
  check("(fixture) o segundo modelo manual de R$ 1.000: 201", cf2.status === 201, `${cf2.status} ${j(cf2.corpo)}`);
  const tpl2 = String(cf2.corpo?.data?.id ?? "");
  const hojeAntes = (await doMes(tpl2, mesCorrente)) as Dado[];
  const pagaHoje = hojeAntes.find((e) => perto(n(e.amount), 250));
  check("(fixture) o mês corrente tem duas contas (750 e 250)", hojeAntes.length === 2 && !!pagaHoje, j(hojeAntes.map((e) => e.amount)));
  const pg2 = await chamar(F.tok.owner, R.payablesPay, "POST", "emporio/payables/pay", { entry_ids: [String(pagaHoje?.id)], from: { bank_account_id: F.conta } });
  check("(fixture) a conta de 250 do mês corrente é paga: 2xx", ok2xx(pg2), `${pg2.status} ${j(pg2.corpo)}`);
  const ocsAntes2 = await F.db.fixedExpenseOccurrence.count({ where: { template_id: tpl2 } });
  const tr2 = await chamar(F.tok.owner, R.fixedId, "PATCH", `emporio/fixed-expenses/${tpl2}`, { split_kind: "area" }, tpl2);
  check("(fixture) trocar para área: 200", tr2.status === 200, `${tr2.status} ${j(tr2.corpo)}`);
  await garantirSeguro(Dd, F.db, F.owner, civil(mesCorrente));
  const hojeDepois = await doMes(tpl2, mesCorrente);
  const vivasHoje = hojeDepois.filter((e) => e.status !== "cancelled");
  check("o mês corrente segue somando 1.000 (a paga de 250 e a irmã de 750 intactas)", perto(soma(vivasHoje), 1000) && vivasHoje.length === 2, j(hojeDepois.map((e) => `${e.amount} ${e.status}`)));
  check("a irmã do mês corrente não foi recalculada (continua 750)", vivasHoje.some((e) => perto(n(e.amount), 750)), j(vivasHoje.map((e) => e.amount)));
  check("nada nasceu no mês corrente: o número de ocorrências é o mesmo", (await F.db.fixedExpenseOccurrence.count({ where: { template_id: tpl2 } })) === ocsAntes2);

  console.log("  (b) manual cujo lote de 12 meses acabou: a projeção estima os meses sem conta com as partes dos splits");
  const fim = emDias(89);
  const meses28 = [1, 2, 3].map((k) => somaMes(mesCorrente, k)).filter((ym) => `${ym}-28` <= fim).length;
  const estimado = async (qs = "") => somaSemanas((await proj(F, F.tok.fin, `?days=90${qs}`)).corpo?.data, (s) => s.payables?.fixed_estimated);
  const e0 = await estimado();
  const e0L1 = await estimado(`&establishment_id=${F.L1}`);
  const velha = await chamar(F.tok.owner, R.fixed, "POST", "emporio/fixed-expenses", {
    name: "M101 Fixa lote acabou", category: "M101 Fixa lote acabou", amount: 700, due_day: 28, starts_on: `${somaMes(mesCorrente, -11)}-01`,
    split_kind: "valor", splits: [{ establishment_id: F.L1, value: 400 }, { establishment_id: F.L2, value: 300 }],
  });
  check("(fixture) o modelo manual com início 11 meses atrás: 201", velha.status === 201, `${velha.status} ${j(velha.corpo)}`);
  const e1 = await estimado();
  const e1L1 = await estimado(`&establishment_id=${F.L1}`);
  check("cada mês seguinte da janela sem conta é estimado com 700 (as partes dos splits)", perto(e1 - e0, 700 * meses28), `${e1 - e0} esperado ${700 * meses28}`);
  check("filtrado pela Loja 1, só a parte dela (400)", perto(e1L1 - e0L1, 400 * meses28), `${e1L1 - e0L1} esperado ${400 * meses28}`);
  const nota = ((await proj(F, F.tok.fin, "?days=90")).corpo?.data?.notes ?? []) as string[];
  check("notes diz que as fixas dos meses sem conta gerada são estimativa", nota.some((x) => x.includes("Despesas fixas dos meses sem conta gerada são estimativa")), j(nota));

  console.log("  (c) o limit 5000 da lista de contas a pagar");
  const quantas = await Dd.lerQuantidadeDeContasAPagar(F.db, F.owner, { status: "pending" });
  const padrao = await Dd.listarContasAPagarAction(F.db, F.owner, { status: "pending" });
  const cheia = await Dd.listarContasAPagarAction(F.db, F.owner, { status: "pending", limit: 5000 });
  const alem = await Dd.listarContasAPagarAction(F.db, F.owner, { status: "pending", limit: 99999 });
  check("limit 5000 devolve todas as pendentes, e o padrão (200) é o de antes", cheia.ok && quantas.ok && padrao.ok && cheia.data.length === quantas.data && padrao.data.length === Math.min(200, quantas.data), `${cheia.ok && cheia.data.length} ${quantas.ok && quantas.data}`);
  check("limit acima do teto é cortado em 5000, sem erro", alem.ok && alem.data.length <= 5000);
  const rotaLim = await chamar(F.tok.owner, () => import("@/app/api/v1/emporio/payables/route"), "GET", "emporio/payables?status=pending&limit=5000");
  check("a rota segue com o teto dela (500)", rotaLim.status === 200 && (rotaLim.corpo?.data ?? []).length <= 500, `${rotaLim.status}`);

  console.log("  (d) funcionários com teto");
  const fx = await chamar(F.tok.owner, R.estab, "PATCH", `emporio/establishments/${F.L1}`, { employees_count: 3000000000 }, F.L1);
  check("3 bilhões de funcionários: 422 em employees_count, em português", erro(fx, 422, "VALIDATION_ERROR", "employees_count") && /100\.000/.test(String(fx.corpo?.error?.message)), `${fx.status} ${j(fx.corpo)}`);
  const fy = await chamar(F.tok.owner, R.estab, "PATCH", `emporio/establishments/${F.L1}`, { employees_count: 100001 }, F.L1);
  check("100.001 funcionários: 422", erro(fy, 422, "VALIDATION_ERROR", "employees_count"), `${fy.status} ${j(fy.corpo)}`);
}

// ---------------------------------------------------------------------------
// Seção 5: os relatórios
// ---------------------------------------------------------------------------

async function secao5() {
  secaoAtual = "5";
  console.log("\nSeção 5: os três relatórios");
  const { P } = M!;
  const aging = (tok: string, qs = "") => chamar(tok, R.aging, "GET", `emporio/finance/reports/receivables-aging${qs}`);
  const porVenc = (tok: string, qs = "") => chamar(tok, R.payablesByDue, "GET", `emporio/finance/reports/payables-by-due${qs}`);
  const porLugar = (tok: string, qs = "") => chamar(tok, R.cashByPlace, "GET", `emporio/finance/reports/cash-by-place${qs}`);

  console.log("  (a) a receber por idade");
  const cDia = await cliente(P, "Aging em dia");
  await fiado(P, cDia, P.L1, 40, 5);
  const c10 = await cliente(P, "Aging 10");
  await fiado(P, c10, P.L1, 10, -10);
  const c20 = await cliente(P, "Aging 20");
  await fiado(P, c20, P.L1, 20, -20);
  const c45 = await cliente(P, "Aging 45");
  await fiado(P, c45, P.L1, 30, -45);
  const ra = await aging(P.tok.fin);
  const va = ra.corpo?.data as Dado;
  check("o Financeiro lê o a receber por idade: 200 com today", ra.status === 200 && va?.today === hojeStr, `${ra.status} ${j(ra.corpo).slice(0, 200)}`);
  const linha = (nome: string) => (va?.customers ?? []).find((c: Dado) => c.customer_name === `M101 ${nome}`) as Dado;
  const so = (l: Dado, faixa: string, valor: number) =>
    ["em_dia", "1-15", "16-30", "30+"].every((f) => perto(l?.[f], f === faixa ? valor : 0)) && perto(l?.total, valor);
  check("o cliente em dia cai só em em_dia (40)", so(linha("Aging em dia"), "em_dia", 40), j(linha("Aging em dia")));
  check("10 dias de atraso: só na faixa 1-15 (10)", so(linha("Aging 10"), "1-15", 10), j(linha("Aging 10")));
  check("20 dias de atraso: só na faixa 16-30 (20)", so(linha("Aging 20"), "16-30", 20), j(linha("Aging 20")));
  check("45 dias de atraso: só na faixa 30+ (30)", so(linha("Aging 45"), "30+", 30), j(linha("Aging 45")));
  check("a linha do cliente traz customer_id e phone", !!linha("Aging 10")?.customer_id && "phone" in (linha("Aging 10") ?? {}), j(linha("Aging 10")));
  const t = va?.totals ?? {};
  check("totais por faixa: em dia 120, 1-15 40, 16-30 40, 30+ 30", perto(t.em_dia, 120) && perto(t["1-15"], 40) && perto(t["16-30"], 40) && perto(t["30+"], 30), j(t));
  check("o total geral é 230 e é a soma das faixas", perto(t.total, 230) && perto(t.total, n(t.em_dia) + n(t["1-15"]) + n(t["16-30"]) + n(t["30+"])), j(t));
  check("o total por cliente soma o total geral", perto((va?.customers ?? []).reduce((s: number, c: Dado) => s + n(c.total), 0), n(t.total)));
  const totais = (va?.customers ?? []).map((c: Dado) => n(c.total));
  check("os clientes vêm ordenados pelo total, do maior para o menor", totais.length > 0 && totais.every((x: number, i: number) => i === 0 || totais[i - 1] >= x), j(totais));
  check("a parcela de acordo vencida (20, 20 dias) entra como atraso do cliente do acordo", perto(linha("Proj acordo")?.["16-30"], 20) && perto(linha("Proj acordo")?.em_dia, 20), j(linha("Proj acordo")));
  const raL2 = await aging(P.tok.fin, `?establishment_id=${P.L2}`);
  check("filtro pela Loja 2: só o cliente dela, total 10", raL2.status === 200 && raL2.corpo?.data?.customers?.length === 1 && perto(raL2.corpo?.data?.totals?.total, 10), `${raL2.status} ${j(raL2.corpo).slice(0, 200)}`);
  const raL1 = await aging(P.tok.fin, `?establishment_id=${P.L1}`);
  check("filtro pela Loja 1: 220 (sem o fiado da Loja 2)", raL1.status === 200 && perto(raL1.corpo?.data?.totals?.total, 220), `${raL1.status} ${j(raL1.corpo?.data?.totals)}`);
  const raV = await aging(P.tok.vend);
  check("o Vendedor não lê o a receber por idade: 403", raV.status === 403, `${raV.status}`);

  console.log("  (b) a pagar por vencimento");
  const de = emDias(-14);
  const ate = emDias(30);
  const rp = await porVenc(P.tok.fin, `?de=${de}&ate=${ate}`);
  const vp = rp.corpo?.data as Dado;
  check("o Financeiro lê o a pagar por vencimento: 200", rp.status === 200, `${rp.status} ${j(rp.corpo).slice(0, 200)}`);
  const semana = (off: number) => (vp?.weeks ?? []).find((s: Dado) => s.de <= emDias(off) && emDias(off) <= s.ate) as Dado;
  check("as semanas de 7 dias partem do campo de", vp?.weeks?.[0]?.de === de && vp?.weeks?.[0]?.ate === emDias(-8), j(vp?.weeks?.[0]));
  check("a semana do vencido (-2) está marcada overdue e traz 70", semana(-2)?.overdue === true && (semana(-2)?.items ?? []).some((i: Dado) => perto(i.total, 70)), j(semana(-2)));
  check("a semana da despesa fixa (+3) não é overdue e traz 'M101 Aluguel P' com 100", semana(3)?.overdue === false && (semana(3)?.items ?? []).some((i: Dado) => i.name === X.aluguelP && perto(i.total, 100)), j(semana(3)));
  check("a semana da conta de +8 traz 150", (semana(8)?.items ?? []).some((i: Dado) => perto(i.total, 150)), j(semana(8)));
  const porNome = (vp?.by_name ?? []).find((x: Dado) => x.name === X.aluguelP) as Dado;
  check("by_name agrupa por nome: o aluguel tem 100 e nenhum vencido", perto(porNome?.total, 100) && perto(porNome?.overdue_total, 0), j(porNome));
  check("overdue_total é o vencido (70)", perto(vp?.overdue_total, 70), String(vp?.overdue_total));
  check("o total é a soma das semanas e a soma de by_name", perto(vp?.total, (vp?.weeks ?? []).reduce((s: number, x: Dado) => s + n(x.total), 0)) && perto(vp?.total, (vp?.by_name ?? []).reduce((s: number, x: Dado) => s + n(x.total), 0)), j([vp?.total]));
  const rpL2 = await porVenc(P.tok.fin, `?establishment_id=${P.L2}&de=${de}&ate=${ate}`);
  check("filtro pela Loja 2: nada a pagar (total 0)", rpL2.status === 200 && perto(rpL2.corpo?.data?.total, 0), `${rpL2.status} ${j(rpL2.corpo).slice(0, 160)}`);
  const rpL1 = await porVenc(P.tok.fin, `?establishment_id=${P.L1}&de=${de}&ate=${ate}`);
  check("filtro pela Loja 1: o mesmo que sem filtro", rpL1.status === 200 && perto(rpL1.corpo?.data?.total, n(vp?.total)), `${rpL1.status} ${rpL1.corpo?.data?.total} vs ${vp?.total}`);
  console.log("  (b2) no padrão (de = hoje) o vencido aparece na primeira semana");
  const rpPadrao = await porVenc(P.tok.fin, `?de=${hojeStr}&ate=${emDias(30)}`);
  const vpp = rpPadrao.corpo?.data as Dado;
  check("de = hoje: o vencido de 70 entra em overdue_total", rpPadrao.status === 200 && perto(vpp?.overdue_total, 70), `${rpPadrao.status} ${vpp?.overdue_total}`);
  check("de = hoje: a primeira semana está overdue e traz os 70", vpp?.weeks?.[0]?.overdue === true && (vpp?.weeks?.[0]?.items ?? []).some((i: Dado) => perto(i.total, 70)), j(vpp?.weeks?.[0]));
  check("de = hoje: o total é a soma das semanas", perto(vpp?.total, (vpp?.weeks ?? []).reduce((s: number, x: Dado) => s + n(x.total), 0)), String(vpp?.total));
  const rpLongo = await porVenc(P.tok.fin, `?de=${emDias(0)}&ate=${emDias(400)}`);
  check("período de mais de 366 dias: 422 no campo ate", erro(rpLongo, 422, undefined, "ate"), `${rpLongo.status} ${j(rpLongo.corpo)}`);
  const rpV = await porVenc(P.tok.vend, `?de=${de}&ate=${ate}`);
  check("o Vendedor não lê o a pagar por vencimento: 403", rpV.status === 403, `${rpV.status}`);

  console.log("  (c) posição de caixa por lugar");
  const pg = await chamar(P.tok.owner, R.payablesPay, "POST", "emporio/payables/pay", { entry_ids: [X.entradaCompra8], from: { bank_account_id: P.conta } });
  check("(fixture) pagar a conta de 150 pela conta bancária: 201", pg.status === 201, `${pg.status} ${j(pg.corpo)}`);
  await vender(P, cDia, P.L1, 5, [{ kind: "dinheiro", amount: 50 }]);
  const qs = `de=${emDias(-30)}&ate=${hojeStr}`;
  const rl = await porLugar(P.tok.fin, `?${qs}`);
  const vl = rl.corpo?.data as Dado;
  const lugares = (vl?.places ?? []) as Dado[];
  check("o Financeiro lê a posição por lugar: 200", rl.status === 200, `${rl.status} ${j(rl.corpo).slice(0, 200)}`);
  const hj = (await chamar(P.tok.fin, R.today, "GET", "emporio/finance/today")).corpo?.data as Dado;
  const pos = (hj?.positions ?? []) as Dado[];
  check("lista gaveta, gerência e conta", ["gaveta", "gerencia", "conta"].every((k) => lugares.some((p) => p.kind === k)), j(lugares.map((p) => p.kind)));
  check("cada lugar tem o mesmo saldo da posição do Hoje", pos.length > 0 && pos.every((p) => perto(lugares.find((l) => l.kind === p.kind && l.id === p.id)?.balance, n(p.balance))), j([lugares.map((l) => [l.kind, l.id, l.balance]), pos.map((p) => [p.kind, p.id, p.balance])]));
  check("total_balance é o do Hoje", perto(vl?.total_balance, n(hj?.total_balance)), `${vl?.total_balance} vs ${hj?.total_balance}`);
  const origem = (lugar: Dado | undefined, o: string) => (lugar?.period?.by_origin ?? []).find((x: Dado) => x.origin === o) as Dado;
  const conta = lugares.find((p) => p.kind === "conta" && p.id === P.conta);
  const gaveta = lugares.find((p) => p.kind === "gaveta" && (p.id === P.L1 || p.establishment_id === P.L1));
  check("a conta mostra pagamento_despesa com saída de 150", perto(origem(conta, "pagamento_despesa")?.saidas, 150), j(conta?.period));
  check("a conta mostra cartao com a entrada da parcela do período (líquido da de hoje)", perto(origem(conta, "cartao")?.entradas, X.cartaoHoje), `${j(origem(conta, "cartao"))} esperado ${X.cartaoHoje}`);
  check("a gaveta da Loja 1 mostra venda com entrada de 50", perto(origem(gaveta, "venda")?.entradas, 50), j(gaveta?.period));
  check("cada origem traz label e o período tem entradas e saídas", (conta?.period?.by_origin ?? []).every((x: Dado) => typeof x.label === "string" && x.label !== "") && typeof conta?.period?.entradas === "number" && typeof conta?.period?.saidas === "number", j(conta?.period));
  const rlFut = await porLugar(P.tok.fin, `?de=${emDias(-30)}&ate=${emDias(30)}`);
  const contaFut = ((rlFut.corpo?.data?.places ?? []) as Dado[]).find((p) => p.kind === "conta" && p.id === P.conta);
  check("ate no futuro: a parcela de cartão de daqui a 10 dias fica fora do período (não está no saldo)", rlFut.status === 200 && perto(origem(contaFut, "cartao")?.entradas, X.cartaoHoje), `${rlFut.status} ${j(origem(contaFut, "cartao"))} esperado ${X.cartaoHoje}`);
  const rlL1 = await porLugar(P.tok.fin, `?establishment_id=${P.L1}&${qs}`);
  const placesL1 = (rlL1.corpo?.data?.places ?? []) as Dado[];
  check("filtro pela Loja 1: a gaveta e a gerência dela, sem a conta bancária", rlL1.status === 200 && placesL1.some((p) => p.kind === "gaveta") && placesL1.some((p) => p.kind === "gerencia") && !placesL1.some((p) => p.kind === "conta"), `${rlL1.status} ${j(placesL1.map((p) => p.kind))}`);
  const rlL2 = await porLugar(P.tok.fin, `?establishment_id=${P.L2}&${qs}`);
  const placesL2 = (rlL2.corpo?.data?.places ?? []) as Dado[];
  check("filtro pela Loja 2: nada da Loja 1 (nem a conta)", rlL2.status === 200 && placesL2.length > 0 && placesL2.every((p) => p.establishment_id !== P.L1 && p.kind !== "conta"), `${rlL2.status} ${j(placesL2.map((p) => [p.kind, p.establishment_id]))}`);
  const rlV = await porLugar(P.tok.vend, `?${qs}`);
  check("o Vendedor não lê a posição por lugar: 403", rlV.status === 403, `${rlV.status}`);
}

// ---------------------------------------------------------------------------
// Seção 6: isolamento
// ---------------------------------------------------------------------------

async function secao6() {
  secaoAtual = "6";
  console.log("\nSeção 6: a projeção e os relatórios de uma conta não enxergam a outra");
  const { P, B } = M!;
  const pP = await proj(P, P.tok.fin, "?days=90");
  check("(controle) a projeção de P tem recebíveis e contas a pagar", n(somaSemanas(pP.corpo?.data, (s) => s.receivables?.total)) > 0 && n(somaSemanas(pP.corpo?.data, (s) => s.payables?.total)) > 0, `${pP.status}`);
  const pB = await proj(B, B.tok.fin, "?days=90");
  const vB = pB.corpo?.data as Dado;
  check("a projeção de B: 200 sem nada a receber nem a pagar", pB.status === 200 && perto(somaSemanas(vB, (s) => s.receivables?.total), 0) && perto(somaSemanas(vB, (s) => s.payables?.total), 0), `${pB.status} ${j(pB.corpo).slice(0, 200)}`);
  check("o saldo de hoje de B é o dele (1.250: conta 1.000, gaveta 200, gerência 50)", perto(vB?.opening_balance, 1250), String(vB?.opening_balance));
  const pBouP = await proj(B, B.tok.fin, `?days=30&establishment_id=${P.L1}`);
  check("projeção de B pedindo a loja de P: nunca 200 com dado de P", pBouP.status !== 0 && (pBouP.status !== 200 || (perto(somaSemanas(pBouP.corpo?.data, (s) => s.receivables?.total), 0) && perto(pBouP.corpo?.data?.opening_balance, 0))), `${pBouP.status} ${j(pBouP.corpo).slice(0, 160)}`);
  const aB = await chamar(B.tok.fin, R.aging, "GET", "emporio/finance/reports/receivables-aging");
  check("o a receber por idade de B: vazio e sem os clientes de P", aB.status === 200 && (aB.corpo?.data?.customers ?? []).length === 0 && !j(aB.corpo).includes("M101 Aging"), `${aB.status} ${j(aB.corpo).slice(0, 160)}`);
  const aBouP = await chamar(B.tok.fin, R.aging, "GET", `emporio/finance/reports/receivables-aging?establishment_id=${P.L1}`);
  check("a receber de B pedindo a loja de P: nunca 200 com clientes", aBouP.status !== 0 && (aBouP.status !== 200 || (aBouP.corpo?.data?.customers ?? []).length === 0), `${aBouP.status}`);
  const bB = await chamar(B.tok.fin, R.payablesByDue, "GET", `emporio/finance/reports/payables-by-due?de=${emDias(-14)}&ate=${emDias(30)}`);
  check("o a pagar de B: total 0 e sem o aluguel de P", bB.status === 200 && perto(bB.corpo?.data?.total, 0) && !j(bB.corpo).includes(X.aluguelP), `${bB.status} ${j(bB.corpo).slice(0, 160)}`);
  const cB = await chamar(B.tok.fin, R.cashByPlace, "GET", `emporio/finance/reports/cash-by-place?de=${emDias(-30)}&ate=${hojeStr}`);
  const lugaresB = (cB.corpo?.data?.places ?? []) as Dado[];
  check("a posição de B só lista lugares de B (a conta e as lojas dele, nenhum id de P)", cB.status === 200 && lugaresB.length > 0 && !j(cB.corpo).includes(P.conta) && !j(cB.corpo).includes(P.L1) && !j(cB.corpo).includes(P.L2), `${cB.status} ${j(lugaresB.map((l) => [l.kind, l.id]))}`);
  check("o total de B na posição é 1.250", perto(cB.corpo?.data?.total_balance, 1250), String(cB.corpo?.data?.total_balance));
}

// ---------------------------------------------------------------------------

async function limpar() {
  if (tenantIds.length === 0) return;
  secaoAtual = "limpeza";
  const { prisma } = await import("@/lib/prisma");
  for (const id of tenantIds) {
    await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
  }
  const modelos = [
    "fixedExpenseOccurrence", "fixedExpenseSplit", "fixedExpenseTemplate", "variableExpenseRule",
    "emporioPaymentRequest", "emporioCreditRelease", "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "cardReceivable", "cardFeeRule", "emporioSalePayment", "emporioSaleReturnItem",
    "stockMovement", "emporioSaleItem", "emporioSaleReturn", "emporioCheck", "emporioQuoteItem", "emporioQuote", "emporioSale", "emporioPurchaseItem",
    "emporioPurchase", "financialPayment", "financialEntry", "emporioCreditAgreement", "emporioCustomer", "emporioSupplier", "cashHandover", "cashSession", "cashRegister", "emporioCounter",
    "emporioSettings", "userEstablishment", "establishment", "bankAccount", "contact", "user", "tenantProfile", "tenantFeature",
  ];
  // duas passadas: as referências cruzadas podem deixar sobra na ordem de uma só
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
        secaoAtual = "montagem";
        M = { A: await montar("A"), P: await montar("P"), E: await montar("E"), F: await montar("F"), B: await montar("B") };
      });
      if (!M) {
        check("a montagem dos tenants terminou (sem ela as seções 2 a 6 não rodam)", false);
        return;
      }
      await rodar("2", secao2);
      await rodar("3", secao3);
      await rodar("4", secao4);
      await rodar("4 estimativa", secao4Estimativa);
      await rodar("4 fixas", secao4Fixas);
      await rodar("4 juiz", secao4Juiz);
      await rodar("5", secao5);
      await rodar("6", secao6);
    });
  } finally {
    await limpar();
  }
  console.log("\nChecagens por seção:");
  for (const [s, c] of Object.entries(contagem)) console.log(`  seção ${s}: ${c.ok + c.falhas} (${c.ok} verdes, ${c.falhas} vermelhas)`);
  const total = Object.values(contagem).reduce((s, c) => s + c.ok + c.falhas, 0);
  console.log(falhas === 0 ? `\n✅ M101 verde (${total} checagens)` : `\n❌ M101: ${falhas} falha(s) em ${total} checagens`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
