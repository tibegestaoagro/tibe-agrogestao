import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M124: Módulo 39 (Meu Empório), frente H: curva ABC de produtos e de clientes e paginação dos orçamentos (Q362 a Q365).
 * Roda: `npm run test:m124`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-18-emporio-curva-abc-design.md e do bloco Interfaces da Task 1
 * do plano, sem ler a implementação nova. O que está sob prova passa pela ROTA (Request construído); as vendas
 * usam as rotas antigas, e o oráculo do faturamento é `relatorioDeVendasAction`. Rota ou campo que ainda não existe
 * vira falha de checagem (status 0), nunca exceção que derruba a suíte.
 *
 * Seção 1: classes com números redondos (cortes, item único, empate, medida zero, total zero).
 * Seção 2: faturamento (bate com o por_produto, devolução de venda anterior, troca, frete).
 * Seção 3: lucro (custo, sem custo, custo estimado e provisório, 403).
 * Seção 4: clientes (Consumidor final e venda sem cliente fora da curva).
 * Seção 5: lojas, visibilidade, outro tenant e período.
 * Seção 6: orçamentos paginados.
 *
 * Leituras adotadas onde a spec era ambígua (ver o relato):
 * - `total` da curva de clientes é o faturamento inteiro (itens + `fora_da_curva`), como diz o item 4 do plano;
 *   a soma das classes é só a dos itens (a spec não diz sobre qual base saem as participações dos clientes);
 * - quem vê o Relatórios é quem vê o Resultado (a mesma permissão hoje), então o 403 do lucro é provado com o Vendedor;
 * - `GET quotes` devolve as linhas em `data` (ou em `data.linhas`) e o resto em `meta`;
 * - o crédito do franqueado não é montado (exige franqueado cadastrado): só o frete prova "fora da curva".
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

console.log("📈 M124: Módulo 39 (Meu Empório), curva ABC e paginação dos orçamentos (Q362 a Q365)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];
const brDia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const somaDias = (s: string, k: number) => new Date(new Date(`${s}T12:00:00Z`).getTime() + k * DIA).toISOString().slice(0, 10);
const HOJE = brDia(new Date());

type Ator = { id: string; role: "OWNER" | "OPERADOR" };
type Mundo = {
  rotulo: string;
  tenantId: string;
  db: Dado;
  owner: Ator;
  tok: { owner: string; vend: string; gestor: string };
  gestorId: string;
  vendId: string;
  categoriaId: string;
};

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture } = await import("./_emporio-papel");
  const bcrypt = (await import("bcryptjs")).default;
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M124 ${rotulo} ${stamp}`, document: `M124${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}) => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M124 ${suf}`, email: `m124-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id as string, role, email: u.email as string };
  };
  const owner = await mk("own", "OWNER");
  const vend = await mk("vend", "OPERADOR"); // Vendedor com as chaves de fixture: vende e devolve, mas não vê relatório
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });

  const db = prismaForTenant(t.id) as Dado;
  const cat = await db.productCategory.create({ data: scoped({ name: `M124 categoria ${rotulo}` }) });
  const token = async (u: { email: string }) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  return {
    rotulo, tenantId: t.id, db, owner, gestorId: gestor.id, vendId: vend.id, categoriaId: cat.id as string,
    tok: { owner: await token(owner), vend: await token(vend), gestor: await token(gestor) },
  };
}

const R = {
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  devolver: () => import("@/app/api/v1/emporio/sales/[id]/return/route"),
  trocar: () => import("@/app/api/v1/emporio/sales/[id]/exchange/route"),
  abc: () => import("@/app/api/v1/emporio/reports/abc/route"),
  quotes: () => import("@/app/api/v1/emporio/quotes/route"),
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
const recusou = (r: Resp, status: number, field?: string) => r.status === status && (field === undefined || r.corpo?.error?.field === field);
const dados = (r: Resp): Dado => r.corpo?.data;
const resumo = (r: Resp) => `${r.status} ${j(r.corpo).slice(0, 260)}`;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 6).join(" | ").slice(0, 700) : String(e));
  }
}

// --- fixtures ---

let seq = 0;
const chave = (p: string) => `m124-${p}-${stamp}-${(seq += 1)}`;
const prismaCru = async (): Promise<Dado> => (await import("@/lib/prisma")).prisma as Dado;

type Loja = { id: string; reg: string };
async function novaLoja(w: Mundo, nome: string): Promise<Loja> {
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const l = await Cat.criarEstabelecimentoAction(w.db, w.owner, { name: `M124 ${w.rotulo} ${nome} ${stamp}` });
  if (!l.ok) throw new Error(`loja: ${j(l)}`);
  await abrirTurnoDeTeste(w.db, w.owner, l.data.id);
  const reg = (await w.db.cashRegister.findFirst({ where: { establishment_id: l.data.id, number: 1 } }))?.id as string;
  return { id: l.data.id as string, reg };
}

type Prod = { id: string; presId: string; nome: string; preco: number };
let seqProd = 0;
async function novoProd(w: Mundo, nome: string, preco: number, lojas: Loja[], custo = 4): Promise<Prod> {
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const nomeFull = `${nome} ${stamp}${(seqProd += 1)}`;
  const p = await Cat.criarProdutoEmporioAction(w.db, w.owner, { name: nomeFull, category_id: w.categoriaId, base_unit: "quilograma" });
  if (!p.ok) throw new Error(`produto: ${j(p)}`);
  const a = await Cat.criarApresentacaoAction(w.db, w.owner, p.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!a.ok) throw new Error(`apresentação: ${j(a)}`);
  for (const l of lojas) {
    const pr = await Cat.definirPrecoAction(w.db, w.owner, { establishment_id: l.id, presentation_id: a.data.id, price: preco });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const im = await Est.implantarEstoqueAction(w.db, w.owner, { establishment_id: l.id, emporio_product_id: p.data.id, sealed: [], loose_qty: 100000, unit_cost: custo });
    if (!im.ok) throw new Error(`estoque: ${j(im)}`);
  }
  return { id: p.data.id as string, presId: a.data.id as string, nome: nomeFull, preco };
}

