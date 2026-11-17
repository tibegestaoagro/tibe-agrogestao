import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M120: Módulo 39 (Meu Empório), informação amarrada (frente A, Q345 a Q348).
 * Roda: `npm run test:m120`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-17-emporio-informacao-amarrada-design.md e do
 * bloco Interfaces do plano, sem ler a implementação. O que está sob prova passa pela ROTA (Request
 * construído); as fixtures passam pelas actions já existentes e por Prisma (datas). Rota que ainda não
 * existe vira falha de checagem (status 0), nunca exceção que derruba a suíte.
 *
 * Seção 1: o helper puro de período (periodoDaUrl e atalhosDePeriodo).
 * Seção 2: A receber, os recortes Vencido, Vence hoje e A vencer (fiado, cheque, boleto e cartão).
 * Seção 3: fiado pago em parte (o recorte usa o aberto) e o cancelado fora de tudo.
 * Seção 4: Recebido dentro e fora do período, o dinheiro do ato da venda fora, e o % do previsto.
 * Seção 5: o fuso no limite do período (22h de Brasília do último dia do mês).
 * Seção 6: A pagar (vencida, hoje, a vencer, sem vencimento, pago, cancelada fora, fuso).
 * Seção 7: campos de link (cartão, extrato, conta a pagar, fiado por recorte).
 * Seção 8: a ficha do cliente (Em aberto, Vencido, Recebido) e a lista de recebimentos.
 * Seção 9: lojas do ator (filtro por loja, Gestor de uma loja só).
 * Seção 10: isolamento entre contas.
 * Seção 11: recusas de `de` e `ate` (422 com field).
 *
 * Leituras adotadas onde a spec era ambígua (ver o relato): a contagem do fiado é por lançamento (cada
 * cliente da fixture tem um só lançamento no recorte); parcela de cartão que cai hoje conta em "Vence hoje"
 * e também em Recebido quando o período inclui hoje; valores de cartão são brutos=líquidos na fixture (taxa zerada).
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

console.log("🧾 M120: Módulo 39 (Meu Empório), informação amarrada: resumo do A receber e do A pagar, ficha do cliente e links (Q345 a Q348)\n");

const tenantIds: string[] = [];
const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, k: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + k * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const emDias = (k: number) => somaDias(hojeStr, k);
const n = (x: unknown) => Number(x);
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;
const mesCorrente = hojeStr.slice(0, 7);
const somaMes = (ym: string, k: number) => {
  const [a, m] = ym.split("-").map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const ultimoDia = (ym: string) => `${ym}-${String(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate()).padStart(2, "0")}`;
/** Um instante de Brasília (UTC-3, sem horário de verão desde 2019). */
const brt = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`);

const ONTEM = emDias(-1);
const ANTEONTEM = emDias(-2);
const H3 = emDias(-3);

// ---------------------------------------------------------------------------
// Seção 1 (pura)
// ---------------------------------------------------------------------------

async function secao1Pura() {
  secaoAtual = "1";
  console.log("Seção 1: o helper puro de período (sem banco)");
  let P: Dado = null;
  try {
    P = await import("@/lib/emporio/periodo");
  } catch (e) {
    check("src/lib/emporio/periodo.ts existe e importa", false, e instanceof Error ? e.message.slice(0, 100) : String(e));
    return;
  }
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const hoje = d("2026-11-18"); // quarta-feira
  const atalhos = (typeof P.atalhosDePeriodo === "function" ? P.atalhosDePeriodo(hoje) : []) as { id: string; de: string; ate: string; rotulo: string }[];
  const por = (id: string) => atalhos.find((a) => a.id === id);
  check("atalhosDePeriodo devolve os quatro atalhos (hoje, semana, mes, mes_passado)", ["hoje", "semana", "mes", "mes_passado"].every((id) => !!por(id)), j(atalhos));
  check("Hoje: 18/11 a 18/11", por("hoje")?.de === "2026-11-18" && por("hoje")?.ate === "2026-11-18", j(por("hoje")));
  check("Esta semana é domingo a sábado: 15/11 a 21/11", por("semana")?.de === "2026-11-15" && por("semana")?.ate === "2026-11-21", j(por("semana")));
  check("Este mês: 01/11 a 30/11", por("mes")?.de === "2026-11-01" && por("mes")?.ate === "2026-11-30", j(por("mes")));
  check("Mês passado: 01/10 a 31/10", por("mes_passado")?.de === "2026-10-01" && por("mes_passado")?.ate === "2026-10-31", j(por("mes_passado")));
  check("todo atalho traz rótulo em texto", atalhos.length === 4 && atalhos.every((a) => typeof a.rotulo === "string" && a.rotulo.length > 0));
  const janeiro = (typeof P.atalhosDePeriodo === "function" ? P.atalhosDePeriodo(d("2027-01-05")) : []) as { id: string; de: string; ate: string }[];
  const mp = janeiro.find((a) => a.id === "mes_passado");
  check("em janeiro o Mês passado cruza o ano: 01/12/2026 a 31/12/2026", mp?.de === "2026-12-01" && mp?.ate === "2026-12-31", j(mp));
  const fev = (typeof P.atalhosDePeriodo === "function" ? P.atalhosDePeriodo(d("2028-03-10")) : []) as { id: string; de: string; ate: string }[];
  check("em março de 2028 o Mês passado vai até 29/02 (bissexto)", fev.find((a) => a.id === "mes_passado")?.ate === "2028-02-29", j(fev.find((a) => a.id === "mes_passado")));

  const per = (sp: Dado) => (typeof P.periodoDaUrl === "function" ? P.periodoDaUrl(sp, hoje) : null) as { de: string; ate: string } | null;
  check("sem de e ate: Este mês", per({})?.de === "2026-11-01" && per({})?.ate === "2026-11-30", j(per({})));
  check("de e ate válidos valem como vieram", per({ de: "2026-11-03", ate: "2026-11-09" })?.de === "2026-11-03" && per({ de: "2026-11-03", ate: "2026-11-09" })?.ate === "2026-11-09", j(per({ de: "2026-11-03", ate: "2026-11-09" })));
  check("de inválido: Este mês", per({ de: "banana", ate: "2026-11-09" })?.de === "2026-11-01", j(per({ de: "banana", ate: "2026-11-09" })));
  check("data impossível (2026-02-31): Este mês", per({ de: "2026-02-31", ate: "2026-03-05" })?.de === "2026-11-01", j(per({ de: "2026-02-31", ate: "2026-03-05" })));
  check("de depois de ate: Este mês", per({ de: "2026-11-09", ate: "2026-11-03" })?.de === "2026-11-01" && per({ de: "2026-11-09", ate: "2026-11-03" })?.ate === "2026-11-30", j(per({ de: "2026-11-09", ate: "2026-11-03" })));
}

// ---------------------------------------------------------------------------
// Montagem (banco)
// ---------------------------------------------------------------------------

async function comBanco(fn: () => Promise<void>) {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  await fn();
}

type Usuario = { id: string; role: "OWNER" | "OPERADOR"; email: string };
type Mundo = {
  rotulo: string;
  tenantId: string;
  db: Dado;
  owner: Usuario;
  tok: Record<"owner" | "gestor" | "fin", string>;
  L1: string;
  L2: string;
  reg: Record<string, string>;
  conta: string;
  prodId: string;
  presId: string;
};

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
    data: { name: `M120 ${rotulo} ${stamp}`, document: `M120${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  await (prisma as Dado).emporioSettings.upsert({ where: { tenant_id: t.id }, create: { tenant_id: t.id, ...PADRAO }, update: PADRAO });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M120 ${suf}`, email: `m120-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const fin = await mk("fin", "OPERADOR", papelFinanceiro());

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M120 ${rotulo} Loja 1` });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M120 ${rotulo} Loja 2` });
  if (!l1.ok || !l2.ok) throw new Error(`lojas: ${j([l1, l2])}`);
  const L1 = l1.data.id as string;
  const L2 = l2.data.id as string;
  await vincularTodas(prisma, t.id, [gestor.id], [L1]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M120 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M120 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  for (const L of [L1, L2]) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  }
  const c1 = await Cx.criarContaAction(db, owner, { name: `M120 Conta ${rotulo} ${stamp}`, bank: "Banco M120" });
  if (!c1.ok) throw new Error(`conta: ${j(c1)}`);
  const conta = c1.data.id as string;
  for (const input of [
    { bank_account_id: conta, amount: 5000 },
    { establishment_id: L1, amount: 500 },
    { establishment_id: L2, amount: 500 },
  ]) {
    const s = await Cx.saldoInicialCaixaAction(db, owner, input);
    if (!s.ok) throw new Error(`saldo inicial ${j(input)}: ${j(s)}`);
  }
  for (const L of [L1, L2]) await abrirTurnoDeTeste(db, owner, L);
  const reg: Record<string, string> = {};
  for (const L of [L1, L2]) reg[L] = (await db.cashRegister.findFirst({ where: { establishment_id: L, number: 1 } }))?.id as string;
  for (const L of [L1, L2]) {
    const regra = await Cx.definirRegraCartaoAction(db, owner, { establishment_id: L, kind: "credito_vista", fee_pct: 2, days: 1, bank_account_id: conta });
    if (!regra.ok) throw new Error(`regra de cartão: ${j(regra)}`);
  }

  const tok = {} as Mundo["tok"];
  const pares: [keyof Mundo["tok"], Usuario][] = [["owner", owner], ["gestor", gestor], ["fin", fin]];
  for (const [k, u] of pares) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { rotulo, tenantId: t.id, db, owner, tok, L1, L2, reg, conta, prodId: prod.data.id, presId: pres.data.id };
}

