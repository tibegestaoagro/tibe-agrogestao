import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M112: Módulo 39 (Meu Empório), o custo do produto: um só, que zera com o estoque (Q297 a Q299).
 * Roda: `npm run test:m112`
 *
 * Spec: docs/superpowers/specs/2026-11-11-emporio-custo-um-so-design.md (pedido da Agromax em 11/11/2026).
 *
 * Seção 1 (pura): a média recomeça quando o estoque zera; o custo único (médio, última compra, referência);
 *   `momentoDaEntrada` (data de hoje vira a hora do lançamento, outra data fica).
 * Seção 2 (rotas): o caso TALCO/ GEL de 10/11: contagem zerando e, DEPOIS, a compra com a data de hoje.
 *   O custo tem de ser o da compra (2,35), não a mistura com o estoque que não existia (1,31).
 * Seção 3 (rotas): compra com data de ontem fica ontem, e o recebimento posterior de hoje entra agora.
 * Seção 4 (rotas): um custo só nas leituras (produto, estoque, loja), sem base nem segundo custo.
 * Seção 5 (rotas): saldo zerado mostra a última compra; o formulário de compra vê o saldo (Q296).
 *
 * ⚠️ A compra da seção 2 vai com 00:00:01 do dia de hoje, e não com o meio-dia que a tela manda: com o
 * meio-dia, rodar a suíte de manhã deixaria a contagem ANTES do carimbo, e o teste passaria sem a
 * correção. Com 00:00:01, sem a correção a compra sempre cai antes da contagem.
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

console.log("💲 M112: Módulo 39 (Meu Empório), o custo do produto, um só, que zera com o estoque (Q297 a Q299)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];

const hojeBr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const ontemBr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(Date.now() - DIA));