async function novoCliente(w: Mundo, nome: string): Promise<{ id: string; nome: string }> {
  const prisma = await prismaCru();
  const c = await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: `${nome} ${stamp}`, person_kind: "pf", phone: "11999990000" } });
  return { id: c.id as string, nome: c.name as string };
}

type ItemV = { p: Prod; qty: number };
type VendaFeita = { id: string; itemIds: string[]; total: number };
async function vender(w: Mundo, loja: Loja, clienteId: string, itens: ItemV[], opts: { frete?: number; quando?: string } = {}): Promise<VendaFeita> {
  const liquido = itens.reduce((s, i) => s + i.p.preco * i.qty, 0);
  const total = liquido + (opts.frete ?? 0);
  const r = await chamar(w.tok.owner, R.sales, "POST", "emporio/sales", {
    operation_key: chave("venda"),
    establishment_id: loja.id,
    cash_register_id: loja.reg,
    customer_id: clienteId,
    items: itens.map((i) => ({ emporio_product_id: i.p.id, presentation_id: i.p.presId, quantity: i.qty })),
    payments: [{ kind: "dinheiro", amount: total }],
    ...(opts.frete ? { freight_amount: opts.frete } : {}),
  });
  if (!ok2xx(r)) throw new Error(`venda: ${resumo(r)}`);
  const id = String(dados(r).id);
  if (opts.quando) await (await prismaCru()).emporioSale.update({ where: { id }, data: { sold_at: new Date(opts.quando) } });
  return { id, itemIds: (dados(r).items ?? []).map((x: Dado) => String(x.id)), total: liquido };
}

async function devolver(w: Mundo, loja: Loja, v: VendaFeita, indice: number, qty: number): Promise<void> {
  const r = await chamar(w.tok.owner, R.devolver, "POST", `emporio/sales/${v.id}/return`, {
    operation_key: chave("dev"), refund_kind: "dinheiro", cash_register_id: loja.reg,
    items: [{ sale_item_id: v.itemIds[indice], quantity: qty }],
  }, v.id);
  if (!ok2xx(r)) throw new Error(`devolução: ${resumo(r)}`);
}

const PERIODO = { from: somaDias(HOJE, -3), to: HOJE };
function curva(tok: string, kind: string, measure: string, extra: Record<string, string> = {}, periodo = PERIODO) {
  const qs = new URLSearchParams({ from: periodo.from, to: periodo.to, kind, measure, ...extra });
  return chamar(tok, R.abc, "GET", `emporio/reports/abc?${qs.toString()}`);
}
type Item = { posicao: number; id: string; name: string; quantity?: number; base_unit?: string; sales_count?: number; amount: number; share_pct: number; cumulative_pct: number; classe: string; cost_estimated: boolean; cost_missing: boolean };
const itensDe = (r: Resp): Item[] => (Array.isArray(dados(r)?.itens) ? dados(r).itens : []);
const classesDe = (r: Resp): { classe: string; count: number; amount: number; share_pct: number }[] => (Array.isArray(dados(r)?.classes) ? dados(r).classes : []);
const achar = (r: Resp, nome: string) => itensDe(r).find((i) => i.name === nome);
const somaItens = (r: Resp) => itensDe(r).reduce((s, i) => s + i.amount, 0);

async function relatorio(w: Mundo, lojaId?: string, periodo = PERIODO): Promise<Dado> {
  const Rel = (await import("@/lib/actions/emporio-relatorios")) as Dado;
  const r = await Rel.relatorioDeVendasAction(w.db, w.owner, { ...periodo, ...(lojaId ? { establishment_id: lojaId } : {}) });
  if (!r.ok) throw new Error(`relatório: ${j(r)}`);
  return r.data;
}
const somaPorProduto = (rel: Dado): number => (rel.por_produto as Dado[]).reduce((s, p) => s + Number(p.total), 0);

let A = null as unknown as Mundo;
let B = null as unknown as Mundo;

// ---------------------------------------------------------------------------
// Seção 1
// ---------------------------------------------------------------------------

