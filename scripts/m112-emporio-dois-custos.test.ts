import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M112: Módulo 39 (Meu Empório), dois custos: médio e última compra, e a base do preço sugerido (Q293 a Q297).
 * Roda: `npm run test:m112`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-10-emporio-dois-custos-design.md, sem ler a implementação.
 *
 * Seção 1 (pura): custoMedio devolve a última compra; custoDoSugerido por base; saldo zero (Q297); diferencaPct.
 * Seção 2 (rotas): a loja nasce com base "maior"; PATCH da base (valores, 422, 403, 404 de outro tenant).
 * Seção 3 (rotas): o caso TALCO/ GEL na formação de preço (GET products/:id): a base muda só o sugerido.
 * Seção 4 (rotas): estoque e leitura do formulário de compra (Q296).
 * Seção 5 (rotas): saldo zerado usa a última compra em qualquer base (Q297).
 *
 * Suposições (o contrato não fechava): os campos novos da formação de preço ficam nas linhas `prices` do GET
 * /api/v1/emporio/products/:id (cada linha é uma loja e uma apresentação; a apresentação usada tem base_qty 1,
 * então custo por unidade-base e custo da apresentação coincidem); a leitura do formulário de compra é o
 * GET /api/v1/emporio/stock?establishment_id= (linhas com `stock_balance` e `average_cost`); `cost_gap_pct` é
 * (última - médio) / médio * 100; a loja devolve `price_cost_basis` no GET /api/v1/emporio/establishments/:id.
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
const perto = (a: unknown, b: number, tol = 0.005) => typeof a === "number" && Math.abs(a - b) < tol;
const n = (x: unknown) => (x === null || x === undefined ? NaN : Number(x));