// ------------------------------------------------------------------------------------------------ puras
async function puras() {
  const M = (await import("@/lib/emporio/custo-medio")) as Dado;
  const D = (await import("@/lib/emporio/datas")) as Dado;
  const t0 = Date.UTC(2026, 0, 1);
  const mov = (i: number, tipo: string, quantity: number, unit_cost: number | null, extra: Dado = {}) => ({
    movement_type: tipo,
    quantity,
    unit_cost,
    occurred_at: new Date(t0 + i * DIA),
    created_at: new Date(t0 + i * DIA),
    canceled_at: null,
    ...extra,
  });
  const cdm = (m: Dado[]) => M.custoMedio(m) as Dado;
  const unico = (m: Dado[], referencia: number | null = null) => {
    const c = cdm(m);
    return M.custoDoSugerido({ saldo: c.saldo, custo_medio: c.custo_medio, ultima_compra_custo: c.ultima_compra_custo, referencia }) as Dado;
  };

  console.log("1. Funções puras");
  let r = cdm([mov(1, "compra", 10, 20), mov(2, "compra", 10, 30)]);
  check("com estoque, a compra entra na média: 20 e 30 dão 25", r.saldo === 20 && perto(r.custo_medio, 25), j(r));
  r = cdm([mov(1, "compra", 10, 20), mov(2, "venda", 10, null), mov(3, "compra", 10, 30)]);
  check("zerou o estoque, a média recomeça: 20, acaba, 30 dá 30", r.saldo === 10 && perto(r.custo_medio, 30), j(r));
  const ajusteZero = mov(3, "ajuste", 3892, null, { previous_balance: 3892, corrected_balance: 0 });
  r = cdm([mov(1, "implantacao", 5000, 1.28), mov(2, "venda", 1108, null), ajusteZero, mov(4, "compra", 100, 2.35)]);
  check("TALCO na ordem certa: contagem zera, compra depois, custo 2,35", r.saldo === 100 && perto(r.custo_medio, 2.35, 0.00001), j(r));
  r = cdm([mov(1, "implantacao", 5000, 1.28), mov(2, "venda", 1108, null), mov(2.5, "compra", 100, 2.35), ajusteZero]);
  check("TALCO invertido (o defeito): a compra antes da contagem vira 1,31", perto(r.custo_medio, 1.3068, 0.0006), j(r));
  check("custoMedio não devolve mais a data da última compra (só o custo)", !("ultima_compra_em" in r), j(Object.keys(r)));

  console.log("\n   O custo único (Q299)");
  let s = unico([mov(1, "compra", 10, 10), mov(2, "compra", 10, 20)]);
  check("com estoque: o médio (15), origem medio", perto(s.custo, 15) && s.origem === "medio", j(s));
  s = unico([mov(1, "compra", 10, 20), mov(2, "venda", 10, null)]);
  check("sem estoque: a última compra (20), origem ultima_compra", perto(s.custo, 20) && s.origem === "ultima_compra", j(s));
  s = unico([mov(1, "implantacao", 5, 3), mov(2, "venda", 5, null)], 7.5);
  check("sem estoque e sem compra: o custo de referência (7,5)", perto(s.custo, 7.5) && s.origem === "referencia", j(s));
  s = unico([], null);
  check("sem nada: custo nulo", s.custo === null && s.origem === null, j(s));
  check("custoDoSugerido não aceita mais base (um parâmetro só)", M.custoDoSugerido.length === 1, String(M.custoDoSugerido.length));
  check("o limite do aviso de 10% saiu", M.LIMITE_AVISO_CUSTO_PCT === undefined && M.diferencaPct === undefined);

  console.log("\n   momentoDaEntrada (Q298)");
  const agora = new Date("2026-11-10T17:16:00Z"); // 14:16 em Brasília
  const mesmoDia = new Date("2026-11-10T15:00:00Z"); // o meio-dia que a tela manda
  check("data de hoje vira o momento do lançamento", D.momentoDaEntrada(mesmoDia, agora).getTime() === agora.getTime());
  const ontem = new Date("2026-11-09T15:00:00Z");
  check("data de ontem fica como veio", D.momentoDaEntrada(ontem, agora).getTime() === ontem.getTime());
  const noite = new Date("2026-11-11T02:30:00Z"); // 23:30 de 10/11 em Brasília
  const meiaNoiteUtc = new Date("2026-11-10T23:00:00Z"); // 20:00 de 10/11 em Brasília
  check("o dia é o de Brasília, não o do UTC (23:30 de 10/11 ainda é 10/11)", D.momentoDaEntrada(meiaNoiteUtc, noite).getTime() === noite.getTime());
  const amanhaBr = new Date("2026-11-11T15:00:00Z");
  check("data de amanhã fica como veio", D.momentoDaEntrada(amanhaBr, agora).getTime() === amanhaBr.getTime());
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
  productId: string;
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
  const ep = await db.emporioProduct.findFirst({ where: { id: prod.data.id } });

  const tok = {} as Mundo["tok"];
  for (const [k, u] of [["owner", owner], ["vend", vend]] as [keyof Mundo["tok"], Usuario][]) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { tenantId: t.id, db, owner, tok, L1, prodId: prod.data.id, productId: ep.product_id, presId: pres.data.id };
}