async function secao1() {
  secaoAtual = "1";
  console.log("1. Classes com números redondos (cortes de 80% e 95% pelo acumulado ANTES do item)");
  const cli = await novoCliente(A, "M124 Cli1");

  console.log("  (a) 50, 30, 10, 6 e 4");
  const L = await novaLoja(A, "S1a");
  const preços = [50, 30, 10, 6, 4];
  const ps: Prod[] = [];
  for (const v of preços) ps.push(await novoProd(A, `M124 Prod${v}`, v, [L]));
  await vender(A, L, cli.id, ps.map((p) => ({ p, qty: 1 })));
  const r = await curva(A.tok.owner, "products", "revenue", { establishment_id: L.id });
  check("a rota responde 200", r.status === 200, resumo(r));
  const it = itensDe(r);
  check("5 itens", it.length === 5, `${it.length}`);
  check("ordem por valor decrescente", j(it.map((i) => i.amount)) === j([50, 30, 10, 6, 4]), j(it.map((i) => i.amount)));
  check("os nomes seguem o valor", j(it.map((i) => i.name)) === j(ps.map((p) => p.nome)), j(it.map((i) => i.name)));
  check("posições 1 a 5", j(it.map((i) => i.posicao)) === j([1, 2, 3, 4, 5]), j(it.map((i) => i.posicao)));
  check("classes A, A, B, B, C (o item que cruza o corte de 80% fica em A)", j(it.map((i) => i.classe)) === j(["A", "A", "B", "B", "C"]), j(it.map((i) => i.classe)));
  check("acumulado 50, 80, 90, 96, 100", it.length === 5 && [50, 80, 90, 96, 100].every((v, k) => perto(it[k].cumulative_pct, v)), j(it.map((i) => i.cumulative_pct)));
  check("participação 50, 30, 10, 6, 4", it.length === 5 && [50, 30, 10, 6, 4].every((v, k) => perto(it[k].share_pct, v)), j(it.map((i) => i.share_pct)));
  check("total 100", perto(dados(r)?.total, 100), j(dados(r)?.total));
  check("o resumo traz kind e measure", dados(r)?.kind === "products" && dados(r)?.measure === "revenue", j([dados(r)?.kind, dados(r)?.measure]));
  check("o período volta como foi pedido", dados(r)?.periodo?.from === PERIODO.from && dados(r)?.periodo?.to === PERIODO.to, j(dados(r)?.periodo));
  check("quantidade e unidade-base de produto", it[0]?.quantity === 1 && it[0]?.base_unit === "quilograma", j([it[0]?.quantity, it[0]?.base_unit]));
  const cl = classesDe(r);
  const cA = cl.find((c) => c.classe === "A");
  const cB = cl.find((c) => c.classe === "B");
  const cC = cl.find((c) => c.classe === "C");
  check("resumo A: 2 itens, 80, 80%", !!cA && cA.count === 2 && perto(cA.amount, 80) && perto(cA.share_pct, 80), j(cA));
  check("resumo B: 2 itens, 16, 16%", !!cB && cB.count === 2 && perto(cB.amount, 16) && perto(cB.share_pct, 16), j(cB));
  check("resumo C: 1 item, 4, 4%", !!cC && cC.count === 1 && perto(cC.amount, 4) && perto(cC.share_pct, 4), j(cC));

  console.log("  (b) um item só é A");
  const L1 = await novaLoja(A, "S1b");
  const unico = await novoProd(A, "M124 Unico", 70, [L1]);
  await vender(A, L1, cli.id, [{ p: unico, qty: 1 }]);
  const rb = await curva(A.tok.owner, "products", "revenue", { establishment_id: L1.id });
  const ib = itensDe(rb);
  check("um item: classe A e acumulado 100", ib.length === 1 && ib[0].classe === "A" && perto(ib[0].cumulative_pct, 100), j(ib));
  check("o resumo tem só a classe A, com 1 item", classesDe(rb).filter((c) => c.count > 0).length === 1 && classesDe(rb).find((c) => c.classe === "A")?.count === 1, j(classesDe(rb)));

  console.log("  (c) empate na medida: ordem por nome");
  const L2 = await novaLoja(A, "S1c");
  const zeta = await novoProd(A, "M124 Zeta", 20, [L2]);
  const alfa = await novoProd(A, "M124 Alfa", 20, [L2]);
  const grande = await novoProd(A, "M124 Grande", 60, [L2]);
  await vender(A, L2, cli.id, [{ p: zeta, qty: 1 }, { p: alfa, qty: 1 }, { p: grande, qty: 1 }]);
  const rc = await curva(A.tok.owner, "products", "revenue", { establishment_id: L2.id });
  check("empate: Alfa antes de Zeta (Zeta foi criado primeiro)", j(itensDe(rc).map((i) => i.name)) === j([grande.nome, alfa.nome, zeta.nome]), j(itensDe(rc).map((i) => i.name)));
  check("classes A, A, B (acumulado antes 0, 60, 80)", j(itensDe(rc).map((i) => i.classe)) === j(["A", "A", "B"]), j(itensDe(rc).map((i) => i.classe)));

  console.log("  (d) produto com tudo devolvido: medida 0, fim da lista, classe C");
  const L3 = await novaLoja(A, "S1d");
  const vivo = await novoProd(A, "M124 Vivo", 100, [L3]);
  const devolvido = await novoProd(A, "M124 Devolvido", 20, [L3]);
  const vd = await vender(A, L3, cli.id, [{ p: devolvido, qty: 1 }, { p: vivo, qty: 1 }]);
  await devolver(A, L3, vd, 0, 1);
  const rd = await curva(A.tok.owner, "products", "revenue", { establishment_id: L3.id });
  const id = itensDe(rd);
  const zero = achar(rd, devolvido.nome);
  check("o devolvido por inteiro fica com valor 0", !!zero && perto(zero.amount, 0), j(zero));
  check("e é o último da lista, em classe C", id.length === 2 && id[1].name === devolvido.nome && id[1].classe === "C", j(id.map((i) => [i.name, i.classe])));
  check("o outro item é A com acumulado 100 (o zero não entra no acumulado)", id[0]?.name === vivo.nome && id[0].classe === "A" && perto(id[0].cumulative_pct, 100) && perto(id[0].share_pct, 100), j(id[0]));
  check("total 100", perto(dados(rd)?.total, 100), j(dados(rd)?.total));

  console.log("  (e) total zero: sem classes");
  const L4 = await novaLoja(A, "S1e");
  const so = await novoProd(A, "M124 Solo", 30, [L4]);
  const vz = await vender(A, L4, cli.id, [{ p: so, qty: 1 }]);
  await devolver(A, L4, vz, 0, 1);
  const re = await curva(A.tok.owner, "products", "revenue", { establishment_id: L4.id });
  check("tudo devolvido: 200, total 0 e classes vazias", re.status === 200 && perto(dados(re)?.total, 0) && classesDe(re).length === 0, resumo(re));
  const L5 = await novaLoja(A, "S1f");
  const rf = await curva(A.tok.owner, "products", "revenue", { establishment_id: L5.id });
  check("loja sem vendas: 200, total 0, sem itens e sem classes", rf.status === 200 && perto(dados(rf)?.total, 0) && itensDe(rf).length === 0 && classesDe(rf).length === 0, resumo(rf));
}

