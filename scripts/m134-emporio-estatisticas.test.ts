import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M134: Módulo 39 (Meu Empório), UX onda 5: as leituras e as regras puras das Estatísticas.
 * Roda: `npm run test:m134`
 *
 * Escrita do plano docs/superpowers/plans/2026-11-27-emporio-ux-onda5-estatisticas.md (T1).
 *
 * Seção 1: as regras puras (sem banco): período, mês anterior, texto da comparação, aba, endereços,
 *          dia do equilíbrio e soma dos resultados.
 * Seção 2: `por_dia` do relatório de vendas, com uma devolução no meio e dias sem venda.
 * Seção 3: `compararVendasAction`.
 * Seção 4: `resultadoPorLojaAction` (dono, gestor de uma loja só, Caixa).
 * Seção 5: o tenant B não vê as vendas do A.
 * Seção 6: as rotas e as planilhas (T2).
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
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;

console.log("📊 M134: Módulo 39 (Meu Empório), Estatísticas: leituras e regras puras\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];
const brDia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const somaDias = (s: string, k: number) => new Date(new Date(`${s}T12:00:00Z`).getTime() + k * DIA).toISOString().slice(0, 10);
const HOJE = brDia(new Date());

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 6).join(" | ").slice(0, 700) : String(e));
  }
}

// ---------------------------------------------------------------------------
// Seção 1: regras puras
// ---------------------------------------------------------------------------

