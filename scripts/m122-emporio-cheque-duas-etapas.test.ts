import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M122: Módulo 39 (Meu Empório), cheque em duas etapas (frente C, Q354 a Q356).
 * Roda: `npm run test:m122`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-18-emporio-cheque-duas-etapas-design.md e do bloco
 * Interfaces do plano, sem ler a implementação nova. O que está sob prova passa pela ROTA (Request
 * construído); as fixtures usam as rotas já existentes e Prisma (datas exatas, estados forçados).
 * Rota ou módulo que ainda não existe vira falha de checagem (status 0), nunca exceção que derruba a suíte.
 *
 * Seção 1: chequeIncompleto, pura.
 * Seção 2: venda com o cheque só valor e nome, dados parciais, recusas de formato.
 * Seção 3: carteira: o sem data vai ao topo, depositar incompleto, voltou e cancelar a venda.
 * Seção 4: completar e corrigir (PATCH /checks/:id), recusas, 409 fora da carteira, Histórico.
 * Seção 5: permissão e isolamento (Gestor da loja, Gestor de outra loja, Vendedor, Caixa, outro tenant).
 * Seção 6: somas: A receber, Hoje (e checks_to_complete), Projeção e ficha do cliente.
 * Seção 7: editar a venda com cheque incompleto.
 * Seção 8: corrida entre completar ou corrigir e depositar o mesmo cheque.
 *
 * Leituras adotadas onde a spec era ambígua (ver o relato):
 * - datas no corpo vão como AAAA-MM-DD (o que as rotas de venda já aceitam);
 * - mandar `bank: null` num cheque que AINDA não tem banco é aceito (deixar vazio o que falta), desde
 *   que o corpo traga outro dado; apagar o que já existe é 422 no campo;
 * - `HojeView.receivables_due.checks` segue a regra de antes (bom para até hoje, atrasados inclusive):
 *   o cheque sem data fica fora dele, e o `checks_to_complete` o conta;
 * - a recusa de formato do cheque na venda (data inválida, número ou banco longo, nome vazio) sai com
 *   field `payments`, como as recusas de cheque que já existiam;
 * - o Histórico do voltou/cancelar de cheque incompleto diz "sem número" e nunca "null".
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

console.log("🧾 M122: Módulo 39 (Meu Empório), cheque em duas etapas: balcão com valor e nome, completar depois (Q354 a Q356)\n");

const tenantIds: string[] = [];
const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, k: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + k * DIA).toISOString().slice(0, 10);
const emDias = (k: number) => somaDias(hojeStr, k);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const diaDe = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null);
const n = (x: unknown) => Number(x);
const cent = (x: unknown) => Math.round(n(x) * 100);
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;

// ---------------------------------------------------------------------------
// Seção 1 (pura)
// ---------------------------------------------------------------------------

async function secao1Pura() {
  secaoAtual = "1";
  console.log("1. chequeIncompleto, pura (sem banco)");
  let M: Dado = null;
  try {
    M = await import("@/lib/emporio/cheque");
  } catch (e) {
    check("src/lib/emporio/cheque.ts existe e importa", false, e instanceof Error ? e.message.slice(0, 100) : String(e));
    return;
  }
  check("o módulo exporta chequeIncompleto", typeof M.chequeIncompleto === "function");
  if (typeof M.chequeIncompleto !== "function") return;
  const f = (o: Dado): boolean => M.chequeIncompleto({ status: "recebido", number: "123", bank: "Sicredi", good_for: new Date("2026-12-01T12:00:00Z"), ...o });
  check("recebido e completo (data como Date): false", f({}) === false);
  check("recebido e completo (data como texto): false", f({ good_for: "2026-12-01" }) === false);
  check("falta só o número: true", f({ number: null }) === true);
  check("falta só o banco: true", f({ bank: null }) === true);
  check("falta só o bom para: true", f({ good_for: null }) === true);
  check("faltam número e banco: true", f({ number: null, bank: null }) === true);
  check("faltam os três: true", f({ number: null, bank: null, good_for: null }) === true);
  for (const st of ["depositado", "compensado", "devolvido", "devolvido_ao_cliente"]) {
    check(`${st} com os três nulos: false (só existe em recebido)`, f({ status: st, number: null, bank: null, good_for: null }) === false);
    check(`${st} completo: false`, f({ status: st }) === false);
  }

  console.log("  (b) grupoNaCarteira e ordenarCarteira (Q369)");
  check("o módulo exporta grupoNaCarteira e ordenarCarteira", typeof M.grupoNaCarteira === "function" && typeof M.ordenarCarteira === "function");
  if (typeof M.grupoNaCarteira !== "function" || typeof M.ordenarCarteira !== "function") return;
  const g = (o: Dado): number => M.grupoNaCarteira({ status: "recebido", number: "123", bank: "Sicredi", good_for: new Date("2026-12-01T12:00:00Z"), ...o });
  check("recebido sem bom para e sem número: grupo 1", g({ good_for: null, number: null }) === 1);
  check("recebido sem bom para (com número e banco): grupo 1", g({ good_for: null }) === 1);
  check("recebido com bom para e sem banco: grupo 2", g({ bank: null }) === 2);
  check("recebido com bom para e sem número: grupo 2", g({ number: null }) === 2);
  check("recebido completo: grupo 3", g({}) === 3);
  check("depositado sem número: grupo 3", g({ status: "depositado", number: null }) === 3);
  const d = (dia: string) => new Date(`${dia}T12:00:00Z`);
  const t = (h: number) => new Date(Date.UTC(2026, 10, 1, h));
  const linha = (id: string, o: Dado) => ({ id, status: "recebido", number: "1", bank: "X", good_for: d("2026-12-10"), created_at: t(1), ...o });
  const entrada = [
    linha("c-b", { good_for: d("2026-12-20") }),
    linha("g2", { bank: null, created_at: t(5) }),
    linha("g1-tarde", { good_for: null, number: null, created_at: t(9) }),
    linha("c-a", { good_for: d("2026-12-05") }),
    linha("g1-cedo", { good_for: null, created_at: t(2) }),
  ];
  const copia = entrada.map((x) => x.id);
  const saida: Dado[] = M.ordenarCarteira(entrada);
  check("ordenarCarteira: grupo 1 por lançamento, grupo 2, grupo 3 por bom para", j(saida.map((x) => x.id)) === j(["g1-cedo", "g1-tarde", "g2", "c-a", "c-b"]), j(saida.map((x) => x.id)));
  check("ordenarCarteira devolve cópia e não muda a entrada", j(entrada.map((x) => x.id)) === j(copia) && saida !== entrada);
}

// ---------------------------------------------------------------------------
// Montagem (banco)
// ---------------------------------------------------------------------------

async function comBanco(fn: () => Promise<void>) {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  await fn();
}