// ---------------------------------------------------------------------------
// Seção 2
// ---------------------------------------------------------------------------

async function secao2() {
  secaoAtual = "2";
  console.log("\n2. Faturamento: a curva sai da mesma conta do relatório");
  const L = await novaLoja(A, "S2");
  const cliA = await novoCliente(A, "M124 CliA");
  const cliB = await novoCliente(A, "M124 CliB");
  const X = await novoProd(A, "M124 X", 20, [L]);
  const Y = await novoProd(A, "M124 Y", 30, [L]);
  const Z = await novoProd(A, "M124 Z", 10, [L]);

  // venda de ANTES do período, devolvida por inteiro DENTRO dele
  const antiga = await vender(A, L, cliA.id, [{ p: X, qty: 1 }], { quando: `${somaDias(HOJE, -10)}T15:00:00Z` });
  await devolver(A, L, antiga, 0, 1);
  // vendas do período (a primeira com frete de 15)
  await vender(A, L, cliA.id, [{ p: X, qty: 2 }], { frete: 15 });
  await vender(A, L, cliB.id, [{ p: Y, qty: 1 }]);
  // troca: vende 2 Z, devolve 1 e leva 1 Z na venda nova
  const base = await vender(A, L, cliB.id, [{ p: Z, qty: 2 }]);
  const tr = await chamar(A.tok.owner, R.trocar, "POST", `emporio/sales/${base.id}/exchange`, {
    operation_key: chave("tr"), cash_register_id: L.reg,
    items_devolvidos: [{ sale_item_id: base.itemIds[0], quantity: 1 }],
    venda: { customer_id: cliB.id, items: [{ emporio_product_id: Z.id, presentation_id: Z.presId, quantity: 1 }], payments: [] },
  }, base.id);
  check("fixture: a troca foi registrada", ok2xx(tr), resumo(tr));

  const rel = await relatorio(A, L.id);
  const rp = await curva(A.tok.owner, "products", "revenue", { establishment_id: L.id });
  check("a rota responde 200", rp.status === 200, resumo(rp));
  check("a soma da curva de produtos é igual à soma do por_produto do relatório", perto(somaItens(rp), somaPorProduto(rel)) && somaItens(rp) > 0, `${somaItens(rp)} contra ${somaPorProduto(rel)}`);
  check("o total da curva é essa mesma soma", perto(dados(rp)?.total, somaPorProduto(rel)), `${dados(rp)?.total} contra ${somaPorProduto(rel)}`);
  let porProdutoIgual = true;
  for (const p of rel.por_produto as Dado[]) {
    const a = achar(rp, p.name);
    if (!a || !perto(a.amount, Number(p.total))) porProdutoIgual = false;
  }
  check("cada produto da curva tem o mesmo total do por_produto", porProdutoIgual && itensDe(rp).length === (rel.por_produto as Dado[]).length, j(itensDe(rp).map((i) => [i.name, i.amount])));
  check("X: 40 vendidos menos 20 devolvidos da venda anterior ao período = 20", perto(achar(rp, X.nome)?.amount ?? NaN, 20), j(achar(rp, X.nome)));
  check("Y: 30", perto(achar(rp, Y.nome)?.amount ?? NaN, 30), j(achar(rp, Y.nome)));
  check("Z: 20 menos 10 devolvidos mais 10 da venda nova da troca = 20", perto(achar(rp, Z.nome)?.amount ?? NaN, 20), j(achar(rp, Z.nome)));
  check("o total é 70, sem o frete de 15", perto(dados(rp)?.total, 70), j(dados(rp)?.total));

  const rc = await curva(A.tok.owner, "customers", "revenue", { establishment_id: L.id });
  const a = achar(rc, cliA.nome);
  const b = achar(rc, cliB.nome);
  check("cliente A: 40 menos 20 devolvidos da venda original = 20 (a devolução foi ao cliente da venda original)", !!a && perto(a.amount, 20), j(a));
  check("cliente B: 30 mais 20 da troca = 50", !!b && perto(b.amount, 50), j(b));
  check("cliente A: 1 venda no período (a antiga não está nele)", a?.sales_count === 1, j(a?.sales_count));
  check("cliente B: 2 vendas, a venda nova da troca não conta", b?.sales_count === 2, j(b?.sales_count));
  check("a soma dos clientes é a soma dos produtos (frete e crédito fora)", perto(somaItens(rc) + (dados(rc)?.fora_da_curva?.amount ?? 0), 70), `${somaItens(rc)} + ${dados(rc)?.fora_da_curva?.amount}`);
  check("clientes: ordem por valor (B antes de A)", itensDe(rc).map((i) => i.name)[0] === cliB.nome, j(itensDe(rc).map((i) => i.name)));
}

// ---------------------------------------------------------------------------
// Seção 3
// ---------------------------------------------------------------------------