const R = {
  loja: () => import("@/app/api/v1/emporio/establishments/[id]/route"),
  produto: () => import("@/app/api/v1/emporio/products/[id]/route"),
  stock: () => import("@/app/api/v1/emporio/stock/route"),
  purchases: () => import("@/app/api/v1/emporio/purchases/route"),
  receive: () => import("@/app/api/v1/emporio/purchases/[id]/receive/route"),
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

    const linhaPreco = async (w: Mundo): Promise<Dado> => {
      const r = await chamar(w.tok.owner, R.produto, "GET", `emporio/products/${w.prodId}`, undefined, w.prodId);
      return (r.corpo?.data?.prices ?? []).find((x: Dado) => x.establishment_id === w.L1 && x.presentation_id === w.presId);
    };
    const linhaEstoque = async (w: Mundo): Promise<Dado> => {
      const r = await chamar(w.tok.owner, R.stock, "GET", `emporio/stock?establishment_id=${w.L1}`);
      return (r.corpo?.data ?? []).find((x: Dado) => x.emporio_product_id === w.prodId);
    };
    const comprar = async (w: Mundo, purchased_at: string, received: boolean, quantidade: number, total: number) => {
      seq += 1;
      return chamar(w.tok.owner, R.purchases, "POST", "emporio/purchases", {
        operation_key: `m112-${stamp}-${seq}`, establishment_id: w.L1, purchased_at, received, freight: 0,
        items: [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: quantidade, item_total: total }],
        payment: { kind: "a_prazo", due_date: new Date(Date.now() + 30 * DIA).toISOString() },
      });
    };
    const { registrarPerdaAction, registrarContagemAction } = await import("@/lib/actions/emporio-estoque");

    // -------------------------------------------------------------------- 2
    await rodar("talco", async () => {
      console.log("\n2. O caso TALCO/ GEL: contei, zerou, e só depois lancei a compra de hoje (Q298)");
      const imp = await chamar(A.tok.owner, R.implantation, "POST", "emporio/stock/implantation", {
        establishment_id: A.L1, emporio_product_id: A.prodId, sealed: [], loose_qty: 5000, unit_cost: 1.28,
      });
      check("implantação de 5000 a 1,28", imp.status === 201 || imp.status === 200, `${imp.status} ${j(imp.corpo)}`);
      const perda = await registrarPerdaAction(A.db, ator, { establishment_id: A.L1, emporio_product_id: A.prodId, quantity: 1108, reason: "outro" });
      check("consumo de 1108 (o sistema acha 3892)", perda.ok, j(perda));
      const cont = await registrarContagemAction(A.db, ator, { establishment_id: A.L1, emporio_product_id: A.prodId, loose_qty: 0, reason: "acabou na prateleira" });
      check("contagem: o físico é 0", cont.ok, j(cont));

      const antesDaCompra = Date.now();
      const compra = await comprar(A, `${hojeBr()}T00:00:01-03:00`, true, 100, 235);
      check("compra de 100 a 2,35 com a data de hoje: 201", compra.status === 201 || compra.status === 200, `${compra.status} ${j(compra.corpo)}`);

      const mov = await P.stockMovement.findFirst({ where: { tenant_id: A.tenantId, movement_type: "compra" }, orderBy: { created_at: "desc" } });
      const ajuste = await P.stockMovement.findFirst({ where: { tenant_id: A.tenantId, movement_type: "ajuste" } });
      check(
        "a compra entrou no estoque DEPOIS da contagem",
        mov != null && ajuste != null && new Date(mov.occurred_at).getTime() > new Date(ajuste.occurred_at).getTime(),
        j([mov?.occurred_at, ajuste?.occurred_at]),
      );
      check("e na hora do lançamento, não à meia-noite", mov != null && new Date(mov.occurred_at).getTime() >= antesDaCompra - 1000, j(mov?.occurred_at));

      const l = await linhaEstoque(A);
      check("o estoque mostra 100 kg", l != null && n(l.total_qty) === 100, j(l?.total_qty));
      check("o custo médio é 2,35 (não 1,31)", l != null && perto(l.average_cost, 2.35, 0.0001), j(l?.average_cost));
      const p = await linhaPreco(A);
      check("a formação de preço usa 2,35, origem medio", p != null && perto(p.suggested_cost, 2.35, 0.0001) && p.suggested_cost_source === "medio", j(p));
      check("o preço de venda gravado segue 10 (nada muda sozinho)", p?.price === 10, j(p?.price));
    });

    // -------------------------------------------------------------------- 3
    await rodar("outras datas", async () => {
      console.log("\n3. Compra de ontem fica ontem; recebimento de hoje entra agora");
      const ontem = `${ontemBr()}T12:00:00-03:00`;
      const c = await comprar(A, ontem, true, 10, 30);
      check("compra de ontem: 201", c.status === 201 || c.status === 200, `${c.status} ${j(c.corpo)}`);
      const mov = await P.stockMovement.findFirst({ where: { tenant_id: A.tenantId, movement_type: "compra" }, orderBy: { created_at: "desc" } });
      check("a entrada fica com a data de ontem", mov != null && new Date(mov.occurred_at).getTime() === new Date(ontem).getTime(), j(mov?.occurred_at));

      const pend = await comprar(A, `${hojeBr()}T00:00:01-03:00`, false, 10, 40);
      check("compra de hoje ainda não recebida: 201", pend.status === 201 || pend.status === 200, `${pend.status} ${j(pend.corpo)}`);
      const id = pend.corpo?.data?.id as string;
      const antes = Date.now();
      const rec = await chamar(A.tok.owner, R.receive, "POST", `emporio/purchases/${id}/receive`, { received_at: `${hojeBr()}T00:00:01-03:00` }, id);
      check("recebimento com a data de hoje: 200", rec.status === 200 || rec.status === 201, `${rec.status} ${j(rec.corpo)}`);
      const movR = await P.stockMovement.findFirst({ where: { tenant_id: A.tenantId, purchase_id: id } });
      check("o recebimento de hoje entra na hora do lançamento", movR != null && new Date(movR.occurred_at).getTime() >= antes - 1000, j(movR?.occurred_at));
    });

    // -------------------------------------------------------------------- 4
    await rodar("um custo só", async () => {
      console.log("\n4. Um custo só nas leituras (Q299)");
      const p = await linhaPreco(A);
      for (const campo of ["last_purchase_cost", "last_purchase_on", "price_cost_basis", "cost_gap_pct"]) {
        check(`a formação de preço não traz ${campo}`, p != null && !(campo in p), j(Object.keys(p ?? {})));
      }
      check("a formação de preço traz average_cost e suggested_cost", p != null && "average_cost" in p && "suggested_cost" in p);
      const l = await linhaEstoque(A);
      for (const campo of ["last_purchase_cost", "last_purchase_on", "price_cost_basis", "cost_gap_pct"]) {
        check(`o estoque não traz ${campo}`, l != null && !(campo in l), j(Object.keys(l ?? {})));
      }
      const g = await chamar(A.tok.owner, R.loja, "GET", `emporio/establishments/${A.L1}`, undefined, A.L1);
      check("a loja não traz price_cost_basis", g.status === 200 && g.corpo?.data != null && !("price_cost_basis" in g.corpo.data), `${g.status} ${j(Object.keys(g.corpo?.data ?? {}))}`);
      const outro = await chamar(B.tok.owner, R.produto, "GET", `emporio/products/${A.prodId}`, undefined, A.prodId);
      check("o tenant B não lê o produto do A: 404", outro.status === 404, `${outro.status}`);
    });

    // -------------------------------------------------------------------- 5
    await rodar("saldo zerado", async () => {
      console.log("\n5. Saldo zerado e o formulário de compra (Q296, Q297)");
      const l0 = await linhaEstoque(A);
      check("formulário de compra: stock_balance é o saldo de agora", l0 != null && n(l0.stock_balance) === n(l0.total_qty) && n(l0.stock_balance) > 0, j(l0));
      const saldo = n(l0?.total_qty);
      const perda = await registrarPerdaAction(A.db, ator, { establishment_id: A.L1, emporio_product_id: A.prodId, quantity: saldo, reason: "outro" });
      check("saída de todo o saldo", perda.ok, j(perda));
      const l = await linhaEstoque(A);
      check("sem estoque: o custo médio fica nulo", l != null && l.average_cost == null, j(l?.average_cost));
      check("sem estoque: o custo do produto é a última compra (a recebida agora, 4,00)", l != null && perto(l.suggested_cost, 4, 0.0001) && l.suggested_cost_source === "ultima_compra", j(l));
      check("formulário de compra com saldo 0: stock_balance 0", l != null && n(l.stock_balance) === 0, j(l?.stock_balance));
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

  console.log(falhas === 0 ? "\n✅ M112 (Módulo 39, Empório): o custo único, que zera com o estoque, passou." : `\n❌ M112 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