async function secao1() {
  let E: Dado = {};
  try {
    E = await import("@/lib/emporio/estatisticas");
  } catch (e) {
    check("o módulo @/lib/emporio/estatisticas carrega", false, e instanceof Error ? e.message.slice(0, 160) : String(e));
    return;
  }
  const f = (nome: string): ((...a: Dado[]) => Dado) => (typeof E[nome] === "function" ? E[nome] : () => ({ ausente: nome }));
  const hoje = new Date("2026-11-27T00:00:00Z");
  const mesAtual = { de: "2026-11-01", ate: "2026-11-30" };

  console.log("1. Mês anterior");
  check("01/11 a 27/11 vira 01/10 a 27/10", j(f("periodoDoMesAnterior")("2026-11-01", "2026-11-27")) === j({ de: "2026-10-01", ate: "2026-10-27" }));
  check("31/03 vira 28/02", j(f("periodoDoMesAnterior")("2026-03-31", "2026-03-31")) === j({ de: "2026-02-28", ate: "2026-02-28" }));
  check("29 a 31/03/2028 viram 29/02/2028", j(f("periodoDoMesAnterior")("2028-03-29", "2028-03-31")) === j({ de: "2028-02-29", ate: "2028-02-29" }));
  check("janeiro volta para dezembro do ano anterior", j(f("periodoDoMesAnterior")("2026-01-01", "2026-01-31")) === j({ de: "2025-12-01", ate: "2025-12-31" }));

  console.log("\n2. Texto da comparação");
  check("8% acima", f("textoDaComparacao")(108_00, 100_00, "2026-10-01", "2026-10-27") === "8% acima de outubro, no mesmo período", String(f("textoDaComparacao")(108_00, 100_00, "2026-10-01", "2026-10-27")));
  check("10% abaixo", f("textoDaComparacao")(90_00, 100_00, "2026-10-01", "2026-10-27") === "10% abaixo de outubro, no mesmo período");
  check("igual", f("textoDaComparacao")(100_00, 100_00, "2026-10-01", "2026-10-27") === "Igual a outubro, no mesmo período");
  check("sem vendas no anterior", f("textoDaComparacao")(100_00, 0, "2026-10-01", "2026-10-27") === "Sem vendas em outubro, no mesmo período");
  check("mês com acento em minúsculas", f("textoDaComparacao")(110_00, 100_00, "2026-03-01", "2026-03-10") === "10% acima de março, no mesmo período");
  check("trecho que atravessa meses diz o mês anterior", /mês anterior/.test(String(f("textoDaComparacao")(110_00, 100_00, "2026-02-28", "2026-03-04"))), String(f("textoDaComparacao")(110_00, 100_00, "2026-02-28", "2026-03-04")));

  console.log("\n3. Período da tela");
  const longo = f("periodoDasEstatisticas")({ de: "2026-01-01", ate: "2027-02-05" }, hoje);
  check("mais de 366 dias: Este mês e inválido", longo.invalido === true && longo.de === mesAtual.de && longo.ate === mesAtual.ate, j(longo));
  const invertido = f("periodoDasEstatisticas")({ de: "2026-11-10", ate: "2026-11-01" }, hoje);
  check("de depois de ate: Este mês e inválido", invertido.invalido === true && invertido.de === mesAtual.de, j(invertido));
  const vazio = f("periodoDasEstatisticas")({}, hoje);
  check("sem parâmetros: Este mês, sem aviso", vazio.invalido === false && vazio.de === mesAtual.de && vazio.ate === mesAtual.ate, j(vazio));
  const bom = f("periodoDasEstatisticas")({ de: "2026-11-05", ate: "2026-11-12" }, hoje);
  check("período bom passa como veio", j(bom) === j({ de: "2026-11-05", ate: "2026-11-12", invalido: false }), j(bom));
  const lixo = f("periodoDasEstatisticas")({ de: "2026-02-31", ate: "2026-03-05" }, hoje);
  check("data que não existe: inválido", lixo.invalido === true, j(lixo));
  const exato = f("periodoDasEstatisticas")({ de: "2026-01-01", ate: "2027-01-01" }, hoje);
  check("366 dias ainda vale", exato.invalido === false && exato.de === "2026-01-01", j(exato));

  console.log("\n4. Atalhos");
  const atalhos = f("atalhosDasEstatisticas")(hoje) as { id: string; rotulo: string; de: string; ate: string }[];
  check("os rótulos", j(atalhos.map?.((a) => a.rotulo)) === j(["Hoje", "7 dias", "Este mês", "Mês passado"]), j(atalhos));
  const sete = atalhos.find?.((a) => a.id === "7dias");
  check("7 dias vai de 21/11 a 27/11", sete?.de === "2026-11-21" && sete?.ate === "2026-11-27", j(sete));
  const passado = atalhos.find?.((a) => a.id === "mes_passado");
  check("mês passado: outubro inteiro", passado?.de === "2026-10-01" && passado?.ate === "2026-10-31", j(passado));

  console.log("\n5. Aba da URL");
  check("dinheiro sem permissão cai em geral", f("abaDaEstatistica")("dinheiro", false) === "geral");
  check("dinheiro com permissão", f("abaDaEstatistica")("dinheiro", true) === "dinheiro");
  check("valor desconhecido cai em geral", f("abaDaEstatistica")("xyz", true) === "geral");
  check("sem valor: geral", f("abaDaEstatistica")(undefined, true) === "geral");
  check("imprimir sem dinheiro continua imprimir", f("abaDaEstatistica")("imprimir", false) === "imprimir");
  check("vendas e resultado", f("abaDaEstatistica")("vendas", false) === "vendas" && f("abaDaEstatistica")("resultado", false) === "resultado");

  console.log("\n6. Mês do período");
  check("mesDoPeriodo usa a data final", f("mesDoPeriodo")("2026-10-31") === "2026-10");
  check("pega mais de um mês", f("periodoPegaMaisDeUmMes")("2026-10-30", "2026-11-02") === true);
  check("mesmo mês não pega", f("periodoPegaMaisDeUmMes")("2026-11-01", "2026-11-30") === false);

  console.log("\n7. Dia do equilíbrio");
  const dias = [
    { date: "2026-11-01", cumulative: 50 },
    { date: "2026-11-02", cumulative: 120 },
  ];
  check("o dia 2 alcança o ponto 100", f("diaDoEquilibrio")(dias, 100) === 2);
  check("sem ponto: nulo", f("diaDoEquilibrio")(dias, null) === null);
  check("nenhum dia chega: nulo", f("diaDoEquilibrio")(dias, 500) === null);
  check("dia futuro (acumulado nulo) não conta", f("diaDoEquilibrio")([{ date: "2026-11-01", cumulative: 10 }, { date: "2026-11-02", cumulative: null }], 5) === 1);

  console.log("\n8. Soma dos resultados");
  const duas = f("somarResultados")([
    { sales: 1000, margin: 300, fixed_expenses: 100, losses: 10, result: 190 },
    { sales: 500, margin: 100, fixed_expenses: 50, losses: 5, result: 45 },
  ]);
  check("soma os cinco campos", duas.sales === 1500 && duas.margin === 400 && duas.fixed_expenses === 150 && duas.losses === 15 && duas.result === 235, j(duas));
  check("margem % total sobre vendas totais, 1 casa", duas.margin_pct === 26.7, j(duas));
  const nada = f("somarResultados")([{ sales: 0, margin: 0, fixed_expenses: 20, losses: 0, result: -20 }]);
  check("sem vendas: margem % nula", nada.margin_pct === null && nada.result === -20, j(nada));
  check("lista vazia: zeros e nulo", f("somarResultados")([]).sales === 0 && f("somarResultados")([]).margin_pct === null);

  console.log("\n9. Endereços antigos");
  const url = (s: string) => {
    const [caminho, q = ""] = s.split("?");
    return { caminho, q: new URLSearchParams(q) };
  };
  check("resultado de fevereiro com Todas", f("enderecoDaEstatistica")("/emporio/resultado", { mes: "2026-02", loja: "all" }) === "/emporio/estatisticas?aba=resultado&de=2026-02-01&ate=2026-02-28", String(f("enderecoDaEstatistica")("/emporio/resultado", { mes: "2026-02", loja: "all" })));
  const r1 = url(f("enderecoDaEstatistica")("/emporio/resultado", { mes: "2026-02", loja: "L1" }));
  check("resultado com loja mantém a loja", r1.q.get("loja") === "L1" && r1.q.get("aba") === "resultado");
  const r2 = url(f("enderecoDaEstatistica")("/emporio/resultado", { mes: "2026-13", loja: "L1" }));
  check("mes inválido é ignorado", r2.q.get("de") === null && r2.q.get("ate") === null && r2.q.get("aba") === "resultado" && r2.q.get("loja") === "L1");
  const v = url(f("enderecoDaEstatistica")("/emporio/relatorios", { de: "2026-11-01", ate: "2026-11-10", loja: "L1", abc: "clientes", medida: "lucro" }));
  check("relatórios mantém os cinco parâmetros", v.caminho === "/emporio/estatisticas" && v.q.get("aba") === "vendas" && v.q.get("de") === "2026-11-01" && v.q.get("ate") === "2026-11-10" && v.q.get("loja") === "L1" && v.q.get("abc") === "clientes" && v.q.get("medida") === "lucro");
  check("projeção: aba=dinheiro&loja&dias", f("enderecoDaEstatistica")("/emporio/financeiro/projecao", { dias: "60", loja: "L1" }) === "/emporio/estatisticas?aba=dinheiro&loja=L1&dias=60", String(f("enderecoDaEstatistica")("/emporio/financeiro/projecao", { dias: "60", loja: "L1" })));
  const fr = url(f("enderecoDaEstatistica")("/emporio/financeiro/relatorios", { loja: "L1", de: "2026-11-01", ate: "2026-11-10", lixo: "x" }));
  check("relatórios do dinheiro: loja, de e ate", fr.q.get("aba") === "dinheiro" && fr.q.get("loja") === "L1" && fr.q.get("de") === "2026-11-01" && fr.q.get("ate") === "2026-11-10" && fr.q.get("lixo") === null);
}