async function secao3() {
  secaoAtual = "3";
  console.log("\n3. Lucro (venda menos custo)");
  const L = await novaLoja(A, "S3");
  const cli = await novoCliente(A, "M124 CliLucro");
  const Pa = await novoProd(A, "M124 Pa", 10, [L], 4);
  const Pn = await novoProd(A, "M124 Pn", 20, [L], 4);
  const Pe = await novoProd(A, "M124 Pe", 20, [L], 5);
  const Pp = await novoProd(A, "M124 Pp", 20, [L], 6);
  const prisma = await prismaCru();
  const v = await vender(A, L, cli.id, [{ p: Pa, qty: 5 }, { p: Pn, qty: 1 }, { p: Pe, qty: 1 }, { p: Pp, qty: 1 }]);
  await devolver(A, L, v, 0, 2); // devolve 2 dos 5 de Pa
  await prisma.emporioSaleItem.update({ where: { id: v.itemIds[1] }, data: { unit_cost: null } });
  await prisma.emporioSaleItem.update({ where: { id: v.itemIds[2] }, data: { cost_estimated: true } });
  await prisma.emporioSaleItem.update({ where: { id: v.itemIds[3] }, data: { cost_provisional: true } });
  const itemPa = await prisma.emporioSaleItem.findUnique({ where: { id: v.itemIds[0] } });
  const custoPa = Number(itemPa.unit_cost);
  const custoPe = Number((await prisma.emporioSaleItem.findUnique({ where: { id: v.itemIds[2] } })).unit_cost);
  const custoPp = Number((await prisma.emporioSaleItem.findUnique({ where: { id: v.itemIds[3] } })).unit_cost);
  check("fixture: o item gravou um custo por unidade-base maior que zero", custoPa > 0 && custoPe > 0 && custoPp > 0, `${custoPa} ${custoPe} ${custoPp}`);

  const r = await curva(A.tok.owner, "products", "profit", { establishment_id: L.id });
  check("a rota responde 200 com measure=profit", r.status === 200 && dados(r)?.measure === "profit", resumo(r));
  const pa = achar(r, Pa.nome);
  check("Pa: venda 50, devolvido 20, custo só das 3 que ficaram: lucro = 30 menos 3 x custo", !!pa && perto(pa.amount, 30 - 3 * custoPa), `${j(pa)} esperado ${30 - 3 * custoPa}`);
  check("Pa não marca custo estimado nem sem custo", pa?.cost_estimated === false && pa?.cost_missing === false, j(pa));
  const pn = achar(r, Pn.nome);
  check("Pn (unit_cost nulo): custo zero, lucro igual ao faturamento (20)", !!pn && perto(pn.amount, 20), j(pn));
  check("Pn marca cost_missing", pn?.cost_missing === true, j(pn));
  const pe = achar(r, Pe.nome);
  check("Pe (custo estimado): entra com o custo gravado, lucro = 20 menos custo", !!pe && perto(pe.amount, 20 - custoPe), j(pe));
  check("Pe marca cost_estimated e não cost_missing", pe?.cost_estimated === true && pe?.cost_missing === false, j(pe));
  const pp = achar(r, Pp.nome);
  check("Pp (custo provisório): lucro = 20 menos custo", !!pp && perto(pp.amount, 20 - custoPp), j(pp));
  check("Pp também marca cost_estimated", pp?.cost_estimated === true, j(pp));
  const totalEsperado = 30 - 3 * custoPa + 20 + (20 - custoPe) + (20 - custoPp);
  check("o total da curva é a soma dos lucros", perto(dados(r)?.total, totalEsperado), `${dados(r)?.total} contra ${totalEsperado}`);
  const rr = await curva(A.tok.owner, "products", "revenue", { establishment_id: L.id });
  check("no faturamento o mesmo produto vale a venda líquida (Pa = 30)", perto(achar(rr, Pa.nome)?.amount ?? NaN, 30), j(achar(rr, Pa.nome)));

  const rcl = await curva(A.tok.owner, "customers", "profit", { establishment_id: L.id });
  check("clientes em lucro: o cliente leva a soma dos lucros", rcl.status === 200 && perto(achar(rcl, cli.nome)?.amount ?? NaN, totalEsperado), j(achar(rcl, cli.nome)));

  console.log("  (b) permissão");
  const rVend = await curva(A.tok.vend, "products", "profit", { establishment_id: L.id });
  check("Vendedor (não vê o Resultado) com measure=profit: 403", recusou(rVend, 403), resumo(rVend));
  const rVendCli = await curva(A.tok.vend, "customers", "profit", { establishment_id: L.id });
  check("Vendedor com measure=profit em clientes: 403", recusou(rVendCli, 403), resumo(rVendCli));
  const rVendRec = await curva(A.tok.vend, "products", "revenue", { establishment_id: L.id });
  check("Vendedor também não vê o faturamento (a mesma permissão do Relatórios): 403", recusou(rVendRec, 403), resumo(rVendRec));
}

// ---------------------------------------------------------------------------
// Seção 4
// ---------------------------------------------------------------------------