// Rotas (import literal, para o bundler do tsx resolver os colchetes). As novas ainda podem não existir.
const R = {
  receivables: () => import("@/app/api/v1/emporio/finance/receivables/route"),
  statement: () => import("@/app/api/v1/emporio/finance/statement/route"),
  payables: () => import("@/app/api/v1/emporio/payables/route"),
  payablesSummary: () => import("@/app/api/v1/emporio/payables/summary/route"),
  payablesPay: () => import("@/app/api/v1/emporio/payables/pay/route"),
  customer: () => import("@/app/api/v1/emporio/customers/[id]/route"),
  receipts: () => import("@/app/api/v1/emporio/customers/[id]/receipts/route"),
  receive: () => import("@/app/api/v1/emporio/receivables/receive/route"),
  cancel: () => import("@/app/api/v1/emporio/sales/[id]/cancel/route"),
  saleReturn: () => import("@/app/api/v1/emporio/sales/[id]/return/route"),
  boletoPay: () => import("@/app/api/v1/emporio/boletos/[id]/pay/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST", url: string, corpo?: unknown, id?: string): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  let m: Dado;
  try {
    m = await rota();
  } catch (e) {
    // rota ainda não existe: reprova só as afirmações dela, não a seção inteira
    return { status: 0, corpo: { import_error: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
  if (typeof m[metodo] !== "function") return { status: 0, corpo: { import_error: `a rota não exporta ${metodo}` } };
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  try {
    const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
  } catch (e) {
    return { status: 0, corpo: { throw: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
}
const erro = (r: Resp, status: number, field?: string) => r.status === status && (field === undefined || r.corpo?.error?.field === field);
const ok2xx = (r: Resp) => r.status >= 200 && r.status < 300;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m120-${p}-${stamp}-${(seq += 1)}`;

// --- fixtures ---

async function prismaCru(): Promise<Dado> {
  return (await import("@/lib/prisma")).prisma as Dado;
}

async function cliente(w: Mundo, nome: string): Promise<Dado> {
  const P = await prismaCru();
  return await P.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: `M120 ${nome}` } });
}

const itens = (w: Mundo, qty: number) => [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: qty }];

/** Venda de `valor` reais (preço 10 o quilo), pela action (a fixture precisa de datas que a rota não aceita). */
async function vender(w: Mundo, cli: Dado, loja: string, valor: number, payments: Dado[], over: Dado = {}): Promise<string> {
  const V = await import("@/lib/actions/emporio-vendas");
  const r = await V.venderAction(w.db, w.owner, {
    operation_key: chave("venda"), establishment_id: loja, cash_register_id: w.reg[loja],
    customer_id: cli.id, items: itens(w, valor / 10), payments, ...over,
  } as Dado);
  if (!r.ok) throw new Error(`venda de preparação: ${j(r)}`);
  return (r.data as Dado).id as string;
}

/** Fiado de `valor` vencendo em `venc` dias (negativo: já vencido, com a venda cinco dias antes do vencimento). */
const fiado = (w: Mundo, cli: Dado, loja: string, valor: number, venc: number) =>
  vender(w, cli, loja, valor, [{ kind: "fiado", amount: valor, due_date: meioDia(emDias(venc)) }], venc < 0 ? { sold_at: new Date(Date.now() - (-venc + 5) * DIA) } : {});

const chequeP = (valor: number, num: string) => ({ kind: "cheque", amount: valor, check: { number: num, bank: "Banco M120", holder_name: "Titular M120", good_for: meioDia(emDias(15)) } });
const boletoP = (valor: number, num: string) => ({ kind: "boleto", amount: valor, boleto: { due_on: meioDia(emDias(20)), number: num } });

async function numeroDaVenda(id: string): Promise<number> {
  const P = await prismaCru();
  return n((await P.emporioSale.findUnique({ where: { id } }))?.number);
}

async function cancelarVenda(w: Mundo, saleId: string, loja: string) {
  const r = await chamar(w.tok.owner, R.cancel, "POST", `emporio/sales/${saleId}/cancel`, { reason: "Erro de digitação", cash_register_id: w.reg[loja] }, saleId);
  if (!ok2xx(r)) throw new Error(`cancelar venda de preparação: ${r.status} ${j(r.corpo)}`);
}

/** Recebe fiado pela rota e, se `quando`, move o carimbo de tempo do pagamento e do movimento (data de verdade, no fuso certo). */
async function receberFiado(w: Mundo, cli: Dado, valor: number, quando?: Date): Promise<string> {
  const P = await prismaCru();
  const key = chave("rec");
  const r = await chamar(w.tok.fin, R.receive, "POST", "emporio/receivables/receive", {
    operation_key: key, customer_id: cli.id, establishment_id: w.L1, amount: valor, kind: "pix", bank_account_id: w.conta,
  });
  if (!ok2xx(r)) throw new Error(`receber fiado de preparação: ${r.status} ${j(r.corpo)}`);
  if (quando) {
    const entradas = (await P.financialEntry.findMany({ where: { tenant_id: w.tenantId, emporio_customer_id: cli.id }, select: { id: true } })) as Dado[];
    const pgs = (await P.financialPayment.findMany({ where: { entry_id: { in: entradas.map((e) => e.id) } }, select: { id: true } })) as Dado[];
    const ids = pgs.map((p) => p.id);
    await P.financialPayment.updateMany({ where: { id: { in: ids } }, data: { paid_at: quando } });
    await P.cashMovement.updateMany({ where: { OR: [{ financial_payment_id: { in: ids } }, { operation_key: key }] }, data: { occurred_at: quando } });
  }
  return key;
}

/** Normaliza as parcelas de cartão de uma venda: taxa zero (bruto = líquido) e a data de queda escolhida. */
async function ajustarCartao(saleId: string, dia: string, extra: Dado = {}) {
  const P = await prismaCru();
  const linhas = (await P.cardReceivable.findMany({ where: { sale_id: saleId } })) as Dado[];
  if (linhas.length !== 1) throw new Error(`esperava 1 parcela de cartão na venda ${saleId}, vieram ${linhas.length}`);
  await P.cardReceivable.update({
    where: { id: linhas[0].id },
    data: { expected_on: meioDia(dia), effective_on: meioDia(dia), net_amount: linhas[0].gross_amount, effective_net: linhas[0].gross_amount, fee_amount: 0, ...extra },
  });
  return linhas[0].id as string;
}

const lista = (r: Resp): Dado[] => (Array.isArray(r.corpo?.data) ? r.corpo.data : []);
const faixa = (f: Dado, total: number, count: number) => !!f && perto(f.total, total) && f.count === count;

const aReceber = (w: Mundo, tok: string, qs = "") => chamar(tok, R.receivables, "GET", `emporio/finance/receivables${qs}`);
const aPagarResumo = (w: Mundo, tok: string, qs = "") => chamar(tok, R.payablesSummary, "GET", `emporio/payables/summary${qs}`);
const periodoQs = (de: string, ate: string) => `de=${de}&ate=${ate}`;

// Estado compartilhado entre as seções
const X: Record<string, Dado> = {};
let A = null as unknown as Mundo;
let F = null as unknown as Mundo;
let E = null as unknown as Mundo;

// ---------------------------------------------------------------------------
// Fixtures do mundo A (A receber e A pagar)
// ---------------------------------------------------------------------------

async function fixturesA() {
  const P = await prismaCru();
  const tenant = A.tenantId;
  const setCheque = (num: string, data: Dado) => P.emporioCheck.updateMany({ where: { tenant_id: tenant, number: num }, data });
  const setBoleto = (num: string, data: Dado) => P.emporioBoleto.updateMany({ where: { tenant_id: tenant, number: num }, data });
  const idBoleto = async (num: string) => String((await P.emporioBoleto.findFirst({ where: { tenant_id: tenant, number: num } }))?.id ?? "");
  const tag = (s: string) => `${s}-${stamp}`;

  // Fiado: um lançamento por cliente
  X.F1 = await cliente(A, "Fiado ontem");
  await fiado(A, X.F1, A.L1, 30, -1);
  X.F2 = await cliente(A, "Fiado hoje");
  await fiado(A, X.F2, A.L1, 40, 0);
  X.F3 = await cliente(A, "Fiado amanha");
  await fiado(A, X.F3, A.L1, 50, 1);
  X.F4 = await cliente(A, "Fiado parcial");
  await fiado(A, X.F4, A.L1, 100, -1);
  X.F5 = await cliente(A, "Fiado loja 2");
  await fiado(A, X.F5, A.L2, 10, -1);
  X.Fcanc = await cliente(A, "Fiado cancelado");
  const vCanc = await fiado(A, X.Fcanc, A.L1, 20, -1);
  await cancelarVenda(A, vCanc, A.L1);
  X.F6 = await cliente(A, "Fiado antigo");
  await fiado(A, X.F6, A.L1, 20, 30);

  // o fiado pago em parte: 60 dos 100 (o aberto passa a 40) e o carimbo vai para ontem 15h de Brasília
  await receberFiado(A, X.F4, 60, brt(ONTEM, "15:00"));
  // o fiado antigo, quitado há três dias
  await receberFiado(A, X.F6, 20, brt(H3, "15:00"));

  // Cheques (um cliente só)
  X.Cc = await cliente(A, "Cheques");
  await vender(A, X.Cc, A.L1, 20, [chequeP(20, tag("K1"))]);
  await vender(A, X.Cc, A.L1, 30, [chequeP(30, tag("K2"))]);
  await vender(A, X.Cc, A.L1, 40, [chequeP(40, tag("K3"))]);
  await vender(A, X.Cc, A.L1, 60, [chequeP(60, tag("K4"))]);
  await vender(A, X.Cc, A.L1, 70, [chequeP(70, tag("K5"))]);
  await setCheque(tag("K1"), { good_for: meioDia(ONTEM) });
  await setCheque(tag("K2"), { good_for: meioDia(hojeStr) });
  await setCheque(tag("K3"), { good_for: meioDia(emDias(1)), status: "depositado", deposited_at: new Date(), bank_account_id: A.conta });
  await setCheque(tag("K4"), { good_for: meioDia(ONTEM), status: "compensado", cleared_at: brt(ONTEM, "15:00"), bank_account_id: A.conta });
  await setCheque(tag("K5"), { good_for: meioDia(ONTEM), status: "devolvido", returned_at: new Date(), return_reason: "Sem fundos" });

  // Boletos (um cliente só)
  X.Cb = await cliente(A, "Boletos");
  await vender(A, X.Cb, A.L1, 20, [boletoP(20, tag("B1"))]);
  await vender(A, X.Cb, A.L1, 30, [boletoP(30, tag("B2"))]);
  await vender(A, X.Cb, A.L1, 40, [boletoP(40, tag("B3"))]);
  X.vB4 = await vender(A, X.Cb, A.L1, 50, [boletoP(50, tag("B4"))]);
  X.vB5 = await vender(A, X.Cb, A.L1, 80, [boletoP(80, tag("B5"))]);
  await setBoleto(tag("B1"), { due_on: meioDia(ONTEM) });
  await setBoleto(tag("B2"), { due_on: meioDia(hojeStr) });
  await setBoleto(tag("B3"), { due_on: meioDia(emDias(1)) });
  await setBoleto(tag("B5"), { due_on: meioDia(ONTEM) });
  await cancelarVenda(A, X.vB5, A.L1);
  const pagoB4 = await chamar(A.tok.owner, R.boletoPay, "POST", "", { bank_account_id: A.conta, paid_on: ONTEM }, await idBoleto(tag("B4")));
  if (!ok2xx(pagoB4)) throw new Error(`baixa do boleto de preparação: ${pagoB4.status} ${j(pagoB4.corpo)}`);

  // Cartões (taxa zerada, para bruto = líquido)
  X.Ck = await cliente(A, "Cartoes");
  X.vC1 = await vender(A, X.Ck, A.L1, 100, [{ kind: "credito_vista", amount: 100 }]);
  X.vC2 = await vender(A, X.Ck, A.L1, 200, [{ kind: "credito_vista", amount: 200 }]);
  X.vC3 = await vender(A, X.Ck, A.L1, 300, [{ kind: "credito_vista", amount: 300 }]);
  X.vC4 = await vender(A, X.Ck, A.L1, 400, [{ kind: "credito_vista", amount: 400 }]);
  X.vC5 = await vender(A, X.Ck, A.L1, 60, [{ kind: "credito_vista", amount: 60 }]);
  await ajustarCartao(X.vC1, ONTEM);
  await ajustarCartao(X.vC2, hojeStr);
  await ajustarCartao(X.vC3, emDias(1));
  await ajustarCartao(X.vC4, emDias(1), { canceled_at: new Date() });
  await ajustarCartao(X.vC5, emDias(2));
  await P.emporioSale.update({ where: { id: X.vC5 }, data: { customer_id: null } }); // venda sem cliente
  X.nC = { C1: await numeroDaVenda(X.vC1), C2: await numeroDaVenda(X.vC2), C3: await numeroDaVenda(X.vC3), C5: await numeroDaVenda(X.vC5) };

  // Dinheiro no ato da venda, hoje: nunca foi "a receber", nunca entra no Recebido
  await vender(A, X.Ck, A.L1, 40, [{ kind: "dinheiro", amount: 40 }]);

  // Fuso do limite do período (Seção 5): fiado quitado em instantes de Brasília
  const M1 = somaMes(mesCorrente, -1);
  const M2 = somaMes(mesCorrente, -2);
  const M3 = somaMes(mesCorrente, -3);
  X.M2 = M2;
  const fuso: [string, Date][] = [
    ["Fuso dentro 22h", brt(ultimoDia(M2), "22:00")],
    ["Fuso fora 00h30", brt(`${M1}-01`, "00:30")],
    ["Fuso dentro 00h30", brt(`${M2}-01`, "00:30")],
    ["Fuso fora 22h anterior", brt(ultimoDia(M3), "22:00")],
  ];
  for (const [nome, quando] of fuso) {
    const c = await cliente(A, nome);
    await fiado(A, c, A.L1, 10, 30);
    await receberFiado(A, c, 10, quando);
  }

  // ----- A pagar
  X.S1 = await P.emporioSupplier.create({ data: { tenant_id: tenant, name: `M120 Fornecedor ${stamp}`, kind: "externo" } });
  const avulsa = async (descricao: string, valor: number, vencDia: string, loja: string, opts: { supplier?: string; paga?: boolean } = {}) => {
    const r = await chamar(A.tok.owner, R.payables, "POST", "emporio/payables", {
      establishment_id: loja, description: `M120 ${descricao}`, amount: valor, due_date: vencDia, status: opts.paga ? "paid" : "pending",
      ...(opts.supplier ? { emporio_supplier_id: opts.supplier } : {}),
      ...(opts.paga ? { paid_at: ONTEM, from: { bank_account_id: A.conta } } : {}),
    });
    const id = String(r.corpo?.data?.entry?.entry_id ?? r.corpo?.data?.entry_id ?? "");
    if (!ok2xx(r) || !id) throw new Error(`conta avulsa de preparação (${descricao}): ${r.status} ${j(r.corpo)}`);
    return id;
  };
  /** Move o instante do pagamento (e o do movimento) para um instante de Brasília. */
  const pagoEm = async (entryId: string, quando: Date) => {
    const pgs = (await P.financialPayment.findMany({ where: { entry_id: entryId }, select: { id: true } })) as Dado[];
    const ids = pgs.map((p) => p.id);
    if (ids.length === 0) throw new Error(`a conta ${entryId} não tem pagamento`);
    await P.financialPayment.updateMany({ where: { id: { in: ids } }, data: { paid_at: quando } });
    await P.cashMovement.updateMany({ where: { financial_payment_id: { in: ids } }, data: { occurred_at: quando } });
  };
  X.P1 = await avulsa("Vencida", 70, ONTEM, A.L1, { supplier: X.S1.id });
  X.P2 = await avulsa("Hoje", 80, hojeStr, A.L1);
  X.P3 = await avulsa("Amanha", 90, emDias(1), A.L1);
  X.P4 = await avulsa("Loja 2", 100, emDias(5), A.L2);
  X.P5 = await avulsa("Sem vencimento", 55, emDias(9), A.L1);
  await P.financialEntry.update({ where: { id: X.P5 }, data: { due_date: null } });
  X.P6 = await avulsa("Cancelada", 33, ONTEM, A.L1);
  await P.financialEntry.update({ where: { id: X.P6 }, data: { status: "cancelled" } });
  X.P7 = await avulsa("Paga ontem", 60, ONTEM, A.L1, { supplier: X.S1.id, paga: true });
  await pagoEm(X.P7, brt(ONTEM, "15:00"));
  X.P8 = await avulsa("Paga ha tres dias", 40, H3, A.L1, { paga: true });
  await pagoEm(X.P8, brt(H3, "15:00"));
  const fusoP: [string, Date][] = [
    ["Pago dentro 22h", brt(ultimoDia(M2), "22:00")],
    ["Pago fora 00h30", brt(`${M1}-01`, "00:30")],
    ["Pago dentro 00h30", brt(`${M2}-01`, "00:30")],
    ["Pago fora 22h anterior", brt(ultimoDia(M3), "22:00")],
  ];
  for (const [nome, quando] of fusoP) {
    const id = await avulsa(nome, 10, ONTEM, A.L1, { paga: true });
    await pagoEm(id, quando);
  }
}

// ---------------------------------------------------------------------------
// Seção 2: os recortes do A receber
// ---------------------------------------------------------------------------

async function secao2() {
  secaoAtual = "2";
  console.log("\nSeção 2: A receber, os recortes Vencido, Vence hoje e A vencer");
  const r = await aReceber(A, A.tok.owner);
  const s = r.corpo?.data?.summary;
  check("o Dono lê o A receber: 200", r.status === 200, `${r.status} ${j(r.corpo).slice(0, 200)}`);
  check("a resposta traz summary, received_items (lista) e period", !!s && Array.isArray(r.corpo?.data?.received_items) && !!r.corpo?.data?.period, j(Object.keys(r.corpo?.data ?? {})));
  console.log("  (a) ontem, hoje e amanhã, com fiado, cheque, boleto e cartão");
  check("Vencido: fiado 30+40+10, cheque 20, boleto 20 = R$ 120 em 5 itens (cancelados, compensado e devolvido fora)", faixa(s?.overdue, 120, 5), j(s?.overdue));
  check("Vence hoje: fiado 40, cheque 30, boleto 30 e a parcela de cartão 200 = R$ 300 em 4 itens", faixa(s?.due_today, 300, 4), j(s?.due_today));
  check("A vencer: fiado 50, cheque 40 (depositado), boleto 40, cartões 300 e 60 = R$ 490 em 5 itens (cartão cancelado fora)", faixa(s?.upcoming, 490, 5), j(s?.upcoming));
  const semPeriodo = r.corpo?.data?.period;
  check("sem de e ate o período é Este mês (do dia 1 ao último dia do mês de Brasília)", semPeriodo?.de === `${mesCorrente}-01` && semPeriodo?.ate === ultimoDia(mesCorrente), j(semPeriodo));
  check("o período explícito volta como veio", (await aReceber(A, A.tok.owner, `?${periodoQs(ONTEM, hojeStr)}`)).corpo?.data?.period?.de === ONTEM);
  check("as seções de hoje seguem devolvendo as listas (fiado, checks, boletos, cards)", ["fiado", "checks", "boletos", "cards"].every((k) => Array.isArray(r.corpo?.data?.[k])), j(Object.keys(r.corpo?.data ?? {})));
  const cards = (r.corpo?.data?.cards ?? []) as Dado[];
  // Frente B: a parcela passada e ainda não conferida (a de 100, de ontem) agora também é listada, com o estado.
  check("cards traz a passada não conferida, as de hoje e futuras e não a cancelada: 4 linhas (100, 200, 300 e 60)", cards.length === 4 && [100, 200, 300, 60].every((v) => cards.some((c) => perto(c.gross_amount, v))) && !cards.some((c) => perto(c.gross_amount, 400)), j(cards.map((c) => c.gross_amount)));
}

// ---------------------------------------------------------------------------
// Seção 3: o fiado pago em parte e o cancelado
// ---------------------------------------------------------------------------

async function secao3() {
  secaoAtual = "3";
  console.log("\nSeção 3: fiado pago em parte (o recorte usa o aberto) e o cancelado fora");
  const r = await aReceber(A, A.tok.owner);
  const fiadoV = (r.corpo?.data?.fiado ?? []) as Dado[];
  const por = (c: Dado) => fiadoV.find((f) => f.customer_id === c.id);
  console.log("  (b) o aberto de cada lançamento");
  const f4 = por(X.F4);
  check("o cliente de R$ 100 que pagou 60 deve 40 (owed)", perto(f4?.owed, 40), j(f4));
  check("o recorte vencido dele é o aberto, R$ 40, e não os 100 originais", perto(f4?.overdue_amount, 40), j(f4));
  check("a conta do Vencido já conta 40 (e não 100) para o F4: o total fecha em 120 só assim", faixa(r.corpo?.data?.summary?.overdue, 120, 5), j(r.corpo?.data?.summary?.overdue));
  check("o cliente do fiado cancelado não aparece no fiado", por(X.Fcanc) === undefined, j(por(X.Fcanc)));
  check("o cliente do fiado quitado (R$ 20 pagos) não aparece no fiado", por(X.F6) === undefined, j(por(X.F6)));
  check("o fiado cancelado não pesa no Vencido nem em nenhum cartão: nenhum item de R$ 20 de fiado vencido sobra", fiadoV.filter((f) => f.customer_id === X.Fcanc.id).length === 0);
}

// ---------------------------------------------------------------------------
// Seção 4: Recebido
// ---------------------------------------------------------------------------

async function secao4() {
  secaoAtual = "4";
  console.log("\nSeção 4: Recebido dentro e fora do período, e o % do previsto");
  const rOntem = await aReceber(A, A.tok.owner, `?${periodoQs(ONTEM, ONTEM)}`);
  const sO = rOntem.corpo?.data?.summary;
  const itens = (rOntem.corpo?.data?.received_items ?? []) as Dado[];
  console.log("  (c) o período de ontem: fiado 60, cheque compensado 60, boleto pago 50, cartão 100");
  check("Recebido de ontem: R$ 270 em 4 itens", faixa(sO?.received, 270, 4), j(sO?.received));
  const kinds = itens.map((i) => i.kind).sort();
  check("received_items traz um fiado, um cheque, um boleto e um cartão", j(kinds) === j(["boleto", "cartao", "cheque", "fiado"]), j(kinds));
  const valor = (k: string) => n(itens.find((i) => i.kind === k)?.amount);
  check("com os valores 60 (fiado), 60 (cheque), 50 (boleto) e 100 (cartão)", valor("fiado") === 60 && valor("cheque") === 60 && valor("boleto") === 50 && valor("cartao") === 100, j(itens.map((i) => [i.kind, i.amount])));
  check("todos com occurred_on de ontem (o boleto pelo paid_on, não pelo dia da baixa)", itens.length === 4 && itens.every((i) => i.occurred_on === ONTEM), j(itens.map((i) => i.occurred_on)));
  check("a baixa da parcela do fiado fica ligada ao cliente F4 e a do cheque, boleto e cartão aos seus", itens.find((i) => i.kind === "fiado")?.customer_id === X.F4.id && itens.find((i) => i.kind === "cheque")?.customer_id === X.Cc.id && itens.find((i) => i.kind === "boleto")?.customer_id === X.Cb.id && itens.find((i) => i.kind === "cartao")?.customer_id === X.Ck.id, j(itens.map((i) => [i.kind, i.customer_id])));
  check("o boleto e o cartão trazem sale_id e sale_number da venda", itens.find((i) => i.kind === "boleto")?.sale_id === X.vB4 && itens.find((i) => i.kind === "cartao")?.sale_id === X.vC1 && itens.find((i) => i.kind === "cartao")?.sale_number === X.nC.C1, j(itens.filter((i) => ["boleto", "cartao"].includes(i.kind)).map((i) => [i.sale_id, i.sale_number])));
  check("o resumo de Vencido, Vence hoje e A vencer não depende do período escolhido", faixa(sO?.overdue, 120, 5) && faixa(sO?.due_today, 300, 4) && faixa(sO?.upcoming, 490, 5), j([sO?.overdue, sO?.due_today, sO?.upcoming]));

  console.log("  (c) fora do período");
  const rAntes = await aReceber(A, A.tok.owner, `?${periodoQs(somaDias(hojeStr, -8), somaDias(hojeStr, -5))}`);
  check("um período sem nenhum recebimento: Recebido zero, 0 itens, lista vazia", faixa(rAntes.corpo?.data?.summary?.received, 0, 0) && (rAntes.corpo?.data?.received_items ?? []).length === 0, j(rAntes.corpo?.data?.summary?.received));
  const rTres = await aReceber(A, A.tok.owner, `?${periodoQs(H3, ONTEM)}`);
  check("de três dias atrás a ontem entram os recebimentos dos dois dias: R$ 290 em 5 itens", faixa(rTres.corpo?.data?.summary?.received, 290, 5), j(rTres.corpo?.data?.summary?.received));
  const soH3 = await aReceber(A, A.tok.owner, `?${periodoQs(H3, H3)}`);
  check("só três dias atrás: R$ 20 em 1 item (o fiado quitado)", faixa(soH3.corpo?.data?.summary?.received, 20, 1), j(soH3.corpo?.data?.summary?.received));

  console.log("  (c) o dinheiro do ato da venda fica fora");
  const rHoje = await aReceber(A, A.tok.owner, `?${periodoQs(H3, hojeStr)}`);
  const itH = (rHoje.corpo?.data?.received_items ?? []) as Dado[];
  check("nenhum item de dinheiro ou PIX em received_items (a venda de R$ 40 em dinheiro de hoje não entra)", itH.length > 0 && !itH.some((i) => i.kind === "dinheiro" || i.kind === "pix"), j(itH.map((i) => [i.kind, i.amount])));
  check("até hoje, a parcela de cartão que cai hoje (200) conta como caída: R$ 490 em 6 itens", faixa(rHoje.corpo?.data?.summary?.received, 490, 6), j(rHoje.corpo?.data?.summary?.received));
  const datas = itH.map((i) => String(i.occurred_on));
  check("a lista vem da mais recente para a mais antiga", datas.length > 0 && datas.every((d, i) => i === 0 || datas[i - 1] >= d), j(datas));
  check("a parcela de cartão futura (300 e 60) não é recebida", itH.some((i) => i.kind === "cartao") && !itH.some((i) => i.kind === "cartao" && (n(i.amount) === 300 || n(i.amount) === 60)), j(itH.filter((i) => i.kind === "cartao").map((i) => i.amount)));

  console.log("  (d) o % do previsto");
  check("ontem: 270 recebidos contra 120 que venciam ontem e seguem abertos (30 + 20 + 20 + 40 do parcial + 10 da loja 2): 69%", sO?.received?.expected_pct === 69, `${j(sO?.received)} (270 / 390 = 69,23)`);
  check("três dias atrás: só o recebido (nada vencia nem seguia aberto naquele dia): 100%", soH3.corpo?.data?.summary?.received?.expected_pct === 100, j(soH3.corpo?.data?.summary?.received));
  check("período vazio e sem previsto: expected_pct é null (não 0 nem NaN)", rAntes.corpo?.data?.summary?.received?.expected_pct === null, j(rAntes.corpo?.data?.summary?.received));
  check("o % é inteiro", Number.isInteger(sO?.received?.expected_pct));
}

// ---------------------------------------------------------------------------
// Seção 5: o fuso
// ---------------------------------------------------------------------------

async function secao5() {
  secaoAtual = "5";
  console.log("\nSeção 5: o fuso no limite do período");
  const M2 = X.M2 as string;
  const r = await aReceber(A, A.tok.owner, `?${periodoQs(`${M2}-01`, ultimoDia(M2))}`);
  const s = r.corpo?.data?.summary;
  const it = (r.corpo?.data?.received_items ?? []) as Dado[];
  check("o mês inteiro, com recebimento às 22h de Brasília do último dia e outro à 0h30 do dia 1: R$ 20 em 2 itens", faixa(s?.received, 20, 2), j(s?.received));
  check("o das 22h do último dia conta no mês (e não no seguinte)", it.some((i) => i.occurred_on === ultimoDia(M2)), j(it.map((i) => i.occurred_on)));
  check("o da 0h30 do dia 1 conta no dia 1 do mês", it.some((i) => i.occurred_on === `${M2}-01`), j(it.map((i) => i.occurred_on)));
  check("o das 22h do último dia do mês ANTERIOR (que em UTC cai no dia 1) fica de fora", it.length === 2, j(it.map((i) => i.occurred_on)));
  check("o da 0h30 do dia 1 do mês SEGUINTE fica de fora", it.length > 0 && it.every((i) => i.occurred_on <= ultimoDia(M2)), j(it.map((i) => i.occurred_on)));
  const dia = await aReceber(A, A.tok.owner, `?${periodoQs(ultimoDia(M2), ultimoDia(M2))}`);
  check("o dia do limite sozinho tem o recebimento das 22h: R$ 10 em 1 item", faixa(dia.corpo?.data?.summary?.received, 10, 1), j(dia.corpo?.data?.summary?.received));
}

// ---------------------------------------------------------------------------
// Seção 6: A pagar
// ---------------------------------------------------------------------------

async function secao6() {
  secaoAtual = "6";
  console.log("\nSeção 6: A pagar");
  const r = await aPagarResumo(A, A.tok.owner, `?${periodoQs(ONTEM, ONTEM)}`);
  const s = r.corpo?.data?.summary;
  check("o Dono lê o resumo do A pagar: 200", r.status === 200, `${r.status} ${j(r.corpo).slice(0, 200)}`);
  check("a resposta traz summary, paid_items e period", !!s && Array.isArray(r.corpo?.data?.paid_items) && r.corpo?.data?.period?.de === ONTEM && r.corpo?.data?.period?.ate === ONTEM, j(Object.keys(r.corpo?.data ?? {})));
  console.log("  (e) os quatro recortes");
  check("Vencida: só a de R$ 70 de ontem (a cancelada de 33 fica fora): R$ 70 em 1", faixa(s?.overdue, 70, 1), j(s?.overdue));
  check("Vence hoje: R$ 80 em 1", faixa(s?.due_today, 80, 1), j(s?.due_today));
  check("A vencer: 90 de amanhã + 100 da loja 2 + 55 sem vencimento = R$ 245 em 3", faixa(s?.upcoming, 245, 3), j(s?.upcoming));
  check("undated_count é 1 (a conta sem vencimento)", s?.upcoming?.undated_count === 1, j(s?.upcoming));
  console.log("  (e) Pago no período");
  check("Pago ontem: R$ 60 em 1 (a de três dias atrás fica fora)", faixa(s?.paid, 60, 1), j(s?.paid));
  const pagos = (r.corpo?.data?.paid_items ?? []) as Dado[];
  check("paid_items traz 1 linha de R$ 60, com paid_on de ontem e a origem avulsa", pagos.length === 1 && perto(pagos[0]?.amount, 60) && pagos[0]?.paid_on === ONTEM && pagos[0]?.origin === "avulsa", j(pagos));
  check("a linha traz entry_id, nome, source_label e a loja", pagos[0]?.entry_id === X.P7 && typeof pagos[0]?.name === "string" && typeof pagos[0]?.source_label === "string" && typeof pagos[0]?.establishment_name === "string", j(pagos[0]));
  check("a linha traz o fornecedor (id e nome)", pagos[0]?.supplier_id === X.S1.id && pagos[0]?.supplier_name === X.S1.name, j([pagos[0]?.supplier_id, pagos[0]?.supplier_name]));
  const tres = await aPagarResumo(A, A.tok.owner, `?${periodoQs(H3, ONTEM)}`);
  check("de três dias atrás a ontem: Pago R$ 100 em 2", faixa(tres.corpo?.data?.summary?.paid, 100, 2), j(tres.corpo?.data?.summary?.paid));
  check("o resumo de Vencida, Vence hoje e A vencer não depende do período", faixa(tres.corpo?.data?.summary?.overdue, 70, 1) && faixa(tres.corpo?.data?.summary?.due_today, 80, 1) && faixa(tres.corpo?.data?.summary?.upcoming, 245, 3));
  console.log("  (d) o % do previsto");
  check("ontem: 60 pagos contra 70 que venciam e seguem abertos: 46% (60/130)", s?.paid?.expected_pct === 46, j(s?.paid));
  check("três dias atrás a ontem: 100 pagos contra 70 abertos: 59% (100/170)", tres.corpo?.data?.summary?.paid?.expected_pct === 59, j(tres.corpo?.data?.summary?.paid));
  const vazio = await aPagarResumo(A, A.tok.owner, `?${periodoQs(somaDias(hojeStr, -8), somaDias(hojeStr, -5))}`);
  check("período sem pagamento e sem conta vencendo: Pago zero e expected_pct null", faixa(vazio.corpo?.data?.summary?.paid, 0, 0) && vazio.corpo?.data?.summary?.paid?.expected_pct === null && (vazio.corpo?.data?.paid_items ?? []).length === 0, j(vazio.corpo?.data?.summary?.paid));
  const semPeriodo = await aPagarResumo(A, A.tok.owner);
  check("sem de e ate o período é Este mês", semPeriodo.corpo?.data?.period?.de === `${mesCorrente}-01` && semPeriodo.corpo?.data?.period?.ate === ultimoDia(mesCorrente), j(semPeriodo.corpo?.data?.period));
  console.log("  (f) o fuso do Pago");
  const M2 = X.M2 as string;
  const fus = await aPagarResumo(A, A.tok.owner, `?${periodoQs(`${M2}-01`, ultimoDia(M2))}`);
  const itens = (fus.corpo?.data?.paid_items ?? []) as Dado[];
  check("o mês inteiro com pagamento às 22h do último dia e outro à 0h30 do dia 1: R$ 20 em 2", faixa(fus.corpo?.data?.summary?.paid, 20, 2), j(fus.corpo?.data?.summary?.paid));
  check("os dois itens são do último dia e do dia 1 do mês (dia de Brasília)", itens.some((i) => i.paid_on === ultimoDia(M2)) && itens.some((i) => i.paid_on === `${M2}-01`), j(itens.map((i) => i.paid_on)));
  console.log("  (e) a conta cancelada e o resumo vs. a lista");
  const lis = await chamar(A.tok.owner, R.payables, "GET", "emporio/payables?status=pending&limit=500");
  const pend = lista(lis);
  check("a lista de pendentes de hoje continua uma lista e a cancelada (33) não está nela", lis.status === 200 && Array.isArray(lis.corpo?.data) && !pend.some((c) => c.entry_id === X.P6), `${lis.status}`);
  check("a soma dos vencimentos da lista bate com os três cartões (70 + 80 + 90 + 100 + 55)", perto(pend.reduce((t, c) => t + n(c.open_amount), 0), 395), j(pend.map((c) => c.open_amount)));
}

// ---------------------------------------------------------------------------
// Seção 7: campos de link
// ---------------------------------------------------------------------------

async function secao7() {
  secaoAtual = "7";
  console.log("\nSeção 7: campos de link");
  const r = await aReceber(A, A.tok.owner);
  const cards = (r.corpo?.data?.cards ?? []) as Dado[];
  const c2 = cards.find((c) => c.sale_id === X.vC2);
  const c3 = cards.find((c) => c.sale_id === X.vC3);
  const c5 = cards.find((c) => c.sale_id === X.vC5);
  console.log("  (g) o cartão a receber");
  check("o cartão de hoje traz sale_number da venda, customer_id e customer_name do cliente", !!c2 && c2.sale_number === X.nC.C2 && c2.customer_id === X.Ck.id && c2.customer_name === X.Ck.name, j(c2));
  check("o de amanhã também", !!c3 && c3.sale_number === X.nC.C3 && c3.customer_id === X.Ck.id && c3.customer_name === X.Ck.name, j(c3));
  check("a parcela de venda SEM cliente traz customer_id e customer_name nulos (e o sale_number)", !!c5 && c5.customer_id === null && c5.customer_name === null && c5.sale_number === X.nC.C5, j(c5));
  check("installment e installments seguem no contrato (para 'Venda nº X (1/1)')", !!c2 && c2.installment === 1 && c2.installments === 1, j(c2));
  console.log("  (g) o fiado por cliente, por recorte");
  const fiadoV = (r.corpo?.data?.fiado ?? []) as Dado[];
  const f = (c: Dado) => fiadoV.find((x) => x.customer_id === c.id);
  check("o fiado que vence hoje: due_today_amount 40, upcoming_amount 0, overdue_amount 0", perto(f(X.F2)?.due_today_amount, 40) && perto(f(X.F2)?.upcoming_amount, 0) && perto(f(X.F2)?.overdue_amount, 0), j(f(X.F2)));
  check("o fiado de amanhã: upcoming_amount 50, due_today_amount 0", perto(f(X.F3)?.upcoming_amount, 50) && perto(f(X.F3)?.due_today_amount, 0), j(f(X.F3)));
  check("o fiado vencido: overdue_amount 30 e os outros dois recortes em 0", perto(f(X.F1)?.overdue_amount, 30) && perto(f(X.F1)?.due_today_amount, 0) && perto(f(X.F1)?.upcoming_amount, 0), j(f(X.F1)));
  console.log("  (g) o extrato");
  const ext = await chamar(A.tok.owner, R.statement, "GET", `emporio/finance/statement?kind=conta&id=${A.conta}&${periodoQs(H3, hojeStr)}`);
  const linhas = (ext.corpo?.data?.lines ?? []) as Dado[];
  check("o extrato da conta: 200", ext.status === 200, `${ext.status} ${j(ext.corpo).slice(0, 160)}`);
  const lC1 = linhas.find((l) => l.kind === "cartao" && l.sale_id === X.vC1);
  check("a linha da parcela de cartão de ontem traz sale_id e customer_id", !!lC1 && lC1.customer_id === X.Ck.id, j(linhas.filter((l) => l.kind === "cartao").map((l) => [l.sale_id, l.customer_id])));
  const lB4 = linhas.find((l) => l.origin === "boleto_pago" && l.sale_id === X.vB4);
  check("a linha do boleto pago traz sale_id e customer_id do cliente do boleto", !!lB4 && lB4.customer_id === X.Cb.id, j(linhas.map((l) => [l.origin, l.sale_id, l.customer_id])));
  check("toda linha tem as duas chaves (nulas sem venda, nunca ausentes)", linhas.length > 0 && linhas.every((l) => "sale_id" in l && "customer_id" in l), j(linhas.filter((l) => !("sale_id" in l && "customer_id" in l)).map((l) => l.origin)));
  console.log("  (g) a conta a pagar");
  const lis = await chamar(A.tok.owner, R.payables, "GET", "emporio/payables?status=all&limit=500");
  const contas = lista(lis);
  const cp1 = contas.find((c) => c.entry_id === X.P1);
  const cp2 = contas.find((c) => c.entry_id === X.P2);
  check("a conta com fornecedor traz supplier_id", cp1?.supplier_id === X.S1.id, j(cp1));
  check("a conta sem fornecedor traz supplier_id nulo (a chave existe)", !!cp2 && "supplier_id" in cp2 && cp2.supplier_id === null, j(cp2));
}

// ---------------------------------------------------------------------------
// Seção 8: a ficha do cliente
// ---------------------------------------------------------------------------

async function fixturesF() {
  const P = await prismaCru();
  const tenant = F.tenantId;
  const tag = (s: string) => `${s}-${stamp}`;
  const setCheque = (num: string, data: Dado) => P.emporioCheck.updateMany({ where: { tenant_id: tenant, number: num }, data });
  const setBoleto = (num: string, data: Dado) => P.emporioBoleto.updateMany({ where: { tenant_id: tenant, number: num }, data });
  const idBoleto = async (num: string) => String((await P.emporioBoleto.findFirst({ where: { tenant_id: tenant, number: num } }))?.id ?? "");

  X.Z = await cliente(F, "Ficha");
  X.vDin = await vender(F, X.Z, F.L1, 100, [{ kind: "dinheiro", amount: 100 }]);
  X.vCar = await vender(F, X.Z, F.L1, 50, [{ kind: "credito_vista", amount: 50 }]);
  X.vFia1 = await fiado(F, X.Z, F.L1, 80, -1);
  X.vFia2 = await fiado(F, X.Z, F.L1, 40, 5);
  await vender(F, X.Z, F.L1, 60, [chequeP(60, tag("Z1"))]);
  await vender(F, X.Z, F.L1, 20, [chequeP(20, tag("Z2"))]);
  await vender(F, X.Z, F.L1, 90, [chequeP(90, tag("Z3"))]);
  await vender(F, X.Z, F.L1, 40, [chequeP(40, tag("Z4"))]);
  await vender(F, X.Z, F.L1, 70, [boletoP(70, tag("ZB1"))]);
  X.vZB2 = await vender(F, X.Z, F.L1, 30, [boletoP(30, tag("ZB2"))]);
  X.vCancelada = await vender(F, X.Z, F.L1, 30, [{ kind: "dinheiro", amount: 30 }]);
  await cancelarVenda(F, X.vCancelada, F.L1);
  await setCheque(tag("Z1"), { good_for: meioDia(emDias(7)) });
  await setCheque(tag("Z2"), { good_for: meioDia(emDias(-2)) });
  await setCheque(tag("Z3"), { status: "compensado", cleared_at: new Date(), bank_account_id: F.conta });
  await setCheque(tag("Z4"), { status: "devolvido", returned_at: new Date(), return_reason: "Sem fundos" });
  await setBoleto(tag("ZB1"), { due_on: meioDia(ONTEM) });
  const pg = await chamar(F.tok.owner, R.boletoPay, "POST", "", { bank_account_id: F.conta }, await idBoleto(tag("ZB2")));
  if (!ok2xx(pg)) throw new Error(`baixa do boleto da ficha: ${pg.status} ${j(pg.corpo)}`);
  await receberFiado(F, X.Z, 30); // vai para o fiado que vence primeiro (o de 80, vencido): sobram 50
  // a devolução em dinheiro de 20 sobre a venda em dinheiro de 100
  const item = await P.emporioSaleItem.findFirst({ where: { sale_id: X.vDin } });
  const dev = await chamar(F.tok.owner, R.saleReturn, "POST", `emporio/sales/${X.vDin}/return`,
    { operation_key: chave("dev"), refund_kind: "dinheiro", cash_register_id: F.reg[F.L1], items: [{ sale_item_id: item?.id, quantity: 2 }] }, X.vDin);
  if (!ok2xx(dev)) throw new Error(`devolução da ficha: ${dev.status} ${j(dev.corpo)}`);

  // Y: duas lojas (a do Gestor e a outra), para o recorte por loja
  X.Y = await cliente(F, "Duas lojas");
  await vender(F, X.Y, F.L1, 10, [{ kind: "dinheiro", amount: 10 }]);
  await vender(F, X.Y, F.L2, 20, [{ kind: "dinheiro", amount: 20 }]);
  await fiado(F, X.Y, F.L1, 10, -1);
  await fiado(F, X.Y, F.L2, 20, -1);
}

async function secao8() {
  secaoAtual = "8";
  console.log("\nSeção 8: a ficha do cliente e a lista de recebimentos");
  const r = await chamar(F.tok.owner, R.customer, "GET", `emporio/customers/${X.Z.id}`, undefined, X.Z.id);
  const rs = r.corpo?.data?.resumo;
  check("o Dono lê a ficha: 200", r.status === 200, `${r.status} ${j(r.corpo).slice(0, 160)}`);
  console.log("  (f) o resumo");
  check("em_aberto = fiado 50 + 40, cheques em carteira 60 + 20, boleto aberto 70 = R$ 240", perto(rs?.em_aberto, 240), j(rs));
  check("vencido = fiado 50 (o de 80 menos os 30 pagos) + cheque 20 + boleto 70 = R$ 140", perto(rs?.vencido, 140), j(rs));
  check("recebido = dinheiro 100 + cartão 50 + fiado 30 + cheque compensado 90 + boleto pago 30, menos a devolução em dinheiro 20 = R$ 280", perto(rs?.recebido, 280), j(rs));
  check("Total comprado e Última compra seguem no resumo, e vendas_ativas segue no contrato", typeof rs?.total_comprado === "number" && typeof rs?.ultima_compra_em === "string" && typeof rs?.vendas_ativas === "number", j(rs));
  console.log("  (f) a lista de recebimentos");
  const rc = await chamar(F.tok.owner, R.receipts, "GET", `emporio/customers/${X.Z.id}/receipts`, undefined, X.Z.id);
  const itens = (rc.corpo?.data?.items ?? []) as Dado[];
  check("a rota de recebimentos: 200 e items", rc.status === 200 && Array.isArray(rc.corpo?.data?.items), `${rc.status} ${j(rc.corpo).slice(0, 160)}`);
  const kinds = new Set(itens.map((i) => i.kind));
  check("traz dinheiro, cartão, fiado, cheque e boleto", ["dinheiro", "cartao", "fiado", "cheque", "boleto"].every((k) => kinds.has(k)), j([...kinds]));
  const cheques = itens.filter((i) => i.kind === "cheque");
  const status = new Set(cheques.map((c) => c.check_status));
  check("os cheques vêm com check_status em qualquer situação: recebido, compensado e devolvido", ["recebido", "compensado", "devolvido"].every((s) => status.has(s)), j(cheques.map((c) => [c.amount, c.check_status])));
  check("o cheque compensado é de R$ 90", cheques.some((c) => c.check_status === "compensado" && perto(c.amount, 90)), j(cheques));
  check("a venda cancelada não tem linha", itens.length > 0 && !itens.some((i) => i.sale_id === X.vCancelada), j(itens.filter((i) => i.sale_id === X.vCancelada)));
  check("o boleto aberto (70) não tem linha, o pago (30) tem", !itens.some((i) => i.kind === "boleto" && perto(i.amount, 70)) && itens.some((i) => i.kind === "boleto" && perto(i.amount, 30) && i.sale_id === X.vZB2), j(itens.filter((i) => i.kind === "boleto")));
  check("o fiado recebido (30) vem como linha de fiado", itens.some((i) => i.kind === "fiado" && perto(i.amount, 30)), j(itens.filter((i) => i.kind === "fiado")));
  // Juiz da frente A, achado 3: a lista precisa somar o mesmo que o cartão Recebido.
  check("a devolução em dinheiro (20) vem como linha negativa", itens.some((i) => i.kind === "devolucao" && perto(i.amount, -20)), j(itens.filter((i) => i.kind === "devolucao")));
  const somaDaLista = itens
    .filter((i) => i.kind !== "cheque" || i.check_status === "compensado")
    .reduce((s, i) => s + Math.round(Number(i.amount) * 100), 0) / 100;
  check("a lista (sem cheque fora de compensado) soma o Recebido de R$ 280", perto(somaDaLista, 280), String(somaDaLista));
  check("cada linha traz sale_number quando há venda", itens.length > 0 && itens.filter((i) => i.sale_id).every((i) => typeof i.sale_number === "number"), j(itens.filter((i) => i.sale_id && typeof i.sale_number !== "number")));
  const datas = itens.map((i) => String(i.occurred_on));
  check("da mais recente para a mais antiga", datas.length > 0 && datas.every((d, i) => i === 0 || datas[i - 1] >= d), j(datas));
  check("com menos de 20 linhas não há próxima página (next_before nulo)", rc.corpo?.data?.next_before === null, j(rc.corpo?.data?.next_before));
  const pag = await chamar(F.tok.owner, R.receipts, "GET", `emporio/customers/${X.Z.id}/receipts?limit=2`, undefined, X.Z.id);
  check("limit=2 devolve 2 linhas e um next_before", (pag.corpo?.data?.items ?? []).length === 2 && typeof pag.corpo?.data?.next_before === "string", j([pag.status, (pag.corpo?.data?.items ?? []).length, pag.corpo?.data?.next_before]));
  const ruim = await chamar(F.tok.owner, R.receipts, "GET", `emporio/customers/${X.Z.id}/receipts?before=banana`, undefined, X.Z.id);
  check("before inválido: 422 com field before", erro(ruim, 422, "before"), `${ruim.status} ${j(ruim.corpo?.error)}`);
  const ruim2 = await chamar(F.tok.owner, R.receipts, "GET", `emporio/customers/${X.Z.id}/receipts?limit=abc`, undefined, X.Z.id);
  check("limit inválido: 422 com field limit", erro(ruim2, 422, "limit"), `${ruim2.status} ${j(ruim2.corpo?.error)}`);
  const inexistente = await chamar(F.tok.owner, R.receipts, "GET", "emporio/customers/nao-existe/receipts", undefined, "nao-existe");
  check("cliente que não existe: 404", inexistente.status === 404, `${inexistente.status}`);
}

// ---------------------------------------------------------------------------
// Seção 9: as lojas do ator
// ---------------------------------------------------------------------------

async function secao9() {
  secaoAtual = "9";
  console.log("\nSeção 9: lojas do ator (Gestor de uma loja não soma a outra)");
  console.log("  A receber, por loja");
  const l1 = await aReceber(A, A.tok.owner, `?establishment_id=${A.L1}`);
  check("o Dono filtrando a Loja 1: Vencido R$ 110 em 4 (sem o fiado de 10 da Loja 2)", faixa(l1.corpo?.data?.summary?.overdue, 110, 4), j(l1.corpo?.data?.summary?.overdue));
  check("a Loja 1 mantém Vence hoje (300 em 4) e A vencer (490 em 5)", faixa(l1.corpo?.data?.summary?.due_today, 300, 4) && faixa(l1.corpo?.data?.summary?.upcoming, 490, 5), j([l1.corpo?.data?.summary?.due_today, l1.corpo?.data?.summary?.upcoming]));
  const l2 = await aReceber(A, A.tok.owner, `?establishment_id=${A.L2}`);
  check("a Loja 2: Vencido R$ 10 em 1, nada hoje, nada a vencer", faixa(l2.corpo?.data?.summary?.overdue, 10, 1) && faixa(l2.corpo?.data?.summary?.due_today, 0, 0) && faixa(l2.corpo?.data?.summary?.upcoming, 0, 0), j(l2.corpo?.data?.summary));
  const rec2 = await aReceber(A, A.tok.owner, `?establishment_id=${A.L2}&${periodoQs(ONTEM, ONTEM)}`);
  check("a Loja 2 não soma o Recebido de ontem da Loja 1 (0 itens)", faixa(rec2.corpo?.data?.summary?.received, 0, 0) && (rec2.corpo?.data?.received_items ?? []).length === 0, j(rec2.corpo?.data?.summary?.received));
  const rec1 = await aReceber(A, A.tok.owner, `?establishment_id=${A.L1}&${periodoQs(ONTEM, ONTEM)}`);
  check("a Loja 1 soma o Recebido de ontem inteiro (R$ 270 em 4)", faixa(rec1.corpo?.data?.summary?.received, 270, 4), j(rec1.corpo?.data?.summary?.received));
  check("o Gestor de uma loja não lê o A receber (só o Financeiro, o Gerente geral e o Dono): 403", (await aReceber(A, A.tok.gestor)).status === 403);
  check("nem com establishment_id da própria loja: 403", (await aReceber(A, A.tok.gestor, `?establishment_id=${A.L1}`)).status === 403);

  console.log("  A pagar, por loja e o Gestor");
  const p2 = await aPagarResumo(A, A.tok.owner, `?establishment_id=${A.L2}&${periodoQs(ONTEM, ONTEM)}`);
  check("o Dono filtrando a Loja 2: A vencer R$ 100 em 1, sem vencida, sem hoje, sem Pago", faixa(p2.corpo?.data?.summary?.upcoming, 100, 1) && faixa(p2.corpo?.data?.summary?.overdue, 0, 0) && faixa(p2.corpo?.data?.summary?.due_today, 0, 0) && faixa(p2.corpo?.data?.summary?.paid, 0, 0), j(p2.corpo?.data?.summary));
  const g = await aPagarResumo(A, A.tok.gestor, `?${periodoQs(ONTEM, ONTEM)}`);
  const sg = g.corpo?.data?.summary;
  check("o Gestor da Loja 1 lê o resumo do A pagar: 200", g.status === 200, `${g.status} ${j(g.corpo?.error)}`);
  check("o Gestor soma só a Loja 1: A vencer R$ 145 em 2 (sem os 100 da Loja 2), 1 sem vencimento", faixa(sg?.upcoming, 145, 2) && sg?.upcoming?.undated_count === 1, j(sg?.upcoming));
  check("o Gestor: Vencida 70/1, Vence hoje 80/1 e Pago de ontem 60/1", faixa(sg?.overdue, 70, 1) && faixa(sg?.due_today, 80, 1) && faixa(sg?.paid, 60, 1), j(sg));
  const gl2 = await aPagarResumo(A, A.tok.gestor, `?establishment_id=${A.L2}`);
  check("o Gestor pedindo a Loja 2 (fora do vínculo): 404 em establishment_id", erro(gl2, 404, "establishment_id"), `${gl2.status} ${j(gl2.corpo?.error)}`);

  console.log("  A ficha, por loja");
  const dono = await chamar(F.tok.owner, R.customer, "GET", `emporio/customers/${X.Y.id}`, undefined, X.Y.id);
  const gest = await chamar(F.tok.gestor, R.customer, "GET", `emporio/customers/${X.Y.id}`, undefined, X.Y.id);
  check("o Dono vê as duas lojas do cliente: em_aberto 30, vencido 30, recebido 30", perto(dono.corpo?.data?.resumo?.em_aberto, 30) && perto(dono.corpo?.data?.resumo?.vencido, 30) && perto(dono.corpo?.data?.resumo?.recebido, 30), j(dono.corpo?.data?.resumo));
  check("o Gestor da Loja 1 vê só a dele: em_aberto 10, vencido 10, recebido 10", gest.status === 200 && perto(gest.corpo?.data?.resumo?.em_aberto, 10) && perto(gest.corpo?.data?.resumo?.vencido, 10) && perto(gest.corpo?.data?.resumo?.recebido, 10), `${gest.status} ${j(gest.corpo?.data?.resumo)}`);
  const rcDono = await chamar(F.tok.owner, R.receipts, "GET", `emporio/customers/${X.Y.id}/receipts`, undefined, X.Y.id);
  const rcGest = await chamar(F.tok.gestor, R.receipts, "GET", `emporio/customers/${X.Y.id}/receipts`, undefined, X.Y.id);
  const vD = ((rcDono.corpo?.data?.items ?? []) as Dado[]).map((i) => n(i.amount)).sort();
  const vG = ((rcGest.corpo?.data?.items ?? []) as Dado[]).map((i) => n(i.amount)).sort();
  check("os recebimentos do Dono: 10 e 20", j(vD) === j([10, 20]), j(vD));
  check("os recebimentos do Gestor da Loja 1: só o de 10", rcGest.status === 200 && j(vG) === j([10]), `${rcGest.status} ${j(vG)}`);
}

// ---------------------------------------------------------------------------
// Seção 10: isolamento entre contas
// ---------------------------------------------------------------------------

async function secao10() {
  secaoAtual = "10";
  console.log("\nSeção 10: isolamento entre contas (a conta E não tem nada, a A tem tudo)");
  const r = await aReceber(E, E.tok.owner);
  const s = r.corpo?.data?.summary;
  check("a conta E lê o A receber: 200 e tudo zerado, sem nada da A", r.status === 200 && faixa(s?.overdue, 0, 0) && faixa(s?.due_today, 0, 0) && faixa(s?.upcoming, 0, 0) && faixa(s?.received, 0, 0), `${r.status} ${j(s)}`);
  check("sem previsto na conta vazia: expected_pct nulo", s?.received?.expected_pct === null, j(s?.received));
  const rp = await aReceber(E, E.tok.owner, `?${periodoQs(H3, hojeStr)}`);
  check("received_items da conta E vazio, mesmo no período em que a A recebeu", (rp.corpo?.data?.received_items ?? []).length === 0 && faixa(rp.corpo?.data?.summary?.received, 0, 0), j(rp.corpo?.data?.summary?.received));
  const pg = await aPagarResumo(E, E.tok.owner, `?${periodoQs(H3, hojeStr)}`);
  const sp = pg.corpo?.data?.summary;
  check("o A pagar da conta E: 200 e tudo zerado, paid_items vazio", pg.status === 200 && faixa(sp?.overdue, 0, 0) && faixa(sp?.due_today, 0, 0) && faixa(sp?.upcoming, 0, 0) && faixa(sp?.paid, 0, 0) && (pg.corpo?.data?.paid_items ?? []).length === 0, `${pg.status} ${j(sp)}`);
  check("o A pagar da conta E: undated_count 0 e expected_pct nulo", sp?.upcoming?.undated_count === 0 && sp?.paid?.expected_pct === null, j(sp));
  const loja = await aPagarResumo(E, E.tok.owner, `?establishment_id=${A.L1}`);
  check("a conta E pedindo uma loja da conta A: 404 em establishment_id", erro(loja, 404, "establishment_id"), `${loja.status} ${j(loja.corpo?.error)}`);
  const lojaR = await aReceber(E, E.tok.owner, `?establishment_id=${A.L1}`);
  check("o mesmo no A receber: 404 em establishment_id", erro(lojaR, 404, "establishment_id"), `${lojaR.status} ${j(lojaR.corpo?.error)}`);
  const ficha = await chamar(E.tok.owner, R.customer, "GET", `emporio/customers/${X.F1.id}`, undefined, X.F1.id);
  check("a conta E lendo a ficha de um cliente da A: 404", ficha.status === 404, `${ficha.status}`);
  const rc = await chamar(E.tok.owner, R.receipts, "GET", `emporio/customers/${X.Z.id}/receipts`, undefined, X.Z.id);
  check("a conta E lendo os recebimentos de um cliente da F: 404", rc.status === 404, `${rc.status} ${j(rc.corpo?.error)}`);
  const ext = await chamar(E.tok.owner, R.statement, "GET", `emporio/finance/statement?kind=conta&id=${A.conta}&${periodoQs(H3, hojeStr)}`);
  check("a conta E lendo o extrato de uma conta bancária da A: recusado (4xx, sem linhas)", ext.status >= 400 && ext.status < 500, `${ext.status}`);
  const recA = await aReceber(A, A.tok.owner);
  check("e a A segue com os próprios números (Vencido 120 em 5), nada vazou nem sumiu", faixa(recA.corpo?.data?.summary?.overdue, 120, 5), j(recA.corpo?.data?.summary?.overdue));
}

// ---------------------------------------------------------------------------
// Seção 11: recusas
// ---------------------------------------------------------------------------

async function secao11() {
  secaoAtual = "11";
  console.log("\nSeção 11: de e ate inválidos");
  const a = await aReceber(A, A.tok.owner, "?de=banana");
  check("A receber, de=banana: 422 com field de", erro(a, 422, "de"), `${a.status} ${j(a.corpo?.error)}`);
  const b = await aReceber(A, A.tok.owner, `?de=${hojeStr}&ate=2026-02-31`);
  check("A receber, ate=2026-02-31 (data impossível): 422 com field ate", erro(b, 422, "ate"), `${b.status} ${j(b.corpo?.error)}`);
  const c = await aPagarResumo(A, A.tok.owner, "?de=17/11/2026");
  check("A pagar, de em formato brasileiro: 422 com field de", erro(c, 422, "de"), `${c.status} ${j(c.corpo?.error)}`);
  const d = await aPagarResumo(A, A.tok.owner, `?ate=amanha`);
  check("A pagar, ate=amanha: 422 com field ate", erro(d, 422, "ate"), `${d.status} ${j(d.corpo?.error)}`);
  check("a mensagem da recusa vem em português", typeof a.corpo?.error?.message === "string" && !/expected|invalid/i.test(a.corpo.error.message), j(a.corpo?.error));
  const sem = await aPagarResumo(A, A.tok.owner, "?establishment_id=nao-existe");
  check("A pagar, establishment_id que não existe: 404 em establishment_id", erro(sem, 404, "establishment_id"), `${sem.status} ${j(sem.corpo?.error)}`);
  const semAcesso = await chamar("token-que-nao-vale", R.payablesSummary, "GET", "emporio/payables/summary");
  check("sem sessão válida o resumo do A pagar recusa (401)", semAcesso.status === 401, `${semAcesso.status}`);
}

// ---------------------------------------------------------------------------
// Limpeza e main
// ---------------------------------------------------------------------------

async function limpar() {
  if (tenantIds.length === 0) return;
  secaoAtual = "limpeza";
  const { prisma } = await import("@/lib/prisma");
  for (const id of tenantIds) {
    await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
  }
  const modelos = [
    "emporioBoleto", "fixedExpenseOccurrence", "fixedExpenseSplit", "fixedExpenseTemplate", "variableExpenseRule",
    "emporioPaymentRequest", "emporioCreditRelease", "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "cardReceivable", "cardFeeRate", "cardAcquirer", "emporioSalePayment", "emporioSaleReturnItem",
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
      let montado = true;
      await rodar("montagem", async () => {
        secaoAtual = "montagem";
        A = await montar("A");
        F = await montar("F");
        E = await montar("E");
      }).then(() => undefined);
      if (!A || !F || !E) montado = false;
      if (!montado) {
        check("a montagem dos tenants terminou (sem ela as seções 2 a 11 não rodam)", false);
        return;
      }
      let fixturesOk = true;
      await rodar("fixtures de A", async () => {
        secaoAtual = "montagem";
        await fixturesA();
      }).catch(() => undefined);
      await rodar("fixtures de F", async () => {
        secaoAtual = "montagem";
        await fixturesF();
      }).catch(() => undefined);
      if (!X.vC5 || !X.P8 || !X.vCancelada || !X.Y) fixturesOk = false;
      if (!fixturesOk) check("as fixtures de A e de F foram montadas por inteiro (as seções 2 a 11 dependem delas)", false);
      await rodar("2", secao2);
      await rodar("3", secao3);
      await rodar("4", secao4);
      await rodar("5", secao5);
      await rodar("6", secao6);
      await rodar("7", secao7);
      await rodar("8", secao8);
      await rodar("9", secao9);
      await rodar("10", secao10);
      await rodar("11", secao11);
    });
  } finally {
    await limpar();
  }
  console.log("\nChecagens por seção:");
  for (const [s, c] of Object.entries(contagem)) console.log(`  seção ${s}: ${c.ok + c.falhas} (${c.ok} verdes, ${c.falhas} vermelhas)`);
  const total = Object.values(contagem).reduce((s, c) => s + c.ok + c.falhas, 0);
  console.log(falhas === 0 ? `\n✅ M120 verde (${total} checagens)` : `\n❌ M120: ${falhas} falha(s) em ${total} checagens`);
  // As rotas de token deixam o Redis aberto: o processo não encerra sozinho.
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