// ---------------------------------------------------------------------------
// Banco: dois tenants
// ---------------------------------------------------------------------------

type Ator = { id: string; role: "OWNER" | "OPERADOR" };
type Mundo = {
  rotulo: string;
  tenantId: string;
  db: Dado;
  owner: Ator;
  gestor: Ator;
  caixa: Ator;
  tok: { owner: string; gestor: string; caixa: string };
  categoriaId: string;
};

const prismaCru = async (): Promise<Dado> => (await import("@/lib/prisma")).prisma as Dado;

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture } = await import("./_emporio-papel");
  const bcrypt = (await import("bcryptjs")).default;
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M134 ${rotulo} ${stamp}`, document: `M134${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}) => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M134 ${suf}`, email: `m134-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id as string, role, email: u.email as string };
  };
  const owner = await mk("own", "OWNER");
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const caixa = await mk("cx", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });

  const db = prismaForTenant(t.id) as Dado;
  const cat = await db.productCategory.create({ data: scoped({ name: `M134 categoria ${rotulo}` }) });
  const token = async (u: { email: string }) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  return {
    rotulo, tenantId: t.id, db,
    owner: { id: owner.id, role: "OWNER" },
    gestor: { id: gestor.id, role: "OPERADOR" },
    caixa: { id: caixa.id, role: "OPERADOR" },
    categoriaId: cat.id as string,
    tok: { owner: await token(owner), gestor: await token(gestor), caixa: await token(caixa) },
  };
}

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST", url: string, corpo?: unknown, id?: string): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  const m = await rota();
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}
const R = {
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  devolver: () => import("@/app/api/v1/emporio/sales/[id]/return/route"),
};
const ok2xx = (r: Resp) => r.status >= 200 && r.status < 300;
const resumo = (r: Resp) => `${r.status} ${j(r.corpo).slice(0, 260)}`;

let seq = 0;
const chave = (p: string) => `m134-${p}-${stamp}-${(seq += 1)}`;

type Loja = { id: string; reg: string };
async function novaLoja(w: Mundo, nome: string): Promise<Loja> {
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const l = await Cat.criarEstabelecimentoAction(w.db, w.owner, { name: `M134 ${w.rotulo} ${nome} ${stamp}` });
  if (!l.ok) throw new Error(`loja: ${j(l)}`);
  await abrirTurnoDeTeste(w.db, w.owner, l.data.id);
  const reg = (await w.db.cashRegister.findFirst({ where: { establishment_id: l.data.id, number: 1 } }))?.id as string;
  return { id: l.data.id as string, reg };
}

type Prod = { id: string; presId: string; preco: number };
let seqProd = 0;
async function novoProd(w: Mundo, nome: string, preco: number, lojas: Loja[]): Promise<Prod> {
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const p = await Cat.criarProdutoEmporioAction(w.db, w.owner, { name: `${nome} ${stamp}${(seqProd += 1)}`, category_id: w.categoriaId, base_unit: "quilograma" });
  if (!p.ok) throw new Error(`produto: ${j(p)}`);
  const a = await Cat.criarApresentacaoAction(w.db, w.owner, p.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!a.ok) throw new Error(`apresentação: ${j(a)}`);
  for (const l of lojas) {
    const pr = await Cat.definirPrecoAction(w.db, w.owner, { establishment_id: l.id, presentation_id: a.data.id, price: preco });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const im = await Est.implantarEstoqueAction(w.db, w.owner, { establishment_id: l.id, emporio_product_id: p.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!im.ok) throw new Error(`estoque: ${j(im)}`);
  }
  return { id: p.data.id as string, presId: a.data.id as string, preco };
}

const clienteDe = async (w: Mundo): Promise<string> => {
  const prisma = await prismaCru();
  const c = await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: `Cliente ${w.rotulo} ${stamp}`, person_kind: "pf", phone: "11999990000" } });
  return c.id as string;
};
const clientes = new Map<string, string>();
async function clienteDoMundo(w: Mundo): Promise<string> {
  let id = clientes.get(w.tenantId);
  if (!id) clientes.set(w.tenantId, (id = await clienteDe(w)));
  return id;
}