async function secao4() {
  secaoAtual = "4";
  console.log("\n4. Clientes: o Consumidor final e a venda sem cliente ficam fora da curva");
  const { garantirConsumidorFinal } = await import("@/lib/actions/emporio-clientes");
  const cf = await garantirConsumidorFinal(A.db);
  const L = await novaLoja(A, "S4");
  const c1 = await novoCliente(A, "M124 Cli1");
  const c2 = await novoCliente(A, "M124 Cli2");
  const Pq = await novoProd(A, "M124 Pq", 20, [L]);
  const Pr = await novoProd(A, "M124 Pr", 30, [L]);
  const Ps = await novoProd(A, "M124 Ps", 25, [L]);
  const Pt = await novoProd(A, "M124 Pt", 15, [L]);
  await vender(A, L, c1.id, [{ p: Pq, qty: 3 }]); // 60
  await vender(A, L, c2.id, [{ p: Pr, qty: 1 }]); // 30
  await vender(A, L, cf.id, [{ p: Ps, qty: 1 }]); // 25
  const legado = await vender(A, L, cf.id, [{ p: Pt, qty: 1 }]); // 15, depois sem cliente
  await (await prismaCru()).emporioSale.update({ where: { id: legado.id }, data: { customer_id: null } });

  const r = await curva(A.tok.owner, "customers", "revenue", { establishment_id: L.id });
  check("a rota responde 200", r.status === 200, resumo(r));
  check("os itens são só os dois clientes identificados, 60 e 30", j(itensDe(r).map((i) => [i.name, i.amount])) === j([[c1.nome, 60], [c2.nome, 30]]), j(itensDe(r).map((i) => [i.name, i.amount])));
  check("nenhum item se chama Consumidor final", !itensDe(r).some((i) => /consumidor final/i.test(i.name)));
  const fora = dados(r)?.fora_da_curva;
  check("fora_da_curva soma o Consumidor final e a venda sem cliente: 40 em 2 vendas", !!fora && perto(fora.amount, 40) && fora.sales_count === 2, j(fora));
  check("fora_da_curva traz um rótulo", typeof fora?.label === "string" && fora.label.length > 0, j(fora));
  check("itens mais fora_da_curva igual ao faturamento total da loja (130)", perto(somaItens(r) + (fora?.amount ?? 0), 130), `${somaItens(r)} + ${fora?.amount}`);
  const rel = await relatorio(A, L.id);
  check("e igual à soma do por_produto do relatório", perto(somaItens(r) + (fora?.amount ?? 0), somaPorProduto(rel)), `${somaItens(r) + (fora?.amount ?? 0)} contra ${somaPorProduto(rel)}`);
  check("o total da curva de clientes é o faturamento da loja (itens mais a linha à parte: 130)", perto(dados(r)?.total, 130), j(dados(r)?.total));
  check("cada cliente tem 1 venda", itensDe(r).every((i) => i.sales_count === 1), j(itensDe(r).map((i) => i.sales_count)));
  check("a soma das classes é o total da curva (90)", perto(classesDe(r).reduce((s, c) => s + c.amount, 0), 90), j(classesDe(r)));
  const rp = await curva(A.tok.owner, "products", "revenue", { establishment_id: L.id });
  check("na curva de produtos não existe fora_da_curva", dados(rp)?.fora_da_curva === undefined, j(dados(rp)?.fora_da_curva));
  check("e os produtos do Consumidor final entram nela (4 produtos, 130)", itensDe(rp).length === 4 && perto(dados(rp)?.total, 130), `${itensDe(rp).length} ${dados(rp)?.total}`);
}

// ---------------------------------------------------------------------------
// Seção 5
// ---------------------------------------------------------------------------

async function secao5() {
  secaoAtual = "5";
  console.log("\n5. Lojas, visibilidade, outro tenant e período");
  const dia5 = somaDias(HOJE, -30);
  const quando = `${dia5}T15:00:00Z`;
  const periodo5 = { from: dia5, to: dia5 };
  const S1 = await novaLoja(A, "S5a");
  const S2 = await novaLoja(A, "S5b");
  const cli = await novoCliente(A, "M124 Cli5");
  const Sh = await novoProd(A, "M124 Shared", 10, [S1, S2]);
  const Ot = await novoProd(A, "M124 Outro", 40, [S2]);
  await vender(A, S1, cli.id, [{ p: Sh, qty: 2 }], { quando }); // 20
  await vender(A, S2, cli.id, [{ p: Sh, qty: 3 }, { p: Ot, qty: 1 }], { quando }); // 30 + 40
  const prisma = await prismaCru();
  await prisma.userEstablishment.createMany({ data: [{ tenant_id: A.tenantId, user_id: A.gestorId, establishment_id: S1.id }], skipDuplicates: true });

  const sem = await curva(A.tok.owner, "products", "revenue", {}, periodo5);
  check("sem loja: o Dono vê a soma das lojas (Shared 50, Outro 40, total 90)", sem.status === 200 && perto(achar(sem, Sh.nome)?.amount ?? NaN, 50) && perto(achar(sem, Ot.nome)?.amount ?? NaN, 40) && perto(dados(sem)?.total, 90), resumo(sem));
  const relSem = await relatorio(A, undefined, periodo5);
  check("e bate com o por_produto do relatório sem loja", perto(somaItens(sem), somaPorProduto(relSem)), `${somaItens(sem)} contra ${somaPorProduto(relSem)}`);
  const so1 = await curva(A.tok.owner, "products", "revenue", { establishment_id: S1.id }, periodo5);
  check("com a loja S1: só ela (Shared 20, sem Outro)", so1.status === 200 && perto(achar(so1, Sh.nome)?.amount ?? NaN, 20) && !achar(so1, Ot.nome), resumo(so1));
  const so2 = await curva(A.tok.owner, "products", "revenue", { establishment_id: S2.id }, periodo5);
  check("com a loja S2: Shared 30 e Outro 40", so2.status === 200 && perto(achar(so2, Sh.nome)?.amount ?? NaN, 30) && perto(achar(so2, Ot.nome)?.amount ?? NaN, 40), resumo(so2));
  const cliSem = await curva(A.tok.owner, "customers", "revenue", {}, periodo5);
  check("clientes sem loja: o cliente soma as duas lojas (90)", perto(achar(cliSem, cli.nome)?.amount ?? NaN, 90), j(achar(cliSem, cli.nome)));

  console.log("  (b) o Gestor de uma loja só vê a dele");
  const g = await curva(A.tok.gestor, "products", "revenue", {}, periodo5);
  check("Gestor da S1, sem loja: 200 e só a S1 (Shared 20, sem Outro, total 20)", g.status === 200 && perto(achar(g, Sh.nome)?.amount ?? NaN, 20) && !achar(g, Ot.nome) && perto(dados(g)?.total, 20), resumo(g));
  const gOutra = await curva(A.tok.gestor, "products", "revenue", { establishment_id: S2.id }, periodo5);
  check("Gestor da S1 pedindo a S2: 404", recusou(gOutra, 404), resumo(gOutra));
  const gMesma = await curva(A.tok.gestor, "products", "revenue", { establishment_id: S1.id }, periodo5);
  check("Gestor da S1 pedindo a S1: 200", gMesma.status === 200, resumo(gMesma));
  const gCli = await curva(A.tok.gestor, "customers", "revenue", {}, periodo5);
  check("a curva de clientes do Gestor também só tem as vendas da S1 (20)", gCli.status === 200 && perto(achar(gCli, cli.nome)?.amount ?? NaN, 20), resumo(gCli));

  console.log("  (c) outro tenant");
  const LB = await novaLoja(B, "S5B");
  const rB = await curva(B.tok.owner, "products", "revenue", {}, periodo5);
  check("o Dono de B, sem loja: 200, nada de A (total 0, sem itens)", rB.status === 200 && perto(dados(rB)?.total, 0) && itensDe(rB).length === 0, resumo(rB));
  const rBA = await curva(B.tok.owner, "products", "revenue", { establishment_id: S1.id }, periodo5);
  check("o Dono de B pedindo a loja de A: 404", recusou(rBA, 404), resumo(rBA));
  const rBcli = await curva(B.tok.owner, "customers", "revenue", { establishment_id: LB.id }, periodo5);
  check("a curva de clientes de B não traz cliente de A", rBcli.status === 200 && !achar(rBcli, cli.nome), resumo(rBcli));

  console.log("  (d) período");
  const rMau = await curva(A.tok.owner, "products", "revenue", {}, { from: "2026-02-31", to: "2026-03-05" });
  check("data inicial que não existe: 422 em from", recusou(rMau, 422, "from"), resumo(rMau));
  const rTexto = await curva(A.tok.owner, "products", "revenue", {}, { from: "ontem", to: HOJE });
  check("data inicial em texto: 422 em from", recusou(rTexto, 422, "from"), resumo(rTexto));
  const rInv = await curva(A.tok.owner, "products", "revenue", {}, { from: HOJE, to: somaDias(HOJE, -1) });
  check("data final antes da inicial: 422 em to", recusou(rInv, 422, "to"), resumo(rInv));
  const rLongo = await curva(A.tok.owner, "products", "revenue", {}, { from: somaDias(HOJE, -366), to: HOJE });
  check("367 dias: 422 em to", recusou(rLongo, 422, "to"), resumo(rLongo));
  const rLimite = await curva(A.tok.owner, "products", "revenue", {}, { from: somaDias(HOJE, -365), to: HOJE });
  check("366 dias: 200", rLimite.status === 200, resumo(rLimite));
}