console.log("💲 M112: Módulo 39 (Meu Empório), dois custos e a base do preço sugerido (Q293 a Q297)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];

// ------------------------------------------------------------------------------------------------ puras
async function puras() {
  const caminho = "@/lib/emporio/custo-medio";
  const M = (await import(caminho)) as Dado;
  const t0 = Date.UTC(2026, 0, 1);
  const mov = (i: number, tipo: string, quantity: number, unit_cost: number | null, extra: Dado = {}) => ({
    movement_type: tipo,
    quantity,
    unit_cost,
    occurred_at: new Date(t0 + i * 86_400_000),
    created_at: new Date(t0 + i * 86_400_000),
    canceled_at: null,
    ...extra,
  });
  const cdm = (m: Dado[]) => M.custoMedio(m) as Dado;
  const sug = (base: string, m: Dado[], referencia: number | null = null) => {
    const c = cdm(m);
    return M.custoDoSugerido({ saldo: c.saldo, custo_medio: c.custo_medio, ultima_compra_custo: c.ultima_compra_custo, referencia }, base) as Dado;
  };

  console.log("1. Funções puras");
  check("LIMITE_AVISO_CUSTO_PCT é 10", M.LIMITE_AVISO_CUSTO_PCT === 10, String(M.LIMITE_AVISO_CUSTO_PCT));

  const impl = mov(1, "implantacao", 5000, 1.28);
  const consumo = mov(2, "venda", 1108, null);
  const compra = mov(3, "compra", 100, 2.35);
  let r = cdm([impl, consumo, compra]);
  check("TALCO/ GEL: saldo 3992", r.saldo === 3992, j(r));
  check("TALCO/ GEL: médio perto de 1,307", perto(r.custo_medio, 1.307, 0.0006), j(r));
  check("TALCO/ GEL: última compra 2,35", perto(r.ultima_compra_custo, 2.35, 0.00001), j(r));
  check("TALCO/ GEL: ultima_compra_em é a data da compra", r.ultima_compra_em != null && new Date(r.ultima_compra_em).getTime() === new Date(t0 + 3 * 86_400_000).getTime(), j(r));

  r = cdm([impl, consumo]);
  check("só implantação e consumo: sem última compra (a implantação não é compra)", r.ultima_compra_custo == null && r.ultima_compra_em == null, j(r));

  r = cdm([impl, mov(2, "compra", 10, 2), mov(3, "compra", 10, 3)]);
  check("a última compra é a mais recente por data (3)", perto(r.ultima_compra_custo, 3, 0.00001), j(r));
  r = cdm([mov(3, "compra", 10, 3), impl, mov(2, "compra", 10, 2)]);
  check("fora de ordem no array: ainda a mais recente por occurred_at (3)", perto(r.ultima_compra_custo, 3, 0.00001), j(r));
  r = cdm([impl, mov(2, "compra", 10, 2), mov(3, "compra", 10, 9, { canceled_at: new Date(t0 + 4 * 86_400_000) })]);
  check("compra cancelada não é a última (2)", perto(r.ultima_compra_custo, 2, 0.00001), j(r));
  r = cdm([impl, mov(2, "compra", 10, 2), mov(3, "compra", 10, null)]);
  check("compra sem custo não conta como última (2)", perto(r.ultima_compra_custo, 2, 0.00001), j(r));

  console.log("\n   Q297: saldo zerado");
  const zerou = mov(4, "perda", 3992, null);
  r = cdm([impl, consumo, compra, zerou]);
  check("zerar o saldo: saldo 0 e a última compra segue 2,35", r.saldo === 0 && perto(r.ultima_compra_custo, 2.35, 0.00001), j(r));
  for (const base of ["medio", "ultima_compra", "maior"]) {
    const s = sug(base, [impl, consumo, compra, zerou]);
    check(`saldo 0, base ${base}: custo 2,35 e origem ultima_compra`, perto(s.custo, 2.35, 0.00001) && s.origem === "ultima_compra", j(s));
  }
  const semSaldoSemCompra = sug("maior", [impl, mov(2, "perda", 5000, null)], 7.5);
  check("saldo 0 e sem compra nenhuma: o custo de referência, origem referencia", perto(semSaldoSemCompra.custo, 7.5, 0.00001) && semSaldoSemCompra.origem === "referencia", j(semSaldoSemCompra));
  r = cdm([mov(1, "compra", 10, 20), mov(2, "venda", 10, null), mov(3, "compra", 10, 30)]);
  check("compra com saldo zero reinicia a média: 20, acaba, 30 => 30", r.saldo === 10 && perto(r.custo_medio, 30), j(r));

  console.log("\n   Bases com saldo positivo");
  const alta = [mov(1, "compra", 10, 10), mov(2, "compra", 10, 20)]; // médio 15, última 20
  const baixa = [mov(1, "compra", 10, 20), mov(2, "compra", 10, 10)]; // médio 15, última 10
  let s = sug("medio", alta);
  check("alta, base medio: 15, medio", perto(s.custo, 15) && s.origem === "medio", j(s));
  s = sug("ultima_compra", alta);
  check("alta, base ultima_compra: 20, ultima_compra", perto(s.custo, 20) && s.origem === "ultima_compra", j(s));
  s = sug("maior", alta);
  check("alta, base maior: 20, ultima_compra", perto(s.custo, 20) && s.origem === "ultima_compra", j(s));
  s = sug("medio", baixa);
  check("baixa, base medio: 15, medio", perto(s.custo, 15) && s.origem === "medio", j(s));
  s = sug("ultima_compra", baixa);
  check("baixa, base ultima_compra: 10, ultima_compra", perto(s.custo, 10) && s.origem === "ultima_compra", j(s));
  s = sug("maior", baixa);
  check("baixa, base maior: segura o médio, 15, medio", perto(s.custo, 15) && s.origem === "medio", j(s));
  s = sug("maior", [impl]);
  check("só implantação (sem compra), base maior: o médio 1,28", perto(s.custo, 1.28, 0.00001) && s.origem === "medio", j(s));

  console.log("\n   diferencaPct e o limite");
  const d = (a: number | null, b: number | null) => M.diferencaPct(a, b) as number | null;
  check("médio 10, última 11: 10% para cima", perto(d(10, 11), 10, 0.01), String(d(10, 11)));
  check("médio 10, última 9: 10% (em módulo) para baixo", d(10, 9) != null && perto(Math.abs(d(10, 9) as number), 10, 0.01), String(d(10, 9)));
  check("médio 1,3068, última 2,35: cerca de 79,8%", d(1.3068, 2.35) != null && perto(d(1.3068, 2.35) as number, 79.8, 0.5), String(d(1.3068, 2.35)));
  check("sem o médio: null", d(null, 2) === null, String(d(null, 2)));
  check("sem a última: null", d(2, null) === null, String(d(2, null)));
  check("o aviso vale acima do limite (10,01% passa, 10% exato não)", Math.abs(d(100, 110.01) as number) > M.LIMITE_AVISO_CUSTO_PCT && !(Math.abs(d(100, 110) as number) > M.LIMITE_AVISO_CUSTO_PCT));
}

// ------------------------------------------------------------------------------------------------ rotas
type Usuario = { id: string; email: string };
type Mundo = {
  tenantId: string;
  db: Dado;
  owner: Usuario;
  tok: Record<"owner" | "vend", string>;
  L1: string;
  prodId: string;
  presId: string;
};

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, vincularTodas } = await import("./_emporio-papel");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M112 ${rotulo} ${stamp}`, document: `M112${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR"): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M112 ${suf}`, email: `m112-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role) },
    });
    return { id: u.id, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const vend = await mk("vend", "OPERADOR");

  const db = prismaForTenant(t.id) as Dado;
  const ator = { id: owner.id, role: "OWNER" as const };
  const l1 = await Cat.criarEstabelecimentoAction(db, ator, { name: `M112 ${rotulo} Loja 1` });
  if (!l1.ok) throw new Error(`loja: ${j(l1)}`);
  const L1 = l1.data.id as string;
  await vincularTodas(prisma, t.id, [vend.id], [L1]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M112 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, ator, { name: `M112 Talco ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, ator, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  const pr = await Cat.definirPrecoAction(db, ator, { establishment_id: L1, presentation_id: pres.data.id, price: 10 });
  if (!pr.ok) throw new Error(`preço: ${j(pr)}`);

  const tok = {} as Mundo["tok"];
  for (const [k, u] of [["owner", owner], ["vend", vend]] as [keyof Mundo["tok"], Usuario][]) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { tenantId: t.id, db, owner, tok, L1, prodId: prod.data.id, presId: pres.data.id };
}

const R = {
  loja: () => import("@/app/api/v1/emporio/establishments/[id]/route"),
  produto: () => import("@/app/api/v1/emporio/products/[id]/route"),
  stock: () => import("@/app/api/v1/emporio/stock/route"),
  purchases: () => import("@/app/api/v1/emporio/purchases/route"),
  implantation: () => import("@/app/api/v1/emporio/stock/implantation/route"),
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
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
async function main() {
  await puras();

  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    const A = await montar("A");
    const B = await montar("B");
    const ator = { id: A.owner.id, role: "OWNER" as const };

    const lerLoja = (w: Mundo, tok: string) => chamar(tok, R.loja, "GET", `emporio/establishments/${w.L1}`, undefined, w.L1);
    const patchLoja = (w: Mundo, tok: string, corpo: unknown) => chamar(tok, R.loja, "PATCH", `emporio/establishments/${w.L1}`, corpo, w.L1);
    const linhaPreco = async (w: Mundo): Promise<Dado> => {
      const r = await chamar(w.tok.owner, R.produto, "GET", `emporio/products/${w.prodId}`, undefined, w.prodId);
      return (r.corpo?.data?.prices ?? []).find((x: Dado) => x.establishment_id === w.L1 && x.presentation_id === w.presId);
    };
    const precoGravado = async (w: Mundo) => n((await w.db.presentationPrice.findFirst({ where: { establishment_id: w.L1, presentation_id: w.presId } }))?.price);

    // -------------------------------------------------------------------- 2
    await rodar("base da loja", async () => {
      console.log("\n2. A base do preço sugerido na loja (Q294)");
      const g = await lerLoja(A, A.tok.owner);
      check("loja nova: price_cost_basis maior no GET", g.status === 200 && g.corpo?.data?.price_cost_basis === "maior", `${g.status} ${j(g.corpo?.data)}`);
      const noBanco = (await P.establishment.findFirst({ where: { id: A.L1 } })) as Dado;
      check("loja nova: o banco guarda maior", noBanco?.price_cost_basis === "maior", j(noBanco?.price_cost_basis));
      const ruim = await patchLoja(A, A.tok.owner, { price_cost_basis: "media" });
      check("valor fora da lista: 422 em price_cost_basis", ruim.status === 422 && ruim.corpo?.error?.field === "price_cost_basis", `${ruim.status} ${j(ruim.corpo)}`);
      check("a recusa não mudou a base", (await P.establishment.findFirst({ where: { id: A.L1 } }))?.price_cost_basis === "maior");
      const sem = await patchLoja(A, A.tok.vend, { price_cost_basis: "medio" });
      check("Vendedor edita a base: 403", sem.status === 403, `${sem.status} ${j(sem.corpo)}`);
      check("o 403 não mudou a base", (await P.establishment.findFirst({ where: { id: A.L1 } }))?.price_cost_basis === "maior");
      const outro = await patchLoja(A, B.tok.owner, { price_cost_basis: "medio" });
      check("o tenant B edita a base da loja do A: 404", outro.status === 404, `${outro.status} ${j(outro.corpo)}`);
      check("o 404 não mudou a base", (await P.establishment.findFirst({ where: { id: A.L1 } }))?.price_cost_basis === "maior");
      const ok = await patchLoja(A, A.tok.owner, { price_cost_basis: "medio" });
      check("o Dono muda para medio: 200", ok.status === 200 && ok.corpo?.data?.price_cost_basis === "medio", `${ok.status} ${j(ok.corpo)}`);
      check("o banco guarda medio", (await P.establishment.findFirst({ where: { id: A.L1 } }))?.price_cost_basis === "medio");
      const volta = await patchLoja(A, A.tok.owner, { price_cost_basis: "maior" });
      check("e volta para maior: 200", volta.status === 200 && (await P.establishment.findFirst({ where: { id: A.L1 } }))?.price_cost_basis === "maior", `${volta.status}`);
    });

    // -------------------------------------------------------------------- 3
    await rodar("talco", async () => {
      console.log("\n3. O caso TALCO/ GEL na formação de preço");
      const imp = await chamar(A.tok.owner, R.implantation, "POST", "emporio/stock/implantation", {
        establishment_id: A.L1, emporio_product_id: A.prodId, sealed: [], loose_qty: 5000, unit_cost: 1.28,
      });
      check("implantação de 5000 a 1,28: 201", imp.status === 201 || imp.status === 200, `${imp.status} ${j(imp.corpo)}`);
      const { registrarPerdaAction } = await import("@/lib/actions/emporio-estoque");
      const perda = await registrarPerdaAction(A.db, ator, { establishment_id: A.L1, emporio_product_id: A.prodId, quantity: 1108, reason: "outro" });
      check("consumo de 1108 (saldo 3892)", perda.ok, j(perda));

      const antes = await linhaPreco(A);
      check("sem compra: a última compra é nula e o médio 1,28", antes != null && antes.last_purchase_cost == null && perto(antes.average_cost, 1.28), j(antes));
      check("sem compra e sem os dois custos: cost_gap_pct nulo", antes != null && antes.cost_gap_pct === null, j(antes?.cost_gap_pct));

      seq += 1;
      const compra = await chamar(A.tok.owner, R.purchases, "POST", "emporio/purchases", {
        operation_key: `m112-${stamp}-${seq}`, establishment_id: A.L1, purchased_at: new Date().toISOString(), received: true, freight: 0,
        items: [{ emporio_product_id: A.prodId, presentation_id: A.presId, quantity: 100, item_total: 235 }],
        payment: { kind: "a_prazo", due_date: new Date(Date.now() + 30 * DIA).toISOString() },
      });
      check("compra de 100 a 2,35 recebida: 201", compra.status === 201 || compra.status === 200, `${compra.status} ${j(compra.corpo)}`);

      const l = await linhaPreco(A);
      check("average_cost perto de 1,307", l != null && perto(l.average_cost, 1.307, 0.0006), j(l));
      check("last_purchase_cost 2,35", l != null && perto(l.last_purchase_cost, 2.35, 0.0001), j(l));
      check("last_purchase_on é uma data de hoje", l != null && typeof l.last_purchase_on === "string" && l.last_purchase_on.slice(0, 7) === new Date().toISOString().slice(0, 7), j(l?.last_purchase_on));
      check("price_cost_basis maior na linha", l?.price_cost_basis === "maior", j(l?.price_cost_basis));
      check("base maior: suggested_cost 2,35, origem ultima_compra", l != null && perto(l.suggested_cost, 2.35, 0.0001) && l.suggested_cost_source === "ultima_compra", j(l));
      check("cost_gap_pct perto de 79,8 (acima do limite de 10)", l != null && typeof l.cost_gap_pct === "number" && perto(Math.abs(l.cost_gap_pct), 79.8, 0.5), j(l?.cost_gap_pct));
      check("o preço de venda gravado segue 10", l?.price === 10 && (await precoGravado(A)) === 10, j(l?.price));

      const toMedio = await patchLoja(A, A.tok.owner, { price_cost_basis: "medio" });
      check("troca a base para medio: 200", toMedio.status === 200, `${toMedio.status} ${j(toMedio.corpo)}`);
      const m = await linhaPreco(A);
      check("base medio: suggested_cost 1,307, origem medio", m != null && perto(m.suggested_cost, 1.307, 0.0006) && m.suggested_cost_source === "medio", j(m));
      check("trocar a base não mexeu no PresentationPrice (10)", m?.price === 10 && (await precoGravado(A)) === 10, j(m?.price));
      check("o sugerido em dinheiro acompanha o custo (sem percentuais)", m != null && typeof m.suggested_price === "number" && perto(m.suggested_price, m.suggested_cost, 0.01), j([m?.suggested_price, m?.suggested_cost]));
      check("o gap continua informado, mesmo com a base medio", m != null && typeof m.cost_gap_pct === "number" && perto(Math.abs(m.cost_gap_pct), 79.8, 0.5), j(m?.cost_gap_pct));

      await patchLoja(A, A.tok.owner, { price_cost_basis: "ultima_compra" });
      const u = await linhaPreco(A);
      check("base ultima_compra: suggested_cost 2,35, origem ultima_compra", u != null && perto(u.suggested_cost, 2.35, 0.0001) && u.suggested_cost_source === "ultima_compra", j(u));
      check("o preço de venda segue 10", (await precoGravado(A)) === 10);

      const det = await chamar(A.tok.owner, R.produto, "GET", `emporio/products/${A.prodId}`, undefined, A.prodId);
      const d = det.corpo?.data;
      check("o produto também mostra os dois custos (nível do produto ou da linha da loja)", d != null && (("average_cost" in d && "last_purchase_cost" in d) || (d.prices ?? []).some((x: Dado) => "average_cost" in x && "last_purchase_cost" in x)), j(Object.keys(d ?? {})));
    });

    // -------------------------------------------------------------------- 4
    await rodar("estoque e compra", async () => {
      console.log("\n4. Estoque e formulário de compra (Q295, Q296)");
      const est = await chamar(A.tok.owner, R.stock, "GET", `emporio/stock?establishment_id=${A.L1}`);
      const linha = (est.corpo?.data ?? []).find((x: Dado) => x.emporio_product_id === A.prodId);
      check("o estoque devolve a linha do produto", est.status === 200 && !!linha, `${est.status}`);
      check("o estoque traz average_cost 1,307 e last_purchase_cost 2,35", linha != null && perto(linha.average_cost, 1.307, 0.0006) && perto(linha.last_purchase_cost, 2.35, 0.0001), j(linha));
      check("o estoque traz last_purchase_on e o gap acima do limite", linha != null && typeof linha.last_purchase_on === "string" && typeof linha.cost_gap_pct === "number" && Math.abs(linha.cost_gap_pct) > 10, j([linha?.last_purchase_on, linha?.cost_gap_pct]));
      check("formulário de compra: stock_balance 3992 (o saldo antes da entrada)", linha != null && n(linha.stock_balance) === 3992, j(linha?.stock_balance));
      check("formulário de compra: average_cost atual", linha != null && perto(linha.average_cost, 1.307, 0.0006));
    });

    // -------------------------------------------------------------------- 5
    await rodar("saldo zerado", async () => {
      console.log("\n5. Saldo zerado usa a última compra em qualquer base (Q297)");
      const { registrarPerdaAction } = await import("@/lib/actions/emporio-estoque");
      const perda = await registrarPerdaAction(A.db, ator, { establishment_id: A.L1, emporio_product_id: A.prodId, quantity: 3992, reason: "outro" });
      check("saída de todo o saldo", perda.ok, j(perda));
      for (const base of ["medio", "maior", "ultima_compra"]) {
        await patchLoja(A, A.tok.owner, { price_cost_basis: base });
        const l = await linhaPreco(A);
        check(`base ${base}: sugerido 2,35, origem ultima_compra`, l != null && perto(l.suggested_cost, 2.35, 0.0001) && l.suggested_cost_source === "ultima_compra", j(l));
      }
      const l = await linhaPreco(A);
      check("sem estoque: o custo médio fica nulo", l != null && l.average_cost == null, j(l?.average_cost));
      check("sem estoque: sem gap para avisar", l != null && l.cost_gap_pct == null, j(l?.cost_gap_pct));
      check("o preço de venda ainda é 10", (await precoGravado(A)) === 10);
      const est = await chamar(A.tok.owner, R.stock, "GET", `emporio/stock?establishment_id=${A.L1}`);
      const linha = (est.corpo?.data ?? []).find((x: Dado) => x.emporio_product_id === A.prodId);
      check("formulário de compra com saldo 0: stock_balance 0", linha != null && n(linha.stock_balance) === 0, j(linha));
    });
  } finally {
    for (const id of tenantIds) {
      try {
        await prisma.stockMovement.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioPurchaseItem.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioPurchase.deleteMany({ where: { tenant_id: id } });
        await prisma.stockLimit.deleteMany({ where: { tenant_id: id } });
        await prisma.financialEntry.deleteMany({ where: { tenant_id: id } });
        await prisma.presentationPrice.deleteMany({ where: { tenant_id: id } });
        await prisma.productPresentation.deleteMany({ where: { tenant_id: id } });
        await prisma.userEstablishment.deleteMany({ where: { tenant_id: id } });
        await prisma.emporioProduct.deleteMany({ where: { tenant_id: id } });
        await prisma.product.deleteMany({ where: { tenant_id: id } });
        await prisma.establishment.deleteMany({ where: { tenant_id: id } });
        await prisma.productCategory.deleteMany({ where: { tenant_id: id } });
        await prisma.tenant.delete({ where: { id } });
      } catch (e) {
        console.log(`  (teardown ${id}: ${e instanceof Error ? e.message.slice(0, 100) : e})`);
      }
    }
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\n✅ M112 (Módulo 39, Empório): os dois custos e a base do sugerido passaram." : `\n❌ M112 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