type VendaFeita = { id: string; itemIds: string[] };
async function vender(w: Mundo, loja: Loja, p: Prod, qty: number, quando?: string): Promise<VendaFeita> {
  const r = await chamar(w.tok.owner, R.sales, "POST", "emporio/sales", {
    operation_key: chave("venda"),
    establishment_id: loja.id,
    cash_register_id: loja.reg,
    customer_id: await clienteDoMundo(w),
    items: [{ emporio_product_id: p.id, presentation_id: p.presId, quantity: qty }],
    payments: [{ kind: "dinheiro", amount: p.preco * qty }],
  });
  if (!ok2xx(r)) throw new Error(`venda: ${resumo(r)}`);
  const id = String(r.corpo.data.id);
  if (quando) await (await prismaCru()).emporioSale.update({ where: { id }, data: { sold_at: new Date(quando) } });
  return { id, itemIds: (r.corpo.data.items ?? []).map((x: Dado) => String(x.id)) };
}

async function devolver(w: Mundo, loja: Loja, v: VendaFeita, qty: number): Promise<void> {
  const r = await chamar(w.tok.owner, R.devolver, "POST", `emporio/sales/${v.id}/return`, {
    operation_key: chave("dev"), refund_kind: "dinheiro", cash_register_id: loja.reg,
    items: [{ sale_item_id: v.itemIds[0], quantity: qty }],
  }, v.id);
  if (!ok2xx(r)) throw new Error(`devolução: ${resumo(r)}`);
}

let A = null as unknown as Mundo;
let B = null as unknown as Mundo;
let L1 = null as unknown as Loja;
let L2 = null as unknown as Loja;
const PERIODO = { from: somaDias(HOJE, -9), to: HOJE };

async function acoes(): Promise<{ Rel: Dado; Res: Dado }> {
  return { Rel: await import("@/lib/actions/emporio-relatorios"), Res: await import("@/lib/actions/emporio-resultado") };
}

async function plantar() {
  const { periodoDoMesAnterior } = (await import("@/lib/emporio/estatisticas").catch(() => ({}))) as Dado;
  const { vincularTodas } = await import("./_emporio-papel");
  const prisma = await prismaCru();
  L1 = await novaLoja(A, "L1");
  L2 = await novaLoja(A, "L2");
  await vincularTodas(prisma, A.tenantId, [A.gestor.id, A.caixa.id], [L1.id]);
  const p1 = await novoProd(A, "Ração", 10, [L1, L2]);

  // Hoje: 50 na L1 e 10 na L2. Três dias atrás: 20 na L2, com 10 devolvidos hoje. Seis dias atrás: 30 na L1.
  await vender(A, L1, p1, 5);
  await vender(A, L2, p1, 1);
  const s2 = await vender(A, L2, p1, 2, `${somaDias(HOJE, -3)}T15:00:00Z`);
  await vender(A, L1, p1, 3, `${somaDias(HOJE, -6)}T15:00:00Z`);
  await devolver(A, L2, s2, 1);
  // O mesmo trecho do mês anterior: 80 na L1.
  const ant = typeof periodoDoMesAnterior === "function" ? periodoDoMesAnterior(PERIODO.from, PERIODO.to) : { de: somaDias(PERIODO.from, -31) };
  await vender(A, L1, p1, 8, `${ant.de}T15:00:00Z`);

  // O tenant B: 7 numa loja só.
  const lb = await novaLoja(B, "LB");
  const pb = await novoProd(B, "Milho", 7, [lb]);
  await vender(B, lb, pb, 1);
}

// ---------------------------------------------------------------------------
// Seção 2: por_dia
// ---------------------------------------------------------------------------

async function secao2() {
  console.log("\n2. por_dia");
  const { Rel } = await acoes();
  const r = await Rel.relatorioDeVendasAction(A.db, A.owner, PERIODO);
  check("o relatório responde", r.ok === true, j(r));
  const d: Dado = r.data;
  const porDia: { date: string; total: number }[] = d?.por_dia ?? [];
  check("todo dia do período aparece (10 dias)", porDia.length === 10, String(porDia.length));
  check("o primeiro e o último dia são as pontas", porDia[0]?.date === PERIODO.from && porDia[porDia.length - 1]?.date === PERIODO.to, j(porDia.map((x) => x.date)));
  const soma = porDia.reduce((s, x) => s + x.total, 0);
  const somaLojas = (d?.por_loja ?? []).reduce((s: number, l: Dado) => s + l.total, 0);
  check("a soma de por_dia é 100", perto(soma, 100), String(soma));
  check("a soma de por_dia bate com por_loja somado", perto(soma, somaLojas), `${soma} x ${somaLojas}`);
  const dia = (s: string) => porDia.find((x) => x.date === s)?.total;
  check("hoje: 50 + 10 menos 10 devolvidos no dia", perto(dia(HOJE), 50), String(dia(HOJE)));
  check("três dias atrás: 20 (a devolução é do dia dela)", perto(dia(somaDias(HOJE, -3)), 20), String(dia(somaDias(HOJE, -3))));
  check("seis dias atrás: 30", perto(dia(somaDias(HOJE, -6)), 30), String(dia(somaDias(HOJE, -6))));
  check("um dia sem venda aparece com zero", dia(somaDias(HOJE, -1)) === 0, String(dia(somaDias(HOJE, -1))));
  const vazio = await Rel.relatorioDeVendasAction(A.db, A.owner, { from: PERIODO.from, to: PERIODO.to, establishment_id: L2.id });
  const somaL2 = (vazio.data?.por_dia ?? []).reduce((s: number, x: Dado) => s + x.total, 0);
  check("só a L2: soma de por_dia é 20 (10 de hoje + 20 menos 10)", perto(somaL2, 20), String(somaL2));
}