// ---------------------------------------------------------------------------
// Seção 6
// ---------------------------------------------------------------------------

async function secao6() {
  secaoAtual = "6";
  console.log("\n6. Orçamentos: 45 orçamentos paginados (GET /api/v1/emporio/quotes)");
  const Orc = (await import("@/lib/actions/emporio-orcamentos")) as Dado;
  const prisma = await prismaCru();
  const L = await novaLoja(A, "S6");
  const cli = await novoCliente(A, "M124 CliOrc");
  const P = await novoProd(A, "M124 ProdOrc", 10, [L]);
  for (let k = 0; k < 45; k += 1) {
    const q = await Orc.salvarOrcamentoAction(A.db, A.owner, {
      operation_key: chave("orc"), establishment_id: L.id, customer_id: cli.id,
      items: [{ emporio_product_id: P.id, presentation_id: P.presId, quantity: 1 }],
    });
    if (!q.ok) throw new Error(`orçamento ${k}: ${j(q)}`);
  }
  const numeros: number[] = (await prisma.emporioQuote.findMany({ where: { establishment_id: L.id }, select: { number: true } })).map((x: Dado) => x.number as number);
  const menor = Math.min(...numeros);
  const maior = Math.max(...numeros);
  check("fixture: 45 orçamentos na loja", numeros.length === 45, `${numeros.length}`);

  const lista = (params: Record<string, string> = {}, tok = A.tok.owner) => {
    const qs = new URLSearchParams({ establishment_id: L.id, ...params });
    return chamar(tok, R.quotes, "GET", `emporio/quotes?${qs.toString()}`);
  };
  const linhas = (r: Resp): Dado[] => (Array.isArray(r.corpo?.data) ? r.corpo.data : Array.isArray(r.corpo?.data?.linhas) ? r.corpo.data.linhas : []);
  const nums = (r: Resp): number[] => linhas(r).map((x) => Number(x.number));
  const meta = (r: Resp): Dado => r.corpo?.meta ?? {};

  console.log("  (a) 20 por página: 3 páginas");
  const p1 = await lista({ per_page: "20", page: "1" });
  const p2 = await lista({ per_page: "20", page: "2" });
  const p3 = await lista({ per_page: "20", page: "3" });
  check("a rota responde 200", p1.status === 200, resumo(p1));
  check("páginas de 20, 20 e 5 linhas", j([linhas(p1).length, linhas(p2).length, linhas(p3).length]) === j([20, 20, 5]), j([linhas(p1).length, linhas(p2).length, linhas(p3).length]));
  check("meta com total 45, page e per_page", meta(p1).total === 45 && meta(p1).page === 1 && meta(p1).per_page === 20, j(meta(p1)));
  check("meta da página 3: page 3", meta(p3).page === 3 && meta(p3).total === 45, j(meta(p3)));
  const todos = [...nums(p1), ...nums(p2), ...nums(p3)];
  check("as três páginas cobrem os 45 números, sem repetir", new Set(todos).size === 45 && todos.length === 45, `${new Set(todos).size} de ${todos.length}`);
  check("padrão desc: a página 1 começa no maior número e desce", nums(p1)[0] === maior && nums(p1).every((n, k, a) => k === 0 || a[k - 1] > n), j(nums(p1)));
  check("e a última termina no menor", nums(p3)[nums(p3).length - 1] === menor, j(nums(p3)));
  const semParams = await lista();
  check("sem page nem per_page: 20 por página, página 1 (padrão)", linhas(semParams).length === 20 && meta(semParams).per_page === 20 && meta(semParams).page === 1 && meta(semParams).total === 45, resumo(semParams));

  console.log("  (b) ordem crescente");
  const a1 = await lista({ order: "asc", per_page: "20", page: "1" });
  check("order=asc, página 1 começa no menor número e sobe", nums(a1)[0] === menor && nums(a1).every((n, k, a) => k === 0 || a[k - 1] < n), j(nums(a1)));
  const a3 = await lista({ order: "asc", per_page: "20", page: "3" });
  check("order=asc, a página 3 termina no maior", nums(a3)[nums(a3).length - 1] === maior && nums(a3).length === 5, j(nums(a3)));

  console.log("  (c) página além da última e tamanhos");
  const alem = await lista({ per_page: "20", page: "99" });
  check("página 99 devolve a última (página 3, 5 linhas)", alem.status === 200 && meta(alem).page === 3 && linhas(alem).length === 5, resumo(alem));
  const t30 = await lista({ per_page: "30" });
  check("per_page=30: 422 em per_page", recusou(t30, 422, "per_page"), resumo(t30));
  const t100 = await lista({ per_page: "100" });
  check("per_page=100: 45 linhas numa página", t100.status === 200 && linhas(t100).length === 45 && meta(t100).per_page === 100, resumo(t100));
  const t40 = await lista({ per_page: "40", page: "2" });
  check("per_page=40, página 2: 5 linhas", t40.status === 200 && linhas(t40).length === 5 && meta(t40).per_page === 40 && meta(t40).page === 2, resumo(t40));
  const t80 = await lista({ per_page: "80" });
  check("per_page=80: 45 linhas", t80.status === 200 && linhas(t80).length === 45, resumo(t80));

  console.log("  (d) situação e busca com o total certo");
  const aCancelar = (await prisma.emporioQuote.findMany({ where: { establishment_id: L.id }, orderBy: { number: "asc" }, take: 5, select: { id: true } })).map((x: Dado) => x.id as string);
  await prisma.emporioQuote.updateMany({ where: { id: { in: aCancelar } }, data: { canceled_at: new Date(), canceled_reason: "teste M124" } });
  const canc = await lista({ situacao: "cancelado" });
  check("situacao=cancelado: total 5 e 5 linhas", meta(canc).total === 5 && linhas(canc).length === 5, resumo(canc));
  const acomp = await lista({ situacao: "acompanhamento", per_page: "20" });
  check("situacao=acompanhamento: total 40 e 20 linhas na página 1", meta(acomp).total === 40 && linhas(acomp).length === 20, resumo(acomp));
  const acomp2 = await lista({ situacao: "acompanhamento", per_page: "20", page: "2" });
  check("acompanhamento página 2: 20 linhas", linhas(acomp2).length === 20 && meta(acomp2).page === 2, resumo(acomp2));
  const todosS = await lista({ situacao: "todos", per_page: "100" });
  check("situacao=todos: total 45", meta(todosS).total === 45 && linhas(todosS).length === 45, resumo(todosS));
  const antigo = await lista({ situacao: "todos", q: String(menor) });
  check("busca pelo número do orçamento mais antigo acha esse orçamento", antigo.status === 200 && nums(antigo).includes(menor) && meta(antigo).total >= 1, resumo(antigo));
  const antigo2 = await lista({ situacao: "todos", q: String(menor), order: "asc" });
  check("a busca pelo número acha exatamente 1 orçamento", meta(antigo2).total === 1 && nums(antigo2)[0] === menor, resumo(antigo2));
  const porNome = await lista({ situacao: "todos", q: "CliOrc", per_page: "20" });
  check("busca pelo nome do cliente: total 45, 20 na página", meta(porNome).total === 45 && linhas(porNome).length === 20, resumo(porNome));
  const nada = await lista({ situacao: "todos", q: "zzzqqq" });
  check("busca sem resultado: total 0 e nenhuma linha", nada.status === 200 && meta(nada).total === 0 && linhas(nada).length === 0, resumo(nada));

  console.log("  (e) limit antigo e outro tenant");
  const lim = await lista({ limit: "7" });
  check("limit=7 sem page continua valendo: 7 linhas", lim.status === 200 && linhas(lim).length === 7, resumo(lim));
  const rB = await chamar(B.tok.owner, R.quotes, "GET", "emporio/quotes?situacao=todos");
  check("o Dono de B não vê os orçamentos de A (total 0)", rB.status === 200 && (meta(rB).total ?? 0) === 0 && linhas(rB).length === 0, resumo(rB));
}