type Usuario = { id: string; role: "OWNER" | "OPERADOR"; email: string };
type Papeis = "owner" | "fin" | "gestor" | "gestorOutro" | "vend" | "caixa";
type Mundo = {
  rotulo: string;
  tenantId: string;
  db: Dado;
  tok: Record<Papeis, string>;
  lojas: string[];
  reg: Record<string, string>;
  cliente: string;
  consumidor: string;
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
  const Cli = await import("@/lib/actions/emporio-clientes");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M122 ${rotulo} ${stamp}`, document: `M122${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  await (prisma as Dado).emporioSettings.upsert({ where: { tenant_id: t.id }, create: { tenant_id: t.id, ...PADRAO }, update: PADRAO });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M122 ${suf}`, email: `m122-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const gestorOutro = await mk("gest2", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vend = await mk("vend", "OPERADOR");
  const caixa = await mk("caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const fin = await mk("fin", "OPERADOR", papelFinanceiro());

  const db = prismaForTenant(t.id) as Dado;
  const lojas: string[] = [];
  for (const nome of ["Loja 1", "Loja 2", "Loja 3"]) {
    const l = await Cat.criarEstabelecimentoAction(db, owner, { name: `M122 ${rotulo} ${nome}` });
    if (!l.ok) throw new Error(`loja: ${j(l)}`);
    lojas.push(l.data.id as string);
  }
  await vincularTodas(prisma, t.id, [gestor.id, vend.id, caixa.id], [lojas[0]]);
  await vincularTodas(prisma, t.id, [gestorOutro.id], [lojas[1]]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M122 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M122 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  for (const L of lojas) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
    await abrirTurnoDeTeste(db, owner, L);
  }
  const reg: Record<string, string> = {};
  for (const L of lojas) reg[L] = (await db.cashRegister.findFirst({ where: { establishment_id: L, number: 1 } }))?.id as string;
  const cli = await (prisma as Dado).emporioCustomer.create({ data: { tenant_id: t.id, name: `M122 Cliente ${rotulo}` } });
  const consumidor = (await Cli.garantirConsumidorFinal(db)).id as string;
  const conta = (await prisma.bankAccount.create({ data: { tenant_id: t.id, name: `M122 Banco ${rotulo}` } })).id;

  const tok = {} as Mundo["tok"];
  const pares: [Papeis, Usuario][] = [["owner", owner], ["fin", fin], ["gestor", gestor], ["gestorOutro", gestorOutro], ["vend", vend], ["caixa", caixa]];
  for (const [k, u] of pares) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { rotulo, tenantId: t.id, db, tok, lojas, reg, cliente: cli.id as string, consumidor, conta, prodId: prod.data.id, presId: pres.data.id };
}

// Rotas (import literal, para o bundler do tsx resolver os colchetes). A nova ainda pode não existir.
const R = {
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  sale: () => import("@/app/api/v1/emporio/sales/[id]/route"),
  cancel: () => import("@/app/api/v1/emporio/sales/[id]/cancel/route"),
  replace: () => import("@/app/api/v1/emporio/sales/[id]/replace/route"),
  checks: () => import("@/app/api/v1/emporio/checks/route"),
  cheque: () => import("@/app/api/v1/emporio/checks/[id]/route"),
  deposit: () => import("@/app/api/v1/emporio/checks/[id]/deposit/route"),
  clear: () => import("@/app/api/v1/emporio/checks/[id]/clear/route"),
  ret: () => import("@/app/api/v1/emporio/checks/[id]/return/route"),
  cash: () => import("@/app/api/v1/emporio/cash/route"),
  receivables: () => import("@/app/api/v1/emporio/finance/receivables/route"),
  today: () => import("@/app/api/v1/emporio/finance/today/route"),
  projection: () => import("@/app/api/v1/emporio/finance/projection/route"),
  customer: () => import("@/app/api/v1/emporio/customers/[id]/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST" | "PATCH", url: string, corpo?: unknown, id?: string): Promise<Resp> {
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
const ok2xx = (r: Resp) => r.status >= 200 && r.status < 300;
const recusou = (r: Resp, status: number, field?: string, code?: string) =>
  r.status === status && (field === undefined || r.corpo?.error?.field === field) && (code === undefined || r.corpo?.error?.code === code);
/** Recusa de formato do cheque na venda: o field é `payments` ou o caminho dele (`payments.0.check.good_for`). */
const recusouPag = (r: Resp) => r.status === 422 && String(r.corpo?.error?.field ?? "").split(".")[0] === "payments";
const dados = (r: Resp): Dado => r.corpo?.data;
const resumo = (r: Resp) => `${r.status} ${j(r.corpo).slice(0, 220)}`;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 12).join(" | ").slice(0, 900) : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m122-${p}-${stamp}-${(seq += 1)}`;

async function prismaCru(): Promise<Dado> {
  return (await import("@/lib/prisma")).prisma as Dado;
}

// --- fixtures ---

type CorpoCheque = { number?: string | null; bank?: string | null; good_for?: string | null; holder_name?: string | null };
const chq = (amount: number, check: CorpoCheque | null) => ({ kind: "cheque", amount, ...(check === null ? {} : { check }) });
const NOME = "Titular M122";

/** Venda pela rota (o preço é 10 o quilo, então o total dos pagamentos define a quantidade). */
function vender(w: Mundo, payments: Dado[], o: { loja?: string; cli?: string | null; tok?: string } = {}): Promise<Resp> {
  const total = payments.reduce((s, p) => s + n(p.amount), 0);
  const loja = o.loja ?? w.lojas[0];
  return chamar(o.tok ?? w.tok.owner, R.sales, "POST", "emporio/sales", {
    operation_key: chave("venda"), establishment_id: loja, cash_register_id: w.reg[loja],
    ...(o.cli === null ? {} : { customer_id: o.cli ?? w.cliente }),
    items: [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: total / 10 }],
    payments,
  });
}

const chequesDaVenda = async (saleId: string): Promise<Dado[]> => (await prismaCru()).emporioCheck.findMany({ where: { sale_id: saleId }, orderBy: { created_at: "asc" } });
const lerCheque = async (id: string): Promise<Dado> => (await prismaCru()).emporioCheck.findUnique({ where: { id } });

/** Uma venda com um cheque; devolve a venda e o cheque (linha do banco). */
async function novoCheque(w: Mundo, loja: string, ck: CorpoCheque | null, amount = 100, cli?: string): Promise<{ sale: string; id: string; resp: Resp }> {
  const resp = await vender(w, [chq(amount, ck)], { loja, cli });
  if (resp.status !== 201) throw new Error(`venda de preparação com cheque: ${resp.status} ${j(resp.corpo).slice(0, 300)}`);
  const sale = String(dados(resp).id);
  const [c] = await chequesDaVenda(sale);
  if (!c) throw new Error(`a venda ${sale} não gerou cheque`);
  return { sale, id: c.id as string, resp };
}
const soNome: CorpoCheque = { holder_name: NOME };
const completo = (bom: string, extra: CorpoCheque = {}): CorpoCheque => ({ holder_name: NOME, number: "5001", bank: "Sicredi", good_for: bom, ...extra });

const patch = (tok: string, id: string, corpo: unknown) => chamar(tok, R.cheque, "PATCH", `emporio/checks/${id}`, corpo, id);
const depositar = (tok: string, id: string, conta: string) => chamar(tok, R.deposit, "POST", `emporio/checks/${id}/deposit`, { bank_account_id: conta }, id);
const compensar = (tok: string, id: string) => chamar(tok, R.clear, "POST", `emporio/checks/${id}/clear`, {}, id);
const voltou = (tok: string, id: string, reason = "sem fundos") => chamar(tok, R.ret, "POST", `emporio/checks/${id}/return`, { reason }, id);
const cancelarVenda = (tok: string, id: string) => chamar(tok, R.cancel, "POST", `emporio/sales/${id}/cancel`, { reason: "teste M122" }, id);
const listaCheques = (tok: string, qs = "") => chamar(tok, R.checks, "GET", `emporio/checks${qs}`);
const vendaView = (tok: string, id: string) => chamar(tok, R.sale, "GET", `emporio/sales/${id}`, undefined, id);
const aReceber = (tok: string, qs = "") => chamar(tok, R.receivables, "GET", `emporio/finance/receivables${qs}`);
const hojeFin = (tok: string, qs = "") => chamar(tok, R.today, "GET", `emporio/finance/today${qs}`);
const projecao = (tok: string, qs = "") => chamar(tok, R.projection, "GET", `emporio/finance/projection${qs}`);

const nVendas = async (w: Mundo): Promise<number> => (await prismaCru()).emporioSale.count({ where: { tenant_id: w.tenantId } });
const nCheques = async (w: Mundo): Promise<number> => (await prismaCru()).emporioCheck.count({ where: { tenant_id: w.tenantId } });
const logsDe = async (id: string, action?: string): Promise<Dado[]> =>
  (await prismaCru()).emporioAuditLog.findMany({ where: { target_id: id, ...(action ? { action } : {}) }, orderBy: { created_at: "asc" } });

let A = null as unknown as Mundo;
let B = null as unknown as Mundo;

/** Os cheques sem data formam um prefixo da lista (vêm antes de qualquer datado). */
function semDataNoTopo(lista: Dado[]): { ok: boolean; nulos: number; datados: number } {
  const nulos = lista.filter((c) => c.good_for === null).length;
  const prefixo = lista.slice(0, nulos).every((c) => c.good_for === null);
  return { ok: nulos > 0 && prefixo, nulos, datados: lista.length - nulos };
}

// ---------------------------------------------------------------------------
// Seção 2: a venda com o cheque pela metade
// ---------------------------------------------------------------------------

async function secao2() {
  secaoAtual = "2";
  console.log("\n2. A venda aceita o cheque só com valor e nome, e recusa o que é de formato");
  const L = A.lojas[0];

  console.log("  (a) só valor e nome");
  const r = await vender(A, [chq(100, soNome)], { loja: L });
  check("venda de R$ 100 com cheque só valor e nome: 201", r.status === 201, resumo(r));
  const sale = String(dados(r)?.id ?? "");
  const [c] = await chequesDaVenda(sale);
  check("nasce UM cheque recebido, com número, banco e bom para nulos", !!c && c.status === "recebido" && c.number === null && c.bank === null && c.good_for === null, j(c));
  check("o titular e o valor gravados", !!c && c.holder_name === NOME && perto(n(c.amount), 100), j(c));
  check("o cheque é do cliente da venda e da loja da venda", !!c && c.customer_id === A.cliente && c.establishment_id === L, j(c));
  const lc = await listaCheques(A.tok.owner, `?establishment_id=${L}`);
  const visto = (Array.isArray(dados(lc)) ? dados(lc) : []).find((x: Dado) => x.id === c?.id);
  check("GET checks: number, bank e good_for vêm null e incomplete é true", !!visto && visto.number === null && visto.bank === null && visto.good_for === null && visto.incomplete === true, j(visto));
  const vv = await vendaView(A.tok.owner, sale);
  const pg = (dados(vv)?.payments ?? []).find((p: Dado) => p.check);
  check("a view da venda traz o cheque com os três nulos e incomplete true", !!pg && pg.check.number === null && pg.check.bank === null && pg.check.good_for === null && pg.check.incomplete === true, j(pg?.check));

  console.log("  (b) dados parciais e aparar");
  const soNumero = await novoCheque(A, L, { holder_name: NOME, number: "  7001  " });
  const c1 = await lerCheque(soNumero.id);
  check("só número (com espaços): grava aparado, banco e data nulos", c1.number === "7001" && c1.bank === null && c1.good_for === null, j(c1));
  const bancoEData = await novoCheque(A, L, { holder_name: NOME, bank: " Sicredi ", good_for: emDias(9) });
  const c2 = await lerCheque(bancoEData.id);
  check("banco e data sem número: grava aparado, número nulo", c2.number === null && c2.bank === "Sicredi" && diaDe(c2.good_for) === emDias(9), j(c2));
  const lista2 = (await listaCheques(A.tok.owner, `?establishment_id=${L}`)).corpo?.data ?? [];
  const v2 = lista2.find((x: Dado) => x.id === bancoEData.id);
  check("com data e sem número, o cheque segue incomplete true", v2?.incomplete === true && v2?.good_for === emDias(9), j(v2));
  const vazios = await novoCheque(A, L, { holder_name: NOME, number: "", bank: "   " });
  const c3 = await lerCheque(vazios.id);
  check("texto vazio ou só espaços vira null", c3.number === null && c3.bank === null, j(c3));
  const inteiro = await novoCheque(A, L, completo(emDias(12)));
  const c4 = await lerCheque(inteiro.id);
  check("com os três dados o cheque nasce completo", c4.number === "5001" && c4.bank === "Sicredi" && diaDe(c4.good_for) === emDias(12), j(c4));
  const lista4 = (await listaCheques(A.tok.owner, `?establishment_id=${L}`)).corpo?.data ?? [];
  check("e incomplete é false", lista4.find((x: Dado) => x.id === inteiro.id)?.incomplete === false);

  console.log("  (c) limites de tamanho");
  const v0 = await nVendas(A);
  const n30 = await novoCheque(A, L, { holder_name: NOME, number: "N".repeat(30) });
  check("número de 30 letras: aceito", (await lerCheque(n30.id)).number === "N".repeat(30));
  const b60 = await novoCheque(A, L, { holder_name: NOME, bank: "B".repeat(60) });
  check("banco de 60 letras: aceito", (await lerCheque(b60.id)).bank === "B".repeat(60));
  const nome120 = await novoCheque(A, L, { holder_name: "H".repeat(120) });
  check("nome de 120 letras: aceito", (await lerCheque(nome120.id)).holder_name === "H".repeat(120));
  const v1 = await nVendas(A);
  const r31 = await vender(A, [chq(100, { holder_name: NOME, number: "N".repeat(31) })], { loja: L });
  check("número de 31 letras: 422 em payments", recusouPag(r31), resumo(r31));
  const r61 = await vender(A, [chq(100, { holder_name: NOME, bank: "B".repeat(61) })], { loja: L });
  check("banco de 61 letras: 422 em payments", recusouPag(r61), resumo(r61));
  const r121 = await vender(A, [chq(100, { holder_name: "H".repeat(121) })], { loja: L });
  check("nome de 121 letras: 422 em payments", recusouPag(r121), resumo(r121));

  console.log("  (d) o que continua obrigatório");
  const rTexto = await vender(A, [chq(100, { holder_name: NOME, good_for: "amanhã" })], { loja: L });
  check("data que não é data: 422 em payments", recusouPag(rTexto), resumo(rTexto));
  const rSemNome = await vender(A, [chq(100, { number: "1", bank: "X", good_for: emDias(5) })], { loja: L });
  check("sem holder_name: 422 em payments", recusouPag(rSemNome), resumo(rSemNome));
  const rVazioNome = await vender(A, [chq(100, { holder_name: "   " })], { loja: L });
  check("nome em branco: 422 em payments", recusouPag(rVazioNome), resumo(rVazioNome));
  const rSemObj = await vender(A, [chq(100, null)], { loja: L });
  check("sem o objeto check: 422 em payments", recusouPag(rSemObj), resumo(rSemObj));
  const rCons = await vender(A, [chq(100, soNome)], { loja: L, cli: A.consumidor });
  check("Consumidor final: 422 em customer_id", recusou(rCons, 422, "customer_id"), resumo(rCons));
  const rSemCli = await vender(A, [chq(100, soNome)], { loja: L, cli: null });
  check("sem customer_id: 422 em customer_id", recusou(rSemCli, 422, "customer_id"), resumo(rSemCli));
  check("nenhuma recusa gravou venda", (await nVendas(A)) === v1);
  const rData = await vender(A, [chq(100, { holder_name: NOME, good_for: "2026-02-31" })], { loja: L });
  check("data inexistente (31/02): 422 em payments (e nada gravado)", recusouPag(rData) && (await nVendas(A)) === v1, resumo(rData));
  void v0;

  console.log("  (e) dois cheques na venda, com nomes diferentes");
  const r2 = await vender(A, [chq(60, { holder_name: "Maria de Terceiros" }), chq(40, completo(emDias(8), { holder_name: "Joao de Terceiros", number: "8002" }))], { loja: L });
  check("venda com dois cheques: 201", r2.status === 201, resumo(r2));
  const dois = await chequesDaVenda(String(dados(r2)?.id ?? ""));
  const por = (nome: string) => dois.find((x) => x.holder_name === nome);
  check("dois cheques, um por linha de pagamento, cada um com o seu titular", dois.length === 2 && !!por("Maria de Terceiros") && !!por("Joao de Terceiros"), j(dois.map((x) => x.holder_name)));
  check("o primeiro (60) é incompleto e o segundo (40) é completo", !!por("Maria de Terceiros") && por("Maria de Terceiros").number === null && perto(n(por("Maria de Terceiros").amount), 60) && por("Joao de Terceiros").number === "8002" && perto(n(por("Joao de Terceiros").amount), 40));
}

// ---------------------------------------------------------------------------
// Seção 3: a carteira
// ---------------------------------------------------------------------------

async function secao3() {
  secaoAtual = "3";
  console.log("\n3. Carteira: o sem data vai ao topo; incompleto não se deposita; voltou e cancelar valem");
  const L = A.lojas[0];
  const datado5 = await novoCheque(A, L, completo(emDias(5)));
  const datado1 = await novoCheque(A, L, completo(emDias(1)));
  const semData = await novoCheque(A, L, soNome);

  const lc = await listaCheques(A.tok.owner);
  const lst: Dado[] = Array.isArray(dados(lc)) ? dados(lc) : [];
  const t1 = semDataNoTopo(lst);
  check("GET checks: o sem data aparece e todos os sem data vêm antes dos datados", lst.some((c) => c.id === semData.id) && t1.ok && t1.datados >= 2, `nulos ${t1.nulos}, datados ${t1.datados}`);
  check("GET checks: o datado de +1 vem antes do de +5", lst.findIndex((c) => c.id === datado1.id) < lst.findIndex((c) => c.id === datado5.id) && lst.findIndex((c) => c.id === datado1.id) >= 0);
  const cx = await chamar(A.tok.owner, R.cash, "GET", "emporio/cash");
  const carteira: Dado[] = dados(cx)?.checks ?? [];
  const t2 = semDataNoTopo(carteira);
  check("Caixa: o sem data está na carteira, no topo", carteira.some((c) => c.id === semData.id) && t2.ok, `${cx.status} nulos ${t2.nulos}, datados ${t2.datados}`);
  const rc = await aReceber(A.tok.owner);
  const cartRec: Dado[] = dados(rc)?.checks ?? [];
  const t3 = semDataNoTopo(cartRec);
  check("A receber: o sem data está em checks, no topo", cartRec.some((c) => c.id === semData.id) && t3.ok, `${rc.status} nulos ${t3.nulos}, datados ${t3.datados}`);

  console.log("  (o) ordem da carteira (Q369): sem bom para, depois sem número ou banco, depois o resto");
  const loja2 = A.lojas[0];
  const g2Antes = await novoCheque(A, loja2, { holder_name: NOME, bank: "Sicredi", good_for: emDias(30) });
  const g1Depois = await novoCheque(A, loja2, soNome);
  const g3 = await novoCheque(A, loja2, completo(emDias(2)));
  const idsOrd = [g1Depois.id, g2Antes.id];
  const lo: Dado[] = (await listaCheques(A.tok.owner)).corpo?.data ?? [];
  const pos = (id: string) => lo.findIndex((c) => c.id === id);
  check("grupo 2 lançado antes de um do grupo 1 aparece depois dele", pos(g1Depois.id) >= 0 && pos(g1Depois.id) < pos(g2Antes.id), `${pos(g1Depois.id)} ${pos(g2Antes.id)}`);
  check("o grupo 2 vem antes de qualquer do grupo 3", pos(g2Antes.id) < pos(g3.id) && pos(g3.id) >= 0);
  const grupoDe = (c: Dado): number => (c.status !== "recebido" ? 3 : c.good_for === null ? 1 : c.number === null || c.bank === null ? 2 : 3);
  const gs = lo.map(grupoDe);
  check("a lista inteira vem com os grupos em ordem (1, 2, 3)", gs.every((x, i) => i === 0 || gs[i - 1] <= x), j(gs));
  const cxo = await chamar(A.tok.owner, R.cash, "GET", "emporio/cash");
  const cart: Dado[] = dados(cxo)?.checks ?? [];
  const gc = cart.map(grupoDe);
  check("a carteira do Caixa também vem em ordem de grupo", gc.length > 0 && gc.every((x, i) => i === 0 || gc[i - 1] <= x) && cart.findIndex((c) => c.id === idsOrd[0]) < cart.findIndex((c) => c.id === idsOrd[1]), j(gc));

  console.log("  (a) depositar incompleto: 409 CHEQUE_INCOMPLETO e nada muda");
  const m0 = await (await prismaCru()).cashMovement.count({ where: { check_id: semData.id } });
  const rd = await depositar(A.tok.owner, semData.id, A.conta);
  check("sem número, banco e data: 409 CHEQUE_INCOMPLETO", recusou(rd, 409, undefined, "CHEQUE_INCOMPLETO"), resumo(rd));
  check("a mensagem manda completar o número, o banco e o bom para", String(rd.corpo?.error?.message ?? "").includes("Complete o número, o banco e o bom para antes de depositar"), String(rd.corpo?.error?.message));
  const aposDep = await lerCheque(semData.id);
  check("nada mudou: segue recebido, sem conta e sem data de depósito", aposDep.status === "recebido" && aposDep.bank_account_id === null && aposDep.deposited_at === null, j(aposDep));
  check("nenhum movimento de caixa", (await (await prismaCru()).cashMovement.count({ where: { check_id: semData.id } })) === m0);
  const soDataBanco = await novoCheque(A, L, { holder_name: NOME, bank: "Sicredi", good_for: emDias(4) });
  check("com data e banco, sem número: 409 CHEQUE_INCOMPLETO", recusou(await depositar(A.tok.owner, soDataBanco.id, A.conta), 409, undefined, "CHEQUE_INCOMPLETO"));
  const semDataMasTem = await novoCheque(A, L, { holder_name: NOME, number: "9", bank: "Sicredi" });
  check("com número e banco, sem data: 409 CHEQUE_INCOMPLETO", recusou(await depositar(A.tok.owner, semDataMasTem.id, A.conta), 409, undefined, "CHEQUE_INCOMPLETO"));
  const deposito = await depositar(A.tok.owner, datado5.id, A.conta);
  check("o cheque completo deposita normalmente (a trava não é geral)", ok2xx(deposito), resumo(deposito));
  check("e fica depositado", (await lerCheque(datado5.id)).status === "depositado");

  console.log("  (b) voltou e cancelar a venda valem para o incompleto");
  const logsAntes = (await (await prismaCru()).emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, summary: { contains: "sem número" } } })).length;
  const incVolta = await novoCheque(A, L, soNome);
  const rv = await voltou(A.tok.owner, incVolta.id);
  check("marcar que voltou o cheque incompleto: 2xx", ok2xx(rv), resumo(rv));
  const cv = await lerCheque(incVolta.id);
  check("fica devolvido, com motivo e data", cv.status === "devolvido" && cv.return_reason === "sem fundos" && !!cv.returned_at, j(cv));
  const logsDepois = await (await prismaCru()).emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, summary: { contains: "sem número" } } });
  check("o Histórico do voltou diz \"sem número\"", logsDepois.length > logsAntes, `${logsAntes} -> ${logsDepois.length}`);
  check("e nenhum resumo do tenant diz null ou undefined", (await (await prismaCru()).emporioAuditLog.count({ where: { tenant_id: A.tenantId, OR: [{ summary: { contains: "null" } }, { summary: { contains: "undefined" } }] } })) === 0);
  const incCancela = await novoCheque(A, L, soNome);
  const rcn = await cancelarVenda(A.tok.owner, incCancela.sale);
  check("cancelar a venda com cheque incompleto: 2xx", ok2xx(rcn), resumo(rcn));
  check("o cheque volta ao cliente (devolvido_ao_cliente)", (await lerCheque(incCancela.id)).status === "devolvido_ao_cliente");
  const logsCancel = await (await prismaCru()).emporioAuditLog.count({ where: { tenant_id: A.tenantId, OR: [{ summary: { contains: "null" } }, { summary: { contains: "undefined" } }] } });
  check("o Histórico do cancelamento também não diz null", logsCancel === 0, String(logsCancel));
}

// ---------------------------------------------------------------------------
// Seção 4: completar e corrigir
// ---------------------------------------------------------------------------

async function secao4() {
  secaoAtual = "4";
  console.log("\n4. Completar e corrigir: PATCH /api/v1/emporio/checks/:id");
  const L = A.lojas[0];

  console.log("  (a) completar aos poucos");
  const k = await novoCheque(A, L, soNome);
  const l0 = (await logsDe(k.id, "cheque.completar")).length;
  const r1 = await patch(A.tok.fin, k.id, { number: "1001" });
  check("o Financeiro manda só o número: 2xx", ok2xx(r1), resumo(r1));
  check("a resposta traz number 1001, banco e data nulos, incomplete true", dados(r1)?.number === "1001" && dados(r1)?.bank === null && dados(r1)?.good_for === null && dados(r1)?.incomplete === true, j(dados(r1)));
  const d1 = await lerCheque(k.id);
  check("no banco só o número mudou", d1.number === "1001" && d1.bank === null && d1.good_for === null && d1.holder_name === NOME && d1.status === "recebido", j(d1));
  const r2 = await patch(A.tok.fin, k.id, { bank: "  Banco do Brasil ", good_for: emDias(20) });
  check("depois banco e bom para: 2xx", ok2xx(r2), resumo(r2));
  check("o incomplete vira false", dados(r2)?.incomplete === false && dados(r2)?.bank === "Banco do Brasil" && dados(r2)?.good_for === emDias(20), j(dados(r2)));
  const d2 = await lerCheque(k.id);
  check("no banco: número, banco aparado e a data exata", d2.number === "1001" && d2.bank === "Banco do Brasil" && diaDe(d2.good_for) === emDias(20), j(d2));
  const lg = await logsDe(k.id, "cheque.completar");
  check("o Histórico ganhou uma linha cheque.completar por escrita", lg.length - l0 === 2, `${l0} -> ${lg.length}`);
  check("a linha traz antes e depois dos campos mudados", Array.isArray(lg[l0]?.changes) && lg[l0].changes.some((c: Dado) => /^(number|número)$/i.test(String(c.campo)) && (c.antes ?? null) === null && c.depois === "1001"), j(lg[l0]?.changes));
  check("o resumo da primeira escrita não diz null", !!lg[l0] && !/null|undefined/.test(String(lg[l0].summary)), String(lg[l0]?.summary));
  const deposito = await depositar(A.tok.fin, k.id, A.conta);
  check("completo, o cheque agora deposita", ok2xx(deposito), resumo(deposito));

  console.log("  (b) corrigir um cheque completo");
  const c = await novoCheque(A, L, completo(emDias(10)));
  const rc = await patch(A.tok.owner, c.id, { good_for: emDias(25) });
  check("trocar o bom para de um cheque completo: 2xx", ok2xx(rc), resumo(rc));
  const dc = await lerCheque(c.id);
  check("a data troca e o resto fica", diaDe(dc.good_for) === emDias(25) && dc.number === "5001" && dc.bank === "Sicredi", j(dc));
  const rn = await patch(A.tok.owner, c.id, { number: "6002", bank: "Itau", holder_name: "  Novo Titular " });
  check("trocar número, banco e titular: 2xx", ok2xx(rn), resumo(rn));
  const dn = await lerCheque(c.id);
  check("os três trocados e o titular aparado", dn.number === "6002" && dn.bank === "Itau" && dn.holder_name === "Novo Titular", j(dn));

  console.log("  (c) o que não se pode fazer");
  const antes = await lerCheque(c.id);
  const semMudar = async (): Promise<boolean> => {
    const d = await lerCheque(c.id);
    return d.number === antes.number && d.bank === antes.bank && d.holder_name === antes.holder_name && diaDe(d.good_for) === diaDe(antes.good_for);
  };
  const vazio = await patch(A.tok.owner, c.id, {});
  check("corpo vazio: 422 em number", recusou(vazio, 422, "number"), resumo(vazio));
  check("com a frase \"Informe ao menos um dado do cheque.\"", String(vazio.corpo?.error?.message ?? "").includes("Informe ao menos um dado do cheque."), String(vazio.corpo?.error?.message));
  for (const campo of ["number", "bank", "good_for"]) {
    const rn2 = await patch(A.tok.owner, c.id, { [campo]: null });
    check(`apagar ${campo} já preenchido (null): 422 em ${campo}`, recusou(rn2, 422, campo), resumo(rn2));
    check(`a mensagem de ${campo} manda trocar por outro valor`, String(rn2.corpo?.error?.message ?? "").includes("Não dá para apagar: troque por outro valor."), String(rn2.corpo?.error?.message));
  }
  // A tela manda "" ao esvaziar o campo da data (achado do juiz, 18/11): a recusa é a mesma dos outros campos.
  const rDataVazia = await patch(A.tok.owner, c.id, { good_for: "" });
  check("apagar good_for já preenchido (texto vazio): 422 em good_for", recusou(rDataVazia, 422, "good_for"), resumo(rDataVazia));
  check("e a mensagem manda trocar por outro valor", String(rDataVazia.corpo?.error?.message ?? "").includes("Não dá para apagar: troque por outro valor."), String(rDataVazia.corpo?.error?.message));
  const rEsp = await patch(A.tok.owner, c.id, { number: "   " });
  check("apagar o número com espaços em branco: 422 em number", recusou(rEsp, 422, "number"), resumo(rEsp));
  const rNomeVazio = await patch(A.tok.owner, c.id, { holder_name: "" });
  check("esvaziar o nome (texto vazio): 422 em holder_name", recusou(rNomeVazio, 422, "holder_name"), resumo(rNomeVazio));
  const rNomeNulo = await patch(A.tok.owner, c.id, { holder_name: null });
  check("esvaziar o nome (null): 422 em holder_name", recusou(rNomeNulo, 422, "holder_name"), resumo(rNomeNulo));
  const rBadData = await patch(A.tok.owner, c.id, { good_for: "2026-13-40" });
  check("data inválida: 422 em good_for", recusou(rBadData, 422, "good_for"), resumo(rBadData));
  const rN31 = await patch(A.tok.owner, c.id, { number: "N".repeat(31) });
  check("número de 31 letras: 422 em number", recusou(rN31, 422, "number"), resumo(rN31));
  const rB61 = await patch(A.tok.owner, c.id, { bank: "B".repeat(61) });
  check("banco de 61 letras: 422 em bank", recusou(rB61, 422, "bank"), resumo(rB61));
  const rH121 = await patch(A.tok.owner, c.id, { holder_name: "H".repeat(121) });
  check("nome de 121 letras: 422 em holder_name", recusou(rH121, 422, "holder_name"), resumo(rH121));
  check("nenhuma recusa mexeu no cheque", await semMudar());
  const parcial = await novoCheque(A, L, soNome);
  const rPar = await patch(A.tok.owner, parcial.id, { number: "55", bank: null });
  check("deixar vazio o que ainda falta (bank null onde não há banco) é aceito", ok2xx(rPar) && (await lerCheque(parcial.id)).number === "55" && (await lerCheque(parcial.id)).bank === null, resumo(rPar));

  console.log("  (d) só em recebido: 409 CHEQUE_FORA_DA_CARTEIRA e nada muda");
  const forma = async (rotulo: string, id: string) => {
    const a = await lerCheque(id);
    const r = await patch(A.tok.owner, id, { number: "XYZ", bank: "Outro", good_for: emDias(40), holder_name: "Outro Nome" });
    check(`${rotulo}: 409 CHEQUE_FORA_DA_CARTEIRA`, recusou(r, 409, undefined, "CHEQUE_FORA_DA_CARTEIRA"), resumo(r));
    const d = await lerCheque(id);
    check(`${rotulo}: nada mudou`, d.status === a.status && d.number === a.number && d.bank === a.bank && d.holder_name === a.holder_name && diaDe(d.good_for) === diaDe(a.good_for), j(d));
  };
  const dep = await novoCheque(A, L, completo(emDias(6)));
  await depositar(A.tok.owner, dep.id, A.conta);
  await forma("depositado", dep.id);
  const comp = await novoCheque(A, L, completo(emDias(6)));
  await depositar(A.tok.owner, comp.id, A.conta);
  const rComp = await compensar(A.tok.owner, comp.id);
  check("preparação: compensar o cheque depositado", ok2xx(rComp) && (await lerCheque(comp.id)).status === "compensado", resumo(rComp));
  await forma("compensado", comp.id);
  const dev = await novoCheque(A, L, soNome);
  await voltou(A.tok.owner, dev.id);
  await forma("devolvido (voltou)", dev.id);
  const ao = await novoCheque(A, L, soNome);
  await cancelarVenda(A.tok.owner, ao.sale);
  await forma("devolvido ao cliente", ao.id);
  const logsVolta = (await logsDe(dev.id)).concat(await logsDe(ao.id));
  check("os 409 não gravaram cheque.completar", logsVolta.every((x) => x.action !== "cheque.completar"));
}

// ---------------------------------------------------------------------------
// Seção 5: permissão e isolamento
// ---------------------------------------------------------------------------

async function secao5() {
  secaoAtual = "5";
  console.log("\n5. Quem completa: Dono, Financeiro, Gestor da loja; o resto, não");
  const [L0, L1] = [A.lojas[0], A.lojas[1]];
  const k = await novoCheque(A, L0, soNome);
  const kOutra = await novoCheque(A, L1, soNome);
  const intacto = async (id: string) => {
    const d = await lerCheque(id);
    return d.number === null && d.bank === null && d.good_for === null;
  };

  const rVend = await patch(A.tok.vend, k.id, { number: "1" });
  check("Vendedor (da própria loja): 403", recusou(rVend, 403), resumo(rVend));
  const rCaixa = await patch(A.tok.caixa, k.id, { number: "2" });
  check("Caixa (da própria loja): 403", recusou(rCaixa, 403), resumo(rCaixa));
  const rOutro = await patch(A.tok.gestorOutro, k.id, { number: "3" });
  check("Gestor de OUTRA loja: 403", recusou(rOutro, 403), resumo(rOutro));
  check("as três recusas não mexeram no cheque", await intacto(k.id));
  const rB = await patch(B.tok.owner, k.id, { number: "4" });
  check("o Dono de outra conta: 404", recusou(rB, 404), resumo(rB));
  const rSem = await patch(A.tok.owner, "cheque-que-nao-existe", { number: "5" });
  check("id inexistente: 404", recusou(rSem, 404), resumo(rSem));
  check("o cheque segue intacto", await intacto(k.id));

  const rG = await patch(A.tok.gestor, k.id, { number: "9001" });
  check("Gestor DA LOJA do cheque completa: 2xx", ok2xx(rG), resumo(rG));
  check("o número gravado é o do Gestor", (await lerCheque(k.id)).number === "9001");
  const lg = (await logsDe(k.id, "cheque.completar")).find((x) => x.user_id !== null);
  check("o Histórico guarda quem completou (o Gestor) e a loja do cheque", !!lg && lg.establishment_id === L0, j(lg));
  const rGBank = await patch(A.tok.gestor, k.id, { bank: "Sicredi", good_for: emDias(14) });
  check("o Gestor também completa o resto, e o cheque fica completo", ok2xx(rGBank) && dados(rGBank)?.incomplete === false, resumo(rGBank));
  const rGfora = await patch(A.tok.gestor, kOutra.id, { number: "6" });
  check("o mesmo Gestor num cheque de outra loja: 403", recusou(rGfora, 403), resumo(rGfora));
  const rG2 = await patch(A.tok.gestorOutro, kOutra.id, { number: "9002" });
  check("o Gestor da outra loja completa o cheque da loja dele: 2xx", ok2xx(rG2) && (await lerCheque(kOutra.id)).number === "9002", resumo(rG2));
  const rOwner = await patch(A.tok.owner, kOutra.id, { bank: "Itau" });
  check("o Dono completa em qualquer loja: 2xx", ok2xx(rOwner), resumo(rOwner));
  const rFin = await patch(A.tok.fin, k.id, { number: "9003" });
  check("o Financeiro corrige o cheque de qualquer loja: 2xx", ok2xx(rFin) && (await lerCheque(k.id)).number === "9003", resumo(rFin));
  check("o cheque de outra conta não foi tocado pelo Dono de B (B não tem cheque)", (await nCheques(B)) === 0);
}

// ---------------------------------------------------------------------------
// Seção 6: as somas
// ---------------------------------------------------------------------------

async function secao6() {
  secaoAtual = "6";
  console.log("\n6. Somas: o sem data fica fora das datas e dentro do em aberto");
  const L = A.lojas[2];
  const P = await prismaCru();
  const { prisma } = await import("@/lib/prisma");
  const cli = (await (prisma as Dado).emporioCustomer.create({ data: { tenant_id: A.tenantId, name: `M122 Cliente somas ${stamp}` } })).id as string;

  // sem data (100), de hoje sem número (40), a vencer +10 sem número (50), vencido -2 completo (30)
  const semData = await novoCheque(A, L, soNome, 100, cli);
  const hoje = await novoCheque(A, L, { holder_name: NOME, bank: "Sicredi", good_for: hojeStr }, 40, cli);
  const avencer = await novoCheque(A, L, { holder_name: NOME, bank: "Sicredi", good_for: emDias(10) }, 50, cli);
  const vencido = await novoCheque(A, L, completo(emDias(5)), 30, cli);
  await P.emporioCheck.update({ where: { id: vencido.id }, data: { good_for: meioDia(emDias(-2)) } });
  const filtro = `?establishment_id=${L}`;

  console.log("  (a) A receber (faixas)");
  const ra = await aReceber(A.tok.owner, filtro);
  const s = dados(ra)?.summary;
  check("A receber lê: 200", ra.status === 200, resumo(ra));
  check("Vence hoje: só o de hoje (40,00, 1 cheque), o sem data não entra", perto(s?.due_today?.total, 40) && s?.due_today?.count === 1, j(s?.due_today));
  check("A vencer: só o de +10 (50,00, 1), mesmo sem número", perto(s?.upcoming?.total, 50) && s?.upcoming?.count === 1, j(s?.upcoming));
  check("Vencido: só o de -2 (30,00, 1), o sem data não conta como vencido", perto(s?.overdue?.total, 30) && s?.overdue?.count === 1, j(s?.overdue));
  const lista: Dado[] = dados(ra)?.checks ?? [];
  check("a carteira (checks) traz os quatro cheques, inclusive o sem data", [semData, hoje, avencer, vencido].every((x) => lista.some((c) => c.id === x.id)), `${lista.length} cheques`);
  check("o sem data é o primeiro da carteira, com good_for null e incomplete true", lista[0]?.id === semData.id && lista[0]?.good_for === null && lista[0]?.incomplete === true, j(lista[0]));
  check("o de hoje sem número tem incomplete true e o vencido completo, false", lista.find((c) => c.id === hoje.id)?.incomplete === true && lista.find((c) => c.id === vencido.id)?.incomplete === false);

  console.log("  (b) Hoje do Financeiro");
  const rh = await hojeFin(A.tok.owner, filtro);
  const h = dados(rh);
  check("Hoje lê: 200", rh.status === 200, resumo(rh));
  check("\"Vence hoje a receber\" em cheque: 70,00 em 2 (hoje e o vencido), sem o sem data", perto(h?.receivables_due?.checks?.total, 70) && h?.receivables_due?.checks?.count === 2, j(h?.receivables_due?.checks));
  check("checks_to_complete na loja: 3 cheques, 190,00 (sem data, hoje e +10)", h?.checks_to_complete?.count === 3 && perto(h?.checks_to_complete?.total, 190), j(h?.checks_to_complete));
  const rhTodas = await hojeFin(A.tok.owner);
  const incompletos = (await P.emporioCheck.findMany({ where: { tenant_id: A.tenantId, status: "recebido", OR: [{ number: null }, { bank: null }, { good_for: null }] } })) as Dado[];
  check("sem filtro, checks_to_complete é o de todas as lojas (confere com o banco)", dados(rhTodas)?.checks_to_complete?.count === incompletos.length && perto(dados(rhTodas)?.checks_to_complete?.total, incompletos.reduce((t, c) => t + n(c.amount), 0)), `${j(dados(rhTodas)?.checks_to_complete)} contra ${incompletos.length}`);
  const rhOutra = await hojeFin(A.tok.owner, `?establishment_id=${A.lojas[1]}`);
  const incLoja1 = incompletos.filter((c) => c.establishment_id === A.lojas[1]);
  check("filtrado por outra loja, conta só os dela", dados(rhOutra)?.checks_to_complete?.count === incLoja1.length && perto(dados(rhOutra)?.checks_to_complete?.total, incLoja1.reduce((t, c) => t + n(c.amount), 0)), `${j(dados(rhOutra)?.checks_to_complete)} contra ${incLoja1.length}`);

  console.log("  (c) Projeção");
  const rp = await projecao(A.tok.owner, `${filtro}&days=30`);
  const semanas: Dado[] = dados(rp)?.weeks ?? [];
  const somaCheques = semanas.reduce((t, w) => t + cent(w.receivables?.checks), 0);
  check("Projeção lê: 200", rp.status === 200, resumo(rp));
  check("os cheques da projeção somam 120,00 (hoje 40, +10 50 e o vencido 30), sem os 100 do sem data", somaCheques === 12000, `${somaCheques} centavos`);

  console.log("  (d) ficha do cliente");
  const rcli = await chamar(A.tok.owner, R.customer, "GET", `emporio/customers/${cli}`, undefined, cli);
  const rs = dados(rcli)?.resumo;
  check("a ficha lê: 200", rcli.status === 200, resumo(rcli));
  check("em aberto conta os quatro cheques: 220,00 (inclusive o sem data)", perto(rs?.em_aberto, 220), j(rs));
  check("vencido conta só o de -2: 30,00 (o sem data não é vencido)", perto(rs?.vencido, 30), j(rs));

  console.log("  (e) completar o sem data o põe nas datas");
  const rcomp = await patch(A.tok.fin, semData.id, { number: "7777", bank: "Sicredi", good_for: hojeStr });
  check("completar com data de hoje: 2xx", ok2xx(rcomp), resumo(rcomp));
  const s2 = dados(await aReceber(A.tok.owner, filtro))?.summary;
  check("Vence hoje passa a 140,00 em 2 cheques", perto(s2?.due_today?.total, 140) && s2?.due_today?.count === 2, j(s2?.due_today));
  const h2 = dados(await hojeFin(A.tok.owner, filtro));
  check("checks_to_complete cai para 2 cheques, 90,00", h2?.checks_to_complete?.count === 2 && perto(h2?.checks_to_complete?.total, 90), j(h2?.checks_to_complete));
  const rs2 = dados(await chamar(A.tok.owner, R.customer, "GET", `emporio/customers/${cli}`, undefined, cli))?.resumo;
  check("o em aberto da ficha não muda (220,00): é o mesmo dinheiro", perto(rs2?.em_aberto, 220), j(rs2));
}

// ---------------------------------------------------------------------------
// Seção 7: editar a venda
// ---------------------------------------------------------------------------

async function secao7() {
  secaoAtual = "7";
  console.log("\n7. Editar a venda com cheque incompleto");
  const L = A.lojas[0];
  const corpoReplace = (payments: Dado[]) => {
    const total = payments.reduce((s, p) => s + n(p.amount), 0);
    return {
      operation_key: chave("edicao"), establishment_id: L, cash_register_id: A.reg[L], customer_id: A.cliente,
      items: [{ emporio_product_id: A.prodId, presentation_id: A.presId, quantity: total / 10 }], payments, reason: "teste M122",
    };
  };
  const editar = (tok: string, saleId: string, payments: Dado[]) => chamar(tok, R.replace, "POST", `emporio/sales/${saleId}/replace`, corpoReplace(payments), saleId);

  console.log("  (a) o payload ainda parcial é aceito");
  const a = await novoCheque(A, L, soNome);
  const ra = await editar(A.tok.owner, a.sale, [chq(100, soNome)]);
  check("editar a venda reenviando o cheque só valor e nome: 2xx", ok2xx(ra), resumo(ra));
  const novaA = String(dados(ra)?.id ?? "");
  const [cA] = await chequesDaVenda(novaA);
  check("a venda nova tem o cheque incompleto (três nulos)", !!cA && cA.status === "recebido" && cA.number === null && cA.bank === null && cA.good_for === null, j(cA));
  check("o cheque da venda antiga voltou ao cliente", (await lerCheque(a.id)).status === "devolvido_ao_cliente");

  console.log("  (b) o payload com o que o Financeiro completou mantém os dados");
  const b = await novoCheque(A, L, soNome);
  const rf = await patch(A.tok.fin, b.id, { number: "4004", bank: "Sicredi", good_for: emDias(18) });
  check("preparação: o Financeiro completa o cheque", ok2xx(rf), resumo(rf));
  const rb = await editar(A.tok.owner, b.sale, [chq(100, { holder_name: NOME, number: "4004", bank: "Sicredi", good_for: emDias(18) })]);
  check("editar reenviando os dados completados: 2xx", ok2xx(rb), resumo(rb));
  const [cB] = await chequesDaVenda(String(dados(rb)?.id ?? ""));
  check("a venda recriada mantém número, banco e data", !!cB && cB.number === "4004" && cB.bank === "Sicredi" && diaDe(cB.good_for) === emDias(18), j(cB));
  const lc = (await listaCheques(A.tok.owner, `?establishment_id=${L}`)).corpo?.data ?? [];
  check("e o cheque novo é completo (incomplete false)", lc.find((x: Dado) => x.id === cB?.id)?.incomplete === false);
  const vv = await vendaView(A.tok.owner, String(dados(rb)?.id ?? ""));
  const pg = (dados(vv)?.payments ?? []).find((p: Dado) => p.check);
  check("a view da venda editada traz o cheque completo", !!pg && pg.check.number === "4004" && pg.check.incomplete === false, j(pg?.check));

  console.log("  (c) dois cheques, um já completado e outro ainda não");
  const c = await vender(A, [chq(60, soNome), chq(40, soNome)], { loja: L });
  const saleC = String(dados(c)?.id ?? "");
  const [c1] = await chequesDaVenda(saleC);
  await patch(A.tok.fin, c1.id, { number: "3003", bank: "Itau", good_for: emDias(22) });
  const rc = await editar(A.tok.owner, saleC, [chq(60, { holder_name: NOME, number: "3003", bank: "Itau", good_for: emDias(22) }), chq(40, soNome)]);
  check("editar com um cheque completo e outro parcial: 2xx", ok2xx(rc), resumo(rc));
  const novos = await chequesDaVenda(String(dados(rc)?.id ?? ""));
  const comDado = novos.filter((x) => x.number === "3003");
  const semDado = novos.filter((x) => x.number === null);
  check("sai um completo (60) e um incompleto (40)", novos.length === 2 && comDado.length === 1 && semDado.length === 1 && perto(n(comDado[0].amount), 60) && perto(n(semDado[0].amount), 40) && semDado[0].bank === null && semDado[0].good_for === null, j(novos));
}

// ---------------------------------------------------------------------------
// Seção 8: a corrida entre completar ou corrigir e depositar
// ---------------------------------------------------------------------------

const RODADAS_CORRIDA = 10;

async function secao8() {
  secaoAtual = "8";
  console.log(`\n8. Corrida: completar ou corrigir e depositar o MESMO cheque, em paralelo (${RODADAS_CORRIDA} rodadas cada)`);
  const L = A.lojas[0];

  console.log("  (a) cheque completo: corrigir o número e depositar");
  let semErro500a = true;
  let regraNumero = true;
  let regraRecusa = true;
  let regraStatus = true;
  let regraOrdem = true;
  let detalheA = "";
  const desfechoA = { ambas2xx: 0, deposito2xxPatch409: 0, patch2xxDeposito409: 0, outros: 0 };
  for (let i = 1; i <= RODADAS_CORRIDA; i += 1) {
    const k = await novoCheque(A, L, completo(emDias(6)));
    const alvo = `N-${i}`;
    const [rp, rd] = await Promise.all([patch(A.tok.owner, k.id, { number: alvo }), depositar(A.tok.owner, k.id, A.conta)]);
    const fim = await lerCheque(k.id);
    const nota = (m: string) => { detalheA ||= `rodada ${i}: ${m} | patch ${resumo(rp)} | deposito ${resumo(rd)} | final ${j({ s: fim.status, n: fim.number })}`; };
    if (rp.status >= 500 || rd.status >= 500 || rp.status === 0 || rd.status === 0) { semErro500a = false; nota("500 ou exceção"); }
    if (ok2xx(rp) && fim.number !== alvo) { regraNumero = false; nota("correção 2xx mas o número final não é o dela"); }
    if (ok2xx(rd) && !ok2xx(rp) && rp.status !== 409) { regraRecusa = false; nota("depósito 2xx e correção recusada sem ser 409"); }
    if ((fim.status === "depositado") !== ok2xx(rd)) { regraStatus = false; nota("status final não bate com o depósito"); }
    if (ok2xx(rd) && ok2xx(rp)) desfechoA.ambas2xx += 1;
    else if (ok2xx(rd) && rp.status === 409) desfechoA.deposito2xxPatch409 += 1;
    else if (ok2xx(rp) && rd.status === 409) desfechoA.patch2xxDeposito409 += 1;
    else desfechoA.outros += 1;
    if (ok2xx(rd) && ok2xx(rp)) {
      // as duas deram 2xx: a correção tem de ter vindo ANTES do depósito, e o Histórico conta a ordem
      const comp = (await logsDe(k.id, "cheque.completar"))[0];
      const dep = (await logsDe(k.id, "cheque.depositar"))[0];
      if (!comp || !dep || new Date(comp.created_at).getTime() > new Date(dep.created_at).getTime()) { regraOrdem = false; nota("correção 2xx gravada depois do depósito"); }
    }
  }
  check(`nenhuma resposta 500 em ${RODADAS_CORRIDA} rodadas`, semErro500a, detalheA);
  check("correção 2xx: o número final é o dela", regraNumero, detalheA);
  check("depósito 2xx e correção recusada: a correção foi 409", regraRecusa, detalheA);
  check("o status final é depositado se e só se o depósito deu 2xx", regraStatus, detalheA);
  check("quando as duas deram 2xx, a correção veio antes do depósito (Histórico)", regraOrdem, detalheA);
  console.log(`  (desfechos de (a) em ${RODADAS_CORRIDA} rodadas: ambas 2xx ${desfechoA.ambas2xx}; depósito 2xx e correção 409 ${desfechoA.deposito2xxPatch409}; correção 2xx e depósito 409 ${desfechoA.patch2xxDeposito409}; outros ${desfechoA.outros})`);

  console.log("  (b) cheque sem banco: completar o banco e depositar");
  // Limite assumido: o depósito confere chequeIncompleto numa leitura FORA da transação e o PATCH só
  // preenche o banco, então esta corrida não consegue reprovar por ordem de execução. Ela prova que não
  // há 500 e que o resultado é consistente (depositou => banco preenchido; recusou => 409 CHEQUE_INCOMPLETO).
  // Se alguém tirar chequeIncompleto do depósito, quem reprova primeiro são as seções 3 e 4.
  const desfechoB = { deposito2xx: 0, deposito409Incompleto: 0, outros: 0 };
  let semErro500b = true;
  let regraBanco = true;
  let regraIncompleto = true;
  let detalheB = "";
  for (let i = 1; i <= RODADAS_CORRIDA; i += 1) {
    const k = await novoCheque(A, L, { holder_name: NOME, number: `B-${i}`, good_for: emDias(7) });
    const [rp, rd] = await Promise.all([patch(A.tok.owner, k.id, { bank: "Sicredi" }), depositar(A.tok.owner, k.id, A.conta)]);
    const fim = await lerCheque(k.id);
    const nota = (m: string) => { detalheB ||= `rodada ${i}: ${m} | patch ${resumo(rp)} | deposito ${resumo(rd)} | final ${j({ s: fim.status, b: fim.bank })}`; };
    if (rp.status >= 500 || rd.status >= 500 || rp.status === 0 || rd.status === 0) { semErro500b = false; nota("500 ou exceção"); }
    if (ok2xx(rd)) desfechoB.deposito2xx += 1;
    else if (recusou(rd, 409, undefined, "CHEQUE_INCOMPLETO")) desfechoB.deposito409Incompleto += 1;
    else desfechoB.outros += 1;
    if (ok2xx(rd) && fim.bank === null) { regraBanco = false; nota("depositou com o banco nulo"); }
    if (!ok2xx(rd) && !recusou(rd, 409, undefined, "CHEQUE_INCOMPLETO")) { regraIncompleto = false; nota("depósito recusado sem ser 409 CHEQUE_INCOMPLETO"); }
  }
  check(`nenhuma resposta 500 em ${RODADAS_CORRIDA} rodadas`, semErro500b, detalheB);
  check("depósito 2xx: o banco final não é nulo", regraBanco, detalheB);
  check("depósito recusado: foi 409 CHEQUE_INCOMPLETO", regraIncompleto, detalheB);
  console.log(`  (desfechos de (b) em ${RODADAS_CORRIDA} rodadas: depósito 2xx ${desfechoB.deposito2xx}; 409 CHEQUE_INCOMPLETO ${desfechoB.deposito409Incompleto}; outros ${desfechoB.outros})`);
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
    "emporioPaymentRequest", "emporioCreditRelease", "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "cardReceivable", "cardAnticipation", "cardFeeRate", "cardAcquirer", "emporioSalePayment", "emporioSaleReturnItem",
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
        A = await montar("A");
        B = await montar("B");
      });
      if (!A || !B) {
        check("a montagem dos tenants terminou (sem ela as seções 2 a 7 não rodam)", false);
        return;
      }
      await rodar("2", secao2);
      await rodar("3", secao3);
      await rodar("4", secao4);
      await rodar("5", secao5);
      await rodar("6", secao6);
      await rodar("7", secao7);
      await rodar("8", secao8);
    });
  } finally {
    await limpar();
  }
  console.log("\nChecagens por seção:");
  for (const [s, c] of Object.entries(contagem)) console.log(`  seção ${s}: ${c.ok + c.falhas} (${c.ok} verdes, ${c.falhas} vermelhas)`);
  const total = Object.values(contagem).reduce((s, c) => s + c.ok + c.falhas, 0);
  console.log(falhas === 0 ? `\n✅ M122 verde (${total} checagens)` : `\n❌ M122: ${falhas} falha(s) em ${total} checagens`);
  // As rotas de token deixam o Redis aberto: o processo não encerra sozinho.
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