// ---------------------------------------------------------------------------
// Seção 3: comparação
// ---------------------------------------------------------------------------

async function secao3() {
  console.log("\n3. compararVendasAction");
  const { Rel } = await acoes();
  if (typeof Rel.compararVendasAction !== "function") {
    check("compararVendasAction existe", false);
    return;
  }
  const { periodoDoMesAnterior } = await import("@/lib/emporio/estatisticas");
  const ant = periodoDoMesAnterior(PERIODO.from, PERIODO.to);
  const r = await Rel.compararVendasAction(A.db, A.owner, PERIODO);
  check("a comparação responde", r.ok === true, j(r));
  const d: Dado = r.data;
  check("atual.total é 100", perto(d?.atual?.total, 100), j(d?.atual));
  check("anterior.total é 80", perto(d?.anterior?.total, 80), j(d?.anterior));
  check("os períodos voltam (atual e anterior)", d?.atual?.from === PERIODO.from && d?.atual?.to === PERIODO.to && d?.anterior?.from === ant.de && d?.anterior?.to === ant.ate, j(d));
  check("variacao_pct é 25", d?.variacao_pct === 25, String(d?.variacao_pct));

  const g = await Rel.compararVendasAction(A.db, A.gestor, PERIODO);
  check("o gestor da L1 vê só a L1: atual 80 e anterior 80", g.ok && perto(g.data.atual.total, 80) && perto(g.data.anterior.total, 80), j(g));
  check("o gestor da L1: variacao_pct 0", g.ok && g.data.variacao_pct === 0, j(g));
  const semAnterior = await Rel.compararVendasAction(A.db, A.owner, { from: somaDias(HOJE, -1), to: HOJE });
  check("sem venda no período anterior: variacao_pct nulo", semAnterior.ok && semAnterior.data.variacao_pct === null, j(semAnterior));
  const caixa = await Rel.compararVendasAction(A.db, A.caixa, PERIODO);
  check("o Caixa recebe 403", caixa.ok === false && caixa.status === 403, j(caixa));
  const ruim = await Rel.compararVendasAction(A.db, A.owner, { from: "2026-02-31", to: HOJE });
  check("data inválida: 422 no campo from", ruim.ok === false && ruim.status === 422 && ruim.field === "from", j(ruim));
}

// ---------------------------------------------------------------------------
// Seção 4: resultado por loja
// ---------------------------------------------------------------------------

async function secao4() {
  console.log("\n4. resultadoPorLojaAction");
  const { Res } = await acoes();
  if (typeof Res.resultadoPorLojaAction !== "function") {
    check("resultadoPorLojaAction existe", false);
    return;
  }
  const { somarResultados } = await import("@/lib/emporio/estatisticas");
  const mes = HOJE.slice(0, 7);
  const dono = await Res.resultadoPorLojaAction(A.db, A.owner, { month: mes });
  check("o dono recebe o resultado", dono.ok === true, j(dono));
  const lojas: Dado[] = dono.data?.lojas ?? [];
  check("o dono vê as duas lojas", lojas.length === 2 && lojas.some((l) => l.establishment_id === L1.id) && lojas.some((l) => l.establishment_id === L2.id), j(lojas.map((l) => l.establishment_id)));
  check("o mês volta", dono.data?.month === mes, String(dono.data?.month));
  const soma = somarResultados(lojas);
  check("o total é a soma das lojas", j(dono.data?.total) === j(soma), j({ total: dono.data?.total, soma }));
  const l1 = lojas.find((l) => l.establishment_id === L1.id);
  check("a L1 tem as vendas de hoje (50 ou mais)", (l1?.sales ?? 0) >= 50, String(l1?.sales));
  const todas = await Res.resultadoPorLojaAction(A.db, A.owner, { month: mes, establishment_id: "all" });
  check("o dono com all dá o mesmo", todas.ok && j(todas.data.total) === j(dono.data.total), j(todas));
  const so1 = await Res.resultadoPorLojaAction(A.db, A.owner, { month: mes, establishment_id: L1.id });
  check("o dono com uma loja: só ela", so1.ok && so1.data.lojas.length === 1 && so1.data.lojas[0].establishment_id === L1.id, j(so1));

  const gestor = await Res.resultadoPorLojaAction(A.db, A.gestor, { month: mes });
  check("o gestor da L1, sem loja, recebe só a loja dele", gestor.ok && gestor.data.lojas.length === 1 && gestor.data.lojas[0].establishment_id === L1.id, j(gestor));
  check("o total do gestor é o da L1", gestor.ok && j(gestor.data.total) === j(somarResultados(gestor.data.lojas)) && perto(gestor.data.total.sales, l1?.sales ?? -1), j(gestor));
  const gestorTodas = await Res.resultadoPorLojaAction(A.db, A.gestor, { month: mes, establishment_id: "all" });
  check("o gestor da L1 com all também vê só a dele, sem 403", gestorTodas.ok && gestorTodas.data.lojas.length === 1, j(gestorTodas));
  const gestorOutra = await Res.resultadoPorLojaAction(A.db, A.gestor, { month: mes, establishment_id: L2.id });
  check("o gestor pedindo a L2: 404, a mesma recusa de hoje", gestorOutra.ok === false && gestorOutra.status === 404, j(gestorOutra));
  const caixa = await Res.resultadoPorLojaAction(A.db, A.caixa, { month: mes });
  check("o Caixa recebe 403", caixa.ok === false && caixa.status === 403, j(caixa));
  const ruim = await Res.resultadoPorLojaAction(A.db, A.owner, { month: "2026-13" });
  check("mês inválido: 422 no campo month", ruim.ok === false && ruim.status === 422 && ruim.field === "month", j(ruim));
}