// ---------------------------------------------------------------------------

async function limpar(id: string) {
  const prisma = await prismaCru();
  await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } }).catch(() => undefined);
  await prisma.emporioQuote.updateMany({ where: { tenant_id: id }, data: { sale_id: null, based_on_quote_id: null } }).catch(() => undefined);
  await prisma.tenant.delete({ where: { id } }).catch((e: unknown) => console.log(`  (teardown ${id}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
}

async function main() {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const prisma = await prismaCru();
  try {
    A = await montar("A");
    B = await montar("B");
    await rodar("1", secao1);
    await rodar("2", secao2);
    await rodar("3", secao3);
    await rodar("4", secao4);
    await rodar("5", secao5);
    await rodar("6", secao6);
  } finally {
    for (const id of tenantIds.reverse()) await limpar(id);
    await prisma.$disconnect();
  }
  const total = Object.values(contagem).reduce((s, c) => s + c.ok + c.falhas, 0);
  console.log(`\nChecagens: ${total}`);
  for (const [s, c] of Object.entries(contagem)) console.log(`  seção ${s}: ${c.ok} ok, ${c.falhas} falha(s)`);
  console.log(falhas === 0 ? "\n✅ M124 (Módulo 39, Empório): curva ABC e paginação dos orçamentos passou." : `\n❌ M124 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