// ---------------------------------------------------------------------------
// Seção 5: o tenant B
// ---------------------------------------------------------------------------

async function secao5() {
  console.log("\n5. Isolamento");
  const { Rel, Res } = await acoes();
  const r = await Rel.relatorioDeVendasAction(B.db, B.owner, PERIODO);
  const somaDia = (r.data?.por_dia ?? []).reduce((s: number, x: Dado) => s + x.total, 0);
  check("B soma 7 por dia, sem as vendas do A", perto(somaDia, 7), String(somaDia));
  if (typeof Rel.compararVendasAction === "function") {
    const c = await Rel.compararVendasAction(B.db, B.owner, PERIODO);
    check("B compara: atual 7 e anterior 0", c.ok && perto(c.data.atual.total, 7) && perto(c.data.anterior.total, 0), j(c));
  } else check("compararVendasAction existe", false);
  if (typeof Res.resultadoPorLojaAction === "function") {
    const x = await Res.resultadoPorLojaAction(B.db, B.owner, { month: HOJE.slice(0, 7) });
    check("B vê uma loja só, a dele", x.ok && x.data.lojas.length === 1 && x.data.lojas[0].establishment_id !== L1.id && x.data.lojas[0].establishment_id !== L2.id, j(x));
    const cruzada = await Res.resultadoPorLojaAction(B.db, B.owner, { month: HOJE.slice(0, 7), establishment_id: L1.id });
    check("B pedindo a loja do A: 404", cruzada.ok === false && cruzada.status === 404, j(cruzada));
  } else check("resultadoPorLojaAction existe", false);
}

// ---------------------------------------------------------------------------
// Seção 6: as rotas e as planilhas (T2)
// ---------------------------------------------------------------------------

type RespCsv = { status: number; tipo: string; disp: string; texto: string; bytes: Uint8Array; corpo: Dado };
async function chamarCsv(tok: string, rota: () => Promise<Dado>, url: string): Promise<RespCsv> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  // Rota ainda inexistente vira status 0, nunca erro de sintaxe: assim cada caso falha sozinho.
  const m = await rota().catch(() => null);
  if (!m) return { status: 0, tipo: "", disp: "", texto: "", bytes: new Uint8Array(), corpo: {} };
  const req = new Request(`http://localhost/api/v1/${url}`, { method: "GET", headers: { "content-type": "application/json" } });
  const res = await withBearer(tok, (): Promise<Response> => m.GET(req));
  const bytes = new Uint8Array(await res.clone().arrayBuffer());
  const texto = await res.text();
  let corpo: Dado = {};
  try {
    corpo = JSON.parse(texto);
  } catch {
    corpo = {};
  }
  return { status: res.status, tipo: res.headers.get("content-type") ?? "", disp: res.headers.get("content-disposition") ?? "", texto, bytes, corpo };
}
const RT = {
  sales: () => import("@/app/api/v1/emporio/reports/sales/route"),
  comparison: () => import("@/app/api/v1/emporio/reports/sales/comparison/route"),
  abc: () => import("@/app/api/v1/emporio/reports/abc/route"),
  stores: () => import("@/app/api/v1/emporio/result/stores/route"),
};

async function secao6() {
  console.log("\n6. Rotas e planilhas");
  const mes = HOJE.slice(0, 7);
  // Uma venda de 1234,50 só na L1, para o formato brasileiro do valor.
  const caro = await novoProd(A, "Adubo", 1234.5, [L1]);
  await vender(A, L1, caro, 1);
  // Um produto com preço na L1 e sem venda: o parado.
  const parado = await novoProd(A, "Parado", 5, [L1]);
  const q = `from=${PERIODO.from}&to=${PERIODO.to}`;
  const tokG = A.tok.gestor;
  const tokC = A.tok.caixa;
  const semBom = (t: string) => t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;

  // Comparação (JSON)
  const cmp = await chamarCsv(A.tok.owner, RT.comparison, `emporio/reports/sales/comparison?${q}`);
  check("comparison: 200 com atual, anterior e variacao_pct", cmp.status === 200 && cmp.corpo?.data?.atual?.to === PERIODO.to && typeof cmp.corpo?.data?.anterior?.total === "number" && "variacao_pct" in (cmp.corpo?.data ?? {}), `${cmp.status} ${cmp.texto.slice(0, 200)}`);
  check("comparison: anterior 80 e atual 1334,50", perto(cmp.corpo?.data?.anterior?.total, 80) && perto(cmp.corpo?.data?.atual?.total, 1334.5), j(cmp.corpo?.data));
  check("comparison: sem sessão, 401", (await chamarCsv("", RT.comparison, `emporio/reports/sales/comparison?${q}`)).status === 401);
  check("comparison: o Caixa, 403", (await chamarCsv(tokC, RT.comparison, `emporio/reports/sales/comparison?${q}`)).status === 403);
  const cmpB = await chamarCsv(B.tok.owner, RT.comparison, `emporio/reports/sales/comparison?${q}`);
  check("comparison: B vê 7 e 0", cmpB.status === 200 && perto(cmpB.corpo?.data?.atual?.total, 7) && perto(cmpB.corpo?.data?.anterior?.total, 0), cmpB.texto.slice(0, 200));

  // Vendas sem format: JSON de hoje, com por_dia
  const js = await chamarCsv(A.tok.owner, RT.sales, `emporio/reports/sales?${q}`);
  check("sales sem format: JSON com por_dia", js.status === 200 && Array.isArray(js.corpo?.data?.por_dia), js.texto.slice(0, 120));

  // Vendedores
  const vend = await chamarCsv(A.tok.owner, RT.sales, `emporio/reports/sales?${q}&format=csv&relatorio=vendedores`);
  check("vendedores: 200 text/csv", vend.status === 200 && /^text\/csv/i.test(vend.tipo), `${vend.status} ${vend.tipo}`);
  check("vendedores: nome do arquivo", /filename="vendas-por-vendedor-\d{4}-\d{2}-\d{2}\.csv"/.test(vend.disp), vend.disp);
  check("vendedores: começa com o BOM", vend.bytes[0] === 0xef && vend.bytes[1] === 0xbb && vend.bytes[2] === 0xbf);
  const vl = semBom(vend.texto).split("\r\n");
  check("vendedores: a primeira linha são os títulos", vl[0] === "Vendedor;Vendas;Total;Ticket médio", vl[0]);
  check("vendedores: o total do dono sai com vírgula (1334,50)", vl.some((l) => l.includes(";1334,50;")), j(vl));
  check("vendedores: sem relatório válido, 422 no campo relatorio", await (async () => {
    const r = await chamarCsv(A.tok.owner, RT.sales, `emporio/reports/sales?${q}&format=csv`);
    const r2 = await chamarCsv(A.tok.owner, RT.sales, `emporio/reports/sales?${q}&format=csv&relatorio=xyz`);
    return r.status === 422 && r.corpo?.error?.field === "relatorio" && r2.status === 422 && r2.corpo?.error?.field === "relatorio";
  })());
  check("vendedores: formato inválido, 422 no campo format", (await chamarCsv(A.tok.owner, RT.sales, `emporio/reports/sales?${q}&format=xml`)).corpo?.error?.field === "format");
  check("vendedores: sem sessão, 401", (await chamarCsv("", RT.sales, `emporio/reports/sales?${q}&format=csv&relatorio=vendedores`)).status === 401);
  check("vendedores: o Caixa, 403", (await chamarCsv(tokC, RT.sales, `emporio/reports/sales?${q}&format=csv&relatorio=vendedores`)).status === 403);
  const vendB = await chamarCsv(B.tok.owner, RT.sales, `emporio/reports/sales?${q}&format=csv&relatorio=vendedores`);
  check("vendedores: B soma 7, sem o total do A", vendB.status === 200 && semBom(vendB.texto).includes(";7,00;") && !vendB.texto.includes("1334,50"), vendB.texto.slice(0, 200));

  // Parados
  const par = await chamarCsv(A.tok.owner, RT.sales, `emporio/reports/sales?${q}&format=csv&relatorio=parados`);
  const pl = semBom(par.texto).split("\r\n");
  check("parados: 200 text/csv e arquivo produtos-parados", par.status === 200 && /^text\/csv/i.test(par.tipo) && /filename="produtos-parados-/.test(par.disp), `${par.status} ${par.disp}`);
  check("parados: títulos Produto;Loja", pl[0] === "Produto;Loja", pl[0]);
  check("parados: traz o produto parado na L1", pl.some((l) => l.startsWith(`Parado ${stamp}`) && l.includes(`M134 A L1 ${stamp}`)), j(pl));
  check("parados: o gestor da L1 recebe 200", (await chamarCsv(tokG, RT.sales, `emporio/reports/sales?${q}&format=csv&relatorio=parados`)).status === 200);
  check("parados: o Caixa, 403", (await chamarCsv(tokC, RT.sales, `emporio/reports/sales?${q}&format=csv&relatorio=parados`)).status === 403);
  const parB = await chamarCsv(B.tok.owner, RT.sales, `emporio/reports/sales?${q}&format=csv&relatorio=parados`);
  check("parados: B sem o produto do A", parB.status === 200 && !parB.texto.includes(`Parado ${stamp}`) && !parB.texto.includes("M134 A"), parB.texto.slice(0, 200));
  void parado;

  // Curva ABC
  const abcUrl = `emporio/reports/abc?${q}&kind=products&measure=revenue`;
  const abc = await chamarCsv(A.tok.owner, RT.abc, `${abcUrl}&format=csv`);
  const al = semBom(abc.texto).split("\r\n");
  check("abc csv: 200 text/csv e arquivo curva-abc", abc.status === 200 && /^text\/csv/i.test(abc.tipo) && /filename="curva-abc-/.test(abc.disp), `${abc.status} ${abc.tipo} ${abc.disp}`);
  check("abc csv: títulos Classe;Nome;Valor;%;% acumulado", al[0] === "Classe;Nome;Valor;%;% acumulado", al[0]);
  check("abc csv: o Adubo é A, com 1234,50 em vírgula", al.some((l) => l.startsWith("A;Adubo") && l.includes(";1234,50;")), j(al));
  check("abc sem format continua JSON", (await chamarCsv(A.tok.owner, RT.abc, abcUrl)).corpo?.data?.kind === "products");
  check("abc csv: formato inválido, 422 em format", (await chamarCsv(A.tok.owner, RT.abc, `${abcUrl}&format=xml`)).corpo?.error?.field === "format");
  check("abc csv: sem sessão, 401", (await chamarCsv("", RT.abc, `${abcUrl}&format=csv`)).status === 401);
  check("abc csv: o Caixa, 403", (await chamarCsv(tokC, RT.abc, `${abcUrl}&format=csv`)).status === 403);
  const abcB = await chamarCsv(B.tok.owner, RT.abc, `${abcUrl}&format=csv`);
  check("abc csv: B sem o Adubo do A", abcB.status === 200 && !abcB.texto.includes("Adubo") && !abcB.texto.includes("Ração"), abcB.texto.slice(0, 200));
  const abcLucro = await chamarCsv(tokG, RT.abc, `emporio/reports/abc?${q}&kind=products&measure=profit&format=csv`);
  check("abc csv: lucro segue a regra da action (gestor sem permissão do lucro recebe recusa, nunca CSV)", abcLucro.status === 200 ? /^text\/csv/i.test(abcLucro.tipo) : abcLucro.status === 403, String(abcLucro.status));

  // Resultado por loja
  const sUrl = `emporio/result/stores?month=${mes}`;
  const sj = await chamarCsv(A.tok.owner, RT.stores, sUrl);
  check("stores: JSON com month, lojas e total", sj.status === 200 && sj.corpo?.data?.month === mes && sj.corpo?.data?.lojas?.length === 2 && typeof sj.corpo?.data?.total?.result === "number", sj.texto.slice(0, 200));
  const sc = await chamarCsv(A.tok.owner, RT.stores, `${sUrl}&format=csv`);
  const sl = semBom(sc.texto).split("\r\n").filter(Boolean);
  check("stores csv: 200 text/csv e arquivo resultado-por-loja", sc.status === 200 && /^text\/csv/i.test(sc.tipo) && /filename="resultado-por-loja-/.test(sc.disp), `${sc.status} ${sc.disp}`);
  check("stores csv: títulos", sl[0] === "Loja;Vendas;Margem;Despesas fixas;Perdas;Resultado", sl[0]);
  check("stores csv: duas lojas mais a linha Total, a última", sl.length === 4 && sl[sl.length - 1].startsWith("Total;"), j(sl));
  check("stores csv: a L1 sai com vírgula decimal", sl.some((l) => l.includes(`M134 A L1 ${stamp};`) && /;\d+,\d{2};/.test(l)), j(sl));
  check("stores: formato inválido, 422 em format", (await chamarCsv(A.tok.owner, RT.stores, `${sUrl}&format=xml`)).corpo?.error?.field === "format");
  check("stores: mês inválido, 422 em month", (await chamarCsv(A.tok.owner, RT.stores, "emporio/result/stores?month=2026-13")).corpo?.error?.field === "month");
  check("stores: sem sessão, 401", (await chamarCsv("", RT.stores, sUrl)).status === 401);
  check("stores: o Caixa, 403", (await chamarCsv(tokC, RT.stores, `${sUrl}&format=csv`)).status === 403);
  const sg = await chamarCsv(tokG, RT.stores, `${sUrl}&format=csv`);
  const sgl = semBom(sg.texto).split("\r\n").filter(Boolean);
  check("stores csv: o gestor da L1 vê só a L1 mais o Total", sg.status === 200 && sgl.length === 3 && !sg.texto.includes(`M134 A L2`), j(sgl));
  const sB = await chamarCsv(B.tok.owner, RT.stores, `${sUrl}&format=csv`);
  check("stores csv: B sem lojas do A", sB.status === 200 && !sB.texto.includes("M134 A"), sB.texto.slice(0, 200));
}

// ---------------------------------------------------------------------------

async function limpar(id: string) {
  const prisma = await prismaCru();
  await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } }).catch(() => undefined);
  await prisma.tenant.delete({ where: { id } }).catch((e: unknown) => console.log(`  (teardown ${id}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
}

async function main() {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const prisma = await prismaCru();
  try {
    secaoAtual = "1";
    console.log("1. Regras puras");
    await rodar("1", secao1);
    secaoAtual = "2";
    A = await montar("A");
    B = await montar("B");
    await rodar("plantar", plantar);
    await rodar("2", secao2);
    secaoAtual = "3";
    await rodar("3", secao3);
    secaoAtual = "4";
    await rodar("4", secao4);
    secaoAtual = "5";
    await rodar("5", secao5);
    secaoAtual = "6";
    await rodar("6", secao6);
  } finally {
    for (const id of tenantIds.reverse()) await limpar(id);
    await prisma.$disconnect();
  }
  const total = Object.values(contagem).reduce((s, c) => s + c.ok + c.falhas, 0);
  console.log(`\nChecagens: ${total}`);
  for (const [s, c] of Object.entries(contagem)) console.log(`  seção ${s}: ${c.ok} ok, ${c.falhas} falha(s)`);
  console.log(falhas === 0 ? "\n✅ M134 (Módulo 39, Empório): Estatísticas, leituras e regras puras passou." : `\n❌ M134 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
