import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M118: Módulo 39 (Meu Empório), preço do cadastro, desconto liberado por PIN do gestor e brinde (Q327 a Q334).
 * Roda: `npm run test:m118` (precisa de Redis: o limite de PIN errado vive nele).
 *
 * Escrita da spec, sem ler a implementação. Montagem copiada da m117.
 * Seções: 1 preço do cadastro, 2 desconto na linha e no total, 3 limite da loja, 4 autorização por PIN,
 * 5 o PIN de cada gestor, 6 brinde, 7 escolhas depois da revisão, 8 isolamento.
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
console.log("🏷️ M118: Módulo 39 (Meu Empório), preço do cadastro, desconto por PIN e brinde (Q327 a Q334)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];

type Ator = { id: string; role: "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR" };
type Qual = "quilo" | "sal" | "saco" | "tranca" | "bonus";
type Mundo = {
  tenantId: string;
  db: Dado;
  owner: Ator;
  ids: { vend: string; vend2: string; g1: string; g12: string; glock: string; gsem: string; gerente: string };
  tok: { owner: string; vend: string; vend2: string; g1: string; g12: string; glock: string; gsem: string; gerente: string };
  L1: string;
  L2: string;
  reg1: string;
  reg2: string;
  cli: Dado;
  p: Record<Qual, { e: string; p: string }>;
  trancaProductId: string;
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
    data: { name: `M118 ${rotulo} ${stamp}`, document: `M118${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR", extra: Dado = {}) => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M118 ${suf}`, email: `m118-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id as string, role, email: u.email as string };
  };
  const owner = await mk("own", "OWNER");
  // O vendedor leva a chave de devolver e trocar (a troca com desconto autorizado, seção 4).
  const vend = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: ["devolver_trocar"] });
  const vend2 = await mk("vend2", "OPERADOR", { emporio_role: "vendedor", emporio_keys: [] });
  const g1 = await mk("g1", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const g12 = await mk("g12", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const glock = await mk("glock", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const gsem = await mk("gsem", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const gerente = await mk("ger", "ADMIN");

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M118 ${rotulo} Loja 1` });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M118 ${rotulo} Loja 2` });
  if (!l1.ok || !l2.ok) throw new Error(`loja: ${j(l1)} ${j(l2)}`);
  const L1 = l1.data.id as string;
  const L2 = l2.data.id as string;
  await vincularTodas(prisma as Dado, t.id, [vend.id, g1.id, glock.id, gsem.id, vend2.id], [L1]);
  await vincularTodas(prisma as Dado, t.id, [vend.id, g12.id], [L1, L2]);
  // O limite de desconto das duas lojas: 10%.
  await prisma.establishment.updateMany({ where: { id: { in: [L1, L2] } }, data: { max_discount_pct: 10 } });

  const cat = await db.productCategory.create({ data: scoped({ name: `M118 categoria ${rotulo}` }) });
  const produto = async (nome: string) => {
    const r = await Cat.criarProdutoEmporioAction(db, owner, { name: `M118 ${nome} ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    if (!r.ok) throw new Error(`produto: ${j(r)}`);
    return r.data as Dado;
  };
  const apres = async (prodId: string, name: string, base_qty = 1) => {
    const r = await Cat.criarApresentacaoAction(db, owner, prodId, { name, base_qty, is_sealed_package: false });
    if (!r.ok) throw new Error(`apresentação: ${j(r)}`);
    return r.data.id as string;
  };
  const preco = async (loja: string, presId: string, price: number) => {
    const r = await Cat.definirPrecoAction(db, owner, { establishment_id: loja, presentation_id: presId, price });
    if (!r.ok) throw new Error(`preço: ${j(r)}`);
  };
  const estoque = async (loja: string, prodId: string) => {
    const r = await Est.implantarEstoqueAction(db, owner, { establishment_id: loja, emporio_product_id: prodId, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!r.ok) throw new Error(`implantar: ${j(r)}`);
  };

  const ração = await produto("Ração");
  const quilo = await apres(ração.id, "Quilo");
  const saco = await apres(ração.id, "Saco", 25); // sem preço em nenhuma loja
  const sal = await produto("Sal");
  const salQ = await apres(sal.id, "Quilo");
  const tranca = await produto("Tranca");
  const trancaQ = await apres(tranca.id, "Tranca");
  const bonus = await apres(tranca.id, "BONUS");
  for (const loja of [L1, L2]) {
    await preco(loja, quilo, 10);
    await preco(loja, salQ, 7);
    await preco(loja, trancaQ, 10);
    await preco(loja, bonus, 0);
    for (const pr of [ração, sal, tranca]) await estoque(loja, pr.id);
  }
  await abrirTurnoDeTeste(db, owner, L1);
  await abrirTurnoDeTeste(db, owner, L2);
  const reg1 = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))?.id as string;
  const reg2 = (await db.cashRegister.findFirst({ where: { establishment_id: L2, number: 1 } }))?.id as string;

  const cli = await prisma.emporioCustomer.create({ data: { tenant_id: t.id, name: `M118 Cliente ${rotulo}`, person_kind: "pf", phone: "11999990000" } as Dado });

  const token = async (u: { email: string }) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  return {
    tenantId: t.id, db, owner, L1, L2, reg1, reg2, cli,
    ids: { vend: vend.id, vend2: vend2.id, g1: g1.id, g12: g12.id, glock: glock.id, gsem: gsem.id, gerente: gerente.id },
    tok: {
      owner: await token(owner), vend: await token(vend), vend2: await token(vend2), g1: await token(g1),
      g12: await token(g12), glock: await token(glock), gsem: await token(gsem), gerente: await token(gerente),
    },
    p: {
      quilo: { e: ração.id, p: quilo }, saco: { e: ração.id, p: saco }, sal: { e: sal.id, p: salQ },
      tranca: { e: tranca.id, p: trancaQ }, bonus: { e: tranca.id, p: bonus },
    },
    trancaProductId: tranca.id,
  };
}

const R = {
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  replace: () => import("@/app/api/v1/emporio/sales/[id]/replace/route"),
  devolver: () => import("@/app/api/v1/emporio/sales/[id]/return/route"),
  trocar: () => import("@/app/api/v1/emporio/sales/[id]/exchange/route"),
  quotes: () => import("@/app/api/v1/emporio/quotes/route"),
  autoriza: () => import("@/app/api/v1/emporio/discount-authorizations/route"),
  autorizadores: () => import("@/app/api/v1/emporio/establishments/[id]/authorizers/route"),
  meuPin: () => import("@/app/api/v1/me/emporio-pin/route"),
  apagarPin: () => import("@/app/api/v1/emporio/team/[userId]/pin/route"),
  team: () => import("@/app/api/v1/emporio/team/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(
  tok: string,
  rota: () => Promise<Dado>,
  metodo: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  corpo?: unknown,
  params?: string | Record<string, string>,
): Promise<Resp> {
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
  const props = params === undefined ? undefined : { params: Promise.resolve(typeof params === "string" ? { id: params } : params) };
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, props));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}
const erro = (r: Resp, status: number, field?: string, code?: string) =>
  r.status === status && (field === undefined || r.corpo?.error?.field === field) && (code === undefined || r.corpo?.error?.code === code);
const msg = (r: Resp) => String(r.corpo?.error?.message ?? "");
const ok = (r: Resp) => r.status >= 200 && r.status < 300;
const recusada = (r: Resp) => r.status >= 400 && r.status < 500;
const sobra = (r: Resp) => j(r.corpo?.error ?? r.corpo?.data ?? r.corpo).slice(0, 220);

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m118-${p}-${stamp}-${(seq += 1)}`;
const arred = (n: number) => Math.round(n * 100) / 100;
const perto = (a: unknown, b: number) => typeof a === "number" && Math.abs(a - b) < 0.005;

type Linha = { q: Qual; qty: number; discount_pct?: number; unit_price?: number };
const itens = (w: Mundo, ls: Linha[]) =>
  ls.map((l) => ({
    emporio_product_id: w.p[l.q].e,
    presentation_id: w.p[l.q].p,
    quantity: l.qty,
    ...(l.discount_pct === undefined ? {} : { discount_pct: l.discount_pct }),
    ...(l.unit_price === undefined ? {} : { unit_price: l.unit_price }),
  }));
const din = (amount: number) => [{ kind: "dinheiro", amount }];

type Loja = "L1" | "L2";
const vender = (w: Mundo, tok: string, ls: Linha[], pagar: number, extra: Dado = {}, loja: Loja = "L1") =>
  chamar(tok, R.sales, "POST", "emporio/sales", {
    operation_key: chave("v"),
    establishment_id: w[loja],
    cash_register_id: loja === "L1" ? w.reg1 : w.reg2,
    customer_id: w.cli.id,
    items: itens(w, ls),
    payments: pagar > 0 ? din(pagar) : [],
    ...extra,
  });
const orcar = (w: Mundo, tok: string, ls: Linha[], extra: Dado = {}) =>
  chamar(tok, R.quotes, "POST", "emporio/quotes", {
    operation_key: chave("orc"),
    establishment_id: w.L1,
    customer_id: w.cli.id,
    items: itens(w, ls),
    ...extra,
  });
const pedirAutorizacao = (w: Mundo, tok: string, lojaId: string, quem: string, pin: string, discount_pct: number) =>
  chamar(tok, R.autoriza, "POST", "emporio/discount-authorizations", { establishment_id: lojaId, authorizer_user_id: quem, pin, discount_pct });
const definirPin = (tok: string, pin: string, password = SENHA) => chamar(tok, R.meuPin, "PUT", "me/emporio-pin", { pin, password });
const lerEquipe = async (w: Mundo): Promise<Dado[]> => {
  const r = await chamar(w.tok.owner, R.team, "GET", "emporio/team");
  return Array.isArray(r.corpo?.data?.users) ? r.corpo.data.users : [];
};
const temPin = async (w: Mundo, id: string) => (await lerEquipe(w)).find((u) => u.id === id)?.has_pin;
const listaDeAutorizadores = async (w: Mundo, tok: string, loja: string) => {
  const r = await chamar(tok, R.autorizadores, "GET", `emporio/establishments/${loja}/authorizers`, undefined, loja);
  return { r, ids: (Array.isArray(r.corpo?.data) ? r.corpo.data : []).map((x: Dado) => String(x.id)).sort() as string[] };
};
const somaTotais = (v: Dado) => arred(((v?.items ?? []) as Dado[]).reduce((s, i) => s + Number(i.total), 0));


async function main() {
  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    const A = await montar("A");
    const B = await montar("B");
    const Orc = (await import("@/lib/actions/emporio-orcamentos")) as Dado;
    const Desp = (await import("@/lib/actions/emporio-despesas")) as Dado;
    const Est = (await import("@/lib/actions/emporio-estoque")) as Dado;
    const Cat = (await import("@/lib/actions/emporio-catalogo")) as Dado;

    // Preparo: cada gestor cadastra o próprio PIN (o gerente geral só na seção 5).
    const PIN = { g1: "1234", g12: "5678", glock: "4321", gerente: "2468" };
    const prep = [
      await definirPin(A.tok.g1, PIN.g1),
      await definirPin(A.tok.g12, PIN.g12),
      await definirPin(A.tok.glock, PIN.glock),
    ];
    check("preparo: os três gestores cadastram o PIN (PUT /me/emporio-pin)", prep.every(ok), prep.map((r) => `${r.status}`).join(","));

    await rodar("preço do cadastro", async () => {
      console.log("1. O preço vem do cadastro (Q327, Q328)");
      const acima = await vender(A, A.tok.vend, [{ q: "quilo", qty: 1, unit_price: 11 }], 11);
      check("venda com preço acima do cadastro (11 contra 10): 422 items 'O preço vem do cadastro'", erro(acima, 422, "items") && msg(acima).includes("O preço vem do cadastro"), `${acima.status} ${sobra(acima)}`);
      const acimaOwner = await vender(A, A.tok.owner, [{ q: "quilo", qty: 1, unit_price: 11 }], 11);
      check("nem o dono digita preço acima do cadastro", erro(acimaOwner, 422, "items") && msg(acimaOwner).includes("O preço vem do cadastro"), `${acimaOwner.status} ${sobra(acimaOwner)}`);
      const igual = await vender(A, A.tok.vend, [{ q: "quilo", qty: 1, unit_price: 10 }], 10);
      check("preço igual ao cadastrado passa (201)", igual.status === 201, `${igual.status} ${sobra(igual)}`);
      check("e grava 10 na linha", igual.corpo?.data?.items?.[0]?.unit_price === 10, j(igual.corpo?.data?.items?.[0]));

      const semPreco = await vender(A, A.tok.vend, [{ q: "saco", qty: 1 }], 10);
      check("apresentação sem preço na loja: 422 items 'Cadastre o preço'", erro(semPreco, 422, "items") && msg(semPreco).includes("Cadastre o preço"), `${semPreco.status} ${sobra(semPreco)}`);
      const semPrecoDigitado = await vender(A, A.tok.owner, [{ q: "saco", qty: 1, unit_price: 8 }], 8);
      check("preço digitado não salva a apresentação sem preço (dono): continua 422 'Cadastre o preço'", erro(semPrecoDigitado, 422, "items") && msg(semPrecoDigitado).includes("Cadastre o preço"), `${semPrecoDigitado.status} ${sobra(semPrecoDigitado)}`);

      const oAcima = await orcar(A, A.tok.vend, [{ q: "quilo", qty: 1, unit_price: 11 }]);
      check("orçamento com preço acima: 422 items 'O preço vem do cadastro'", erro(oAcima, 422, "items") && msg(oAcima).includes("O preço vem do cadastro"), `${oAcima.status} ${sobra(oAcima)}`);
      const oSem = await orcar(A, A.tok.vend, [{ q: "saco", qty: 1 }]);
      check("orçamento sem preço na loja: 422 items 'Cadastre o preço'", erro(oSem, 422, "items") && msg(oSem).includes("Cadastre o preço"), `${oSem.status} ${sobra(oSem)}`);
      const oIgual = await orcar(A, A.tok.vend, [{ q: "quilo", qty: 1, unit_price: 10 }]);
      check("orçamento com preço igual passa (201)", oIgual.status === 201, `${oIgual.status} ${sobra(oIgual)}`);

      const base = await vender(A, A.tok.owner, [{ q: "quilo", qty: 3 }], 30);
      const itemId = String(base.corpo?.data?.items?.[0]?.id ?? "");
      const trocar = (ls: Linha[]) =>
        chamar(A.tok.owner, R.trocar, "POST", `emporio/sales/${base.corpo?.data?.id}/exchange`, {
          operation_key: chave("tr"),
          cash_register_id: A.reg1,
          items_devolvidos: [{ sale_item_id: itemId, quantity: 1 }],
          venda: { customer_id: A.cli.id, items: itens(A, ls), payments: [] },
        }, String(base.corpo?.data?.id));
      const tAcima = await trocar([{ q: "quilo", qty: 1, unit_price: 11 }]);
      check("troca com preço acima: 422 'O preço vem do cadastro'", tAcima.status === 422 && msg(tAcima).includes("O preço vem do cadastro"), `${tAcima.status} ${sobra(tAcima)}`);
      const tSem = await trocar([{ q: "saco", qty: 1 }]);
      check("troca sem preço na loja: 422 'Cadastre o preço'", tSem.status === 422 && msg(tSem).includes("Cadastre o preço"), `${tSem.status} ${sobra(tSem)}`);
      const tIgual = await trocar([{ q: "quilo", qty: 1, unit_price: 10 }]);
      check("troca com preço igual passa (201)", tIgual.status === 201, `${tIgual.status} ${sobra(tIgual)}`);
    });

    await rodar("desconto na linha e no total", async () => {
      console.log("\n2. Desconto na linha (%) e no total (R$) (Q329)");
      const a = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 5 }], 95);
      const ai = a.corpo?.data?.items?.[0];
      check("5% na linha (10 x 10): 201", a.status === 201, `${a.status} ${sobra(a)}`);
      check("o unit_price gravado é o preço com o % (9,5) e o total da linha 95", perto(ai?.unit_price, 9.5) && perto(ai?.total, 95), j(ai));
      check("net_amount 95, discount_amount 5, sem desconto no total", perto(a.corpo?.data?.net_amount, 95) && perto(a.corpo?.data?.discount_amount, 5) && perto(a.corpo?.data?.order_discount_amount, 0), j(a.corpo?.data));

      const b = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10 }], 96, { order_discount_amount: 4 });
      check("R$ 4 no total: 201", b.status === 201, `${b.status} ${sobra(b)}`);
      check("net_amount 96 e order_discount_amount 4 devolvido", perto(b.corpo?.data?.net_amount, 96) && perto(b.corpo?.data?.order_discount_amount, 4), j(b.corpo?.data));
      check("o discount_amount inclui o do total (4)", perto(b.corpo?.data?.discount_amount, 4), j(b.corpo?.data?.discount_amount));
      check("a soma dos total dos itens fecha o net_amount (rateio)", perto(somaTotais(b.corpo?.data), 96), String(somaTotais(b.corpo?.data)));
      const gravada = await P.emporioSale.findFirst({ where: { id: b.corpo?.data?.id } });
      check("o order_discount_amount fica gravado na venda (4)", Number(gravada?.order_discount_amount) === 4, String(gravada?.order_discount_amount));

      const c = await vender(A, A.tok.vend, [{ q: "quilo", qty: 3 }, { q: "sal", qty: 1 }], 36, { order_discount_amount: 1 });
      check("rateio entre duas linhas (R$ 1 sobre 30 e 7): 201", c.status === 201, `${c.status} ${sobra(c)}`);
      check("a soma dos total dos itens fecha o net_amount (36)", perto(c.corpo?.data?.net_amount, 36) && perto(somaTotais(c.corpo?.data), 36), `${c.corpo?.data?.net_amount} ${somaTotais(c.corpo?.data)}`);
      const [ci1, ci2] = c.corpo?.data?.items ?? [];
      check("cada linha perde algo e nenhuma fica negativa", ci1 && ci2 && Number(ci1.total) < 30 && Number(ci2.total) < 7 && Number(ci1.total) > 0 && Number(ci2.total) > 0, j([ci1?.total, ci2?.total]));

      const d = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 5 }], 93, { order_discount_amount: 2 });
      check("5% na linha mais R$ 2 no total: net 93, discount_amount 7, order_discount_amount 2", d.status === 201 && perto(d.corpo?.data?.net_amount, 93) && perto(d.corpo?.data?.discount_amount, 7) && perto(d.corpo?.data?.order_discount_amount, 2), `${d.status} ${j(d.corpo?.data ?? d.corpo?.error)}`);

      const f = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, unit_price: 9.5 }], 95);
      check("unit_price abaixo do cadastrado (forma antiga) ainda vale como desconto: 9,5 e total 95", f.status === 201 && perto(f.corpo?.data?.items?.[0]?.unit_price, 9.5) && perto(f.corpo?.data?.items?.[0]?.total, 95), `${f.status} ${sobra(f)}`);

      const alto = await vender(A, A.tok.owner, [{ q: "quilo", qty: 1, discount_pct: 101 }], 1);
      check("discount_pct 101: recusado (4xx)", recusada(alto), `${alto.status} ${sobra(alto)}`);
      const neg = await vender(A, A.tok.owner, [{ q: "quilo", qty: 1, discount_pct: -1 }], 10);
      check("discount_pct negativo: recusado (4xx)", recusada(neg), `${neg.status} ${sobra(neg)}`);

      const q = await orcar(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 5 }], { order_discount_amount: 2 });
      check("orçamento com 5% na linha e R$ 2 no total: 201", q.status === 201, `${q.status} ${sobra(q)}`);
      check("a visão do orçamento traz net 93, order_discount_amount 2 e discount_amount 7", perto(q.corpo?.data?.net_amount, 93) && perto(q.corpo?.data?.order_discount_amount, 2) && perto(q.corpo?.data?.discount_amount, 7), j(q.corpo?.data));
      check("a soma dos total dos itens do orçamento fecha o net_amount", perto(somaTotais(q.corpo?.data), 93), String(somaTotais(q.corpo?.data)));
    });

    await rodar("limite da loja", async () => {
      console.log("\n3. O limite da loja (10%) vale sobre os dois descontos somados (Q330)");
      const noLimite = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 6 }], 90, { order_discount_amount: 4 });
      check("6% na linha mais R$ 4 no total (10% no total): passa sem autorização", noLimite.status === 201, `${noLimite.status} ${sobra(noLimite)}`);
      const abaixo = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 5 }], 91, { order_discount_amount: 4 });
      check("5% mais R$ 4 (9%): passa sem autorização", abaixo.status === 201, `${abaixo.status} ${sobra(abaixo)}`);
      const soma = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 6 }], 88, { order_discount_amount: 6 });
      check("6% na linha mais R$ 6 (12%, cada um abaixo do limite): 403 DISCOUNT_ABOVE_LIMIT em items", erro(soma, 403, "items", "DISCOUNT_ABOVE_LIMIT"), `${soma.status} ${sobra(soma)}`);
      check("a frase de hoje, terminando em 'Peça ao gestor da loja.'", msg(soma).endsWith("Peça ao gestor da loja."), msg(soma));
      const linha = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 11 }], 89);
      check("11% só na linha: 403 DISCOUNT_ABOVE_LIMIT", erro(linha, 403, "items", "DISCOUNT_ABOVE_LIMIT"), `${linha.status} ${sobra(linha)}`);
      const total = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10 }], 88, { order_discount_amount: 12 });
      check("R$ 12 só no total (12%): 403 DISCOUNT_ABOVE_LIMIT", erro(total, 403, "items", "DISCOUNT_ABOVE_LIMIT"), `${total.status} ${sobra(total)}`);
      const orc = await orcar(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 6 }], { order_discount_amount: 6 });
      check("o orçamento segue o mesmo limite (12%): 403 DISCOUNT_ABOVE_LIMIT", erro(orc, 403, "items", "DISCOUNT_ABOVE_LIMIT"), `${orc.status} ${sobra(orc)}`);
      const cem = await vender(A, A.tok.vend, [{ q: "quilo", qty: 1, discount_pct: 100 }, { q: "sal", qty: 3 }], 21);
      check("dar de graça um item com preço cheio (100%) passa do limite: 403 sem autorização", erro(cem, 403, "items", "DISCOUNT_ABOVE_LIMIT"), `${cem.status} ${sobra(cem)}`);
      const nada = await P.emporioSale.count({ where: { tenant_id: A.tenantId, discount_amount: { gt: 10 } } });
      check("nenhuma das recusas gravou venda acima do limite", nada === 0, String(nada));
    });

    let authG1 = "";
    await rodar("autorização por PIN", async () => {
      console.log("\n4. A autorização do gestor por PIN (Q331 a Q333)");
      const l = await listaDeAutorizadores(A, A.tok.vend, A.L1);
      const esperados = [A.ids.g1, A.ids.g12, A.ids.glock].sort();
      check("a lista da Loja 1 traz só os gestores com PIN (g1, g12, glock)", l.r.status === 200 && j(l.ids) === j(esperados), `${l.r.status} ${j(l.ids)}`);
      check("sem o gestor sem PIN, o dono, o gerente e os vendedores", !l.ids.includes(A.ids.gsem) && !l.ids.includes(A.owner.id) && !l.ids.includes(A.ids.gerente) && !l.ids.includes(A.ids.vend), j(l.ids));
      check("cada item traz id e name", (l.r.corpo?.data ?? []).every((x: Dado) => typeof x.id === "string" && typeof x.name === "string"), j(l.r.corpo?.data));
      const l2 = await listaDeAutorizadores(A, A.tok.vend, A.L2);
      check("a lista da Loja 2 traz só quem é gestor dela com PIN (g12)", j(l2.ids) === j([A.ids.g12]), j(l2.ids));
      const semAcesso = await listaDeAutorizadores(A, A.tok.vend2, A.L2);
      check("quem não vende na Loja 2 não lê a lista dela (4xx)", recusada(semAcesso.r), `${semAcesso.r.status}`);

      const r = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g1, PIN.g1, 15);
      authG1 = String(r.corpo?.data?.authorization ?? "");
      check("PIN certo: devolve a autorização (200 ou 201)", ok(r) && authG1.length > 10, `${r.status} ${sobra(r)}`);
      check("a resposta traz discount_pct 15 e o gestor (id e nome)", r.corpo?.data?.discount_pct === 15 && r.corpo?.data?.authorizer?.id === A.ids.g1 && typeof r.corpo?.data?.authorizer?.name === "string", j(r.corpo?.data));
      const falta = new Date(String(r.corpo?.data?.expires_at)).getTime() - Date.now();
      check("expires_at fica uns 15 minutos adiante", falta > 13 * 60_000 && falta <= 15 * 60_000 + 5000, String(falta));

      const v1 = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 15 }], 85, { discount_authorization: authG1 });
      check("venda de 15% (limite 10%) com a autorização: 201", v1.status === 201, `${v1.status} ${sobra(v1)}`);
      check("grava quem autorizou (g1)", v1.corpo?.data?.discount_authorized_by_user_id === A.ids.g1, String(v1.corpo?.data?.discount_authorized_by_user_id));
      const v2 = await vender(A, A.tok.vend, [{ q: "quilo", qty: 5, discount_pct: 15 }], 42.5, { discount_authorization: authG1 });
      check("a mesma autorização vale para outra venda nos 15 minutos", v2.status === 201, `${v2.status} ${sobra(v2)}`);
      const v3 = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 10 }], 85, { order_discount_amount: 5, discount_authorization: authG1 });
      check("a autorização cobre os dois descontos somados (10% na linha mais R$ 5 = 15%)", v3.status === 201, `${v3.status} ${sobra(v3)}`);
      const o1 = await orcar(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 15 }], { discount_authorization: authG1 });
      check("o orçamento aceita a autorização e grava quem autorizou", o1.status === 201 && o1.corpo?.data?.discount_authorized_by_user_id === A.ids.g1, `${o1.status} ${sobra(o1)}`);

      const maior = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 20 }], 80, { discount_authorization: authG1 });
      check("desconto maior que o autorizado (20% contra 15%): 403 DISCOUNT_AUTHORIZATION_INVALID em discount_authorization", erro(maior, 403, "discount_authorization", "DISCOUNT_AUTHORIZATION_INVALID"), `${maior.status} ${sobra(maior)}`);
      const outroUsuario = await vender(A, A.tok.vend2, [{ q: "quilo", qty: 10, discount_pct: 15 }], 85, { discount_authorization: authG1 });
      check("autorização de outro usuário (vend2 usa a do vend): 403 DISCOUNT_AUTHORIZATION_INVALID", erro(outroUsuario, 403, "discount_authorization", "DISCOUNT_AUTHORIZATION_INVALID"), `${outroUsuario.status} ${sobra(outroUsuario)}`);
      const trocadaCh = (authG1[0] === "A" ? "B" : "A") + authG1.slice(1);
      const adulterada = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 15 }], 85, { discount_authorization: trocadaCh });
      check("autorização adulterada: 403 DISCOUNT_AUTHORIZATION_INVALID", erro(adulterada, 403, "discount_authorization", "DISCOUNT_AUTHORIZATION_INVALID"), `${adulterada.status} ${sobra(adulterada)}`);
      const lixo = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 15 }], 85, { discount_authorization: "isto-nao-e-uma-autorizacao" });
      check("texto qualquer no lugar da autorização: 403 DISCOUNT_AUTHORIZATION_INVALID", erro(lixo, 403, "discount_authorization", "DISCOUNT_AUTHORIZATION_INVALID"), `${lixo.status} ${sobra(lixo)}`);

      const rL2 = await pedirAutorizacao(A, A.tok.vend, A.L2, A.ids.g12, PIN.g12, 15);
      const authL2 = String(rL2.corpo?.data?.authorization ?? "");
      check("a Loja 2 emite a própria autorização (g12, PIN certo)", ok(rL2) && authL2.length > 10, `${rL2.status} ${sobra(rL2)}`);
      const outraLoja = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 15 }], 85, { discount_authorization: authL2 });
      check("autorização de outra loja (da 2 na 1): 403 DISCOUNT_AUTHORIZATION_INVALID", erro(outraLoja, 403, "discount_authorization", "DISCOUNT_AUTHORIZATION_INVALID"), `${outraLoja.status} ${sobra(outraLoja)}`);

      // Vencida: assinada 16 minutos no passado (adiantar o relógio do processo derrubava a sessão: 401).
      const { assinarAutorizacao } = await import("@/lib/emporio/autorizacao-desconto");
      const authVencida = assinarAutorizacao(
        { establishment_id: A.L1, authorizer_user_id: A.ids.g1, requester_user_id: A.ids.vend, max_pct: 15 },
        Date.now() - 16 * 60_000,
      );
      const vencida = await vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 15 }], 85, { discount_authorization: authVencida });
      check("autorização vencida (16 minutos depois): 403 DISCOUNT_AUTHORIZATION_INVALID", erro(vencida, 403, "discount_authorization", "DISCOUNT_AUTHORIZATION_INVALID"), `${vencida.status} ${sobra(vencida)}`);

      const errado = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g12, "0000", 15);
      check("PIN errado: 422 INVALID_PIN em pin", erro(errado, 422, "pin", "INVALID_PIN"), `${errado.status} ${sobra(errado)}`);
      check("e não devolve autorização", errado.corpo?.data?.authorization === undefined, j(errado.corpo));
      const naoGestor = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.vend2, "1234", 15);
      check("quem não é gestor da loja (um vendedor) não autoriza: 422 em authorizer_user_id", erro(naoGestor, 422, "authorizer_user_id"), `${naoGestor.status} ${sobra(naoGestor)}`);
      const semPin = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.gsem, "1234", 15);
      check("gestor sem PIN cadastrado: 422 em authorizer_user_id", erro(semPin, 422, "authorizer_user_id"), `${semPin.status} ${sobra(semPin)}`);
      const lojaAlheia = await pedirAutorizacao(A, A.tok.vend, A.L2, A.ids.g1, PIN.g1, 15);
      check("gestor que não é da Loja 2 não autoriza nela: 422 em authorizer_user_id", erro(lojaAlheia, 422, "authorizer_user_id"), `${lojaAlheia.status} ${sobra(lojaAlheia)}`);

      const erros: Resp[] = [];
      for (let i = 0; i < 5; i += 1) erros.push(await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.glock, `00${i}0`, 15));
      // Cinco PINs errados travam: os cinco recebem "PIN incorreto" e a tentativa seguinte já é recusada.
      check("cinco PINs errados seguidos do mesmo gestor: 422 INVALID_PIN cada um", erros.every((e) => erro(e, 422, "pin", "INVALID_PIN")), erros.map((e) => e.status).join(","));
      const certoTravado = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.glock, PIN.glock, 15);
      check("travado: até o PIN certo recebe 429 PIN_LOCKED", erro(certoTravado, 429, "pin", "PIN_LOCKED"), `${certoTravado.status} ${sobra(certoTravado)}`);
      const outroGestorLivre = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g1, PIN.g1, 12);
      check("a trava é por gestor: outro gestor segue autorizando", ok(outroGestorLivre), `${outroGestorLivre.status} ${sobra(outroGestorLivre)}`);

      const gestor = await vender(A, A.tok.g1, [{ q: "quilo", qty: 10, discount_pct: 15 }], 85);
      check("gestor logado vende acima do limite sem PIN (201)", gestor.status === 201, `${gestor.status} ${sobra(gestor)}`);
      check("e fica como quem autorizou", gestor.corpo?.data?.discount_authorized_by_user_id === A.ids.g1, String(gestor.corpo?.data?.discount_authorized_by_user_id));
      const dono = await vender(A, A.tok.owner, [{ q: "quilo", qty: 10, discount_pct: 15 }], 85);
      check("o dono também passa do limite sem PIN, como autorizador", dono.status === 201 && dono.corpo?.data?.discount_authorized_by_user_id === A.owner.id, `${dono.status} ${sobra(dono)}`);

      // Troca com desconto: a venda original é do dono, quem troca é o vendedor (tem a chave devolver_trocar).
      const base = await vender(A, A.tok.owner, [{ q: "quilo", qty: 2 }], 20);
      const itemId = String(base.corpo?.data?.items?.[0]?.id ?? "");
      const trocar = (extra: Dado) =>
        chamar(A.tok.vend, R.trocar, "POST", `emporio/sales/${base.corpo?.data?.id}/exchange`, {
          operation_key: chave("tr"),
          cash_register_id: A.reg1,
          items_devolvidos: [{ sale_item_id: itemId, quantity: 1 }],
          venda: { customer_id: A.cli.id, items: itens(A, [{ q: "quilo", qty: 2, discount_pct: 15 }]), payments: din(7), ...extra },
        }, String(base.corpo?.data?.id));
      const tSem = await trocar({});
      check("troca com 15% sem autorização (vendedor): 403 DISCOUNT_ABOVE_LIMIT", erro(tSem, 403, undefined, "DISCOUNT_ABOVE_LIMIT"), `${tSem.status} ${sobra(tSem)}`);
      const tCom = await trocar({ discount_authorization: authG1 });
      check("troca com 15% e a autorização: 201", tCom.status === 201, `${tCom.status} ${sobra(tCom)}`);
    });

    await rodar("o PIN de cada gestor", async () => {
      console.log("\n5. Cadastrar, trocar e apagar o PIN (Q332)");
      const errada = await definirPin(A.tok.gerente, "2468", "senha-errada");
      check("senha de login errada: recusa (4xx)", recusada(errada), `${errada.status} ${sobra(errada)}`);
      check("e o PIN não foi gravado (has_pin false)", (await temPin(A, A.ids.gerente)) === false, String(await temPin(A, A.ids.gerente)));
      for (const ruim of ["12", "12345678", "12ab", "1 2 3 4"]) {
        const r = await definirPin(A.tok.gerente, ruim);
        check(`PIN '${ruim}' (fora de 4 a 6 números): 422 em pin`, erro(r, 422, "pin"), `${r.status} ${sobra(r)}`);
      }
      const vendedor = await definirPin(A.tok.vend, "2468");
      check("vendedor (não pode autorizar em loja nenhuma) não cadastra PIN: 403", vendedor.status === 403, `${vendedor.status} ${sobra(vendedor)}`);

      const certo = await definirPin(A.tok.gerente, PIN.gerente);
      check("o gerente geral cadastra o próprio PIN com a senha certa", ok(certo), `${certo.status} ${sobra(certo)}`);
      check("a Equipe mostra has_pin true", (await temPin(A, A.ids.gerente)) === true, String(await temPin(A, A.ids.gerente)));
      const equipe = await chamar(A.tok.owner, R.team, "GET", "emporio/team");
      const texto = j(equipe.corpo);
      check("e nenhuma resposta da Equipe traz o hash do PIN", !texto.includes("emporio_auth_pin_hash") && !/\$2[aby]\$/.test(texto), texto.slice(0, 80));
      const naLista = await listaDeAutorizadores(A, A.tok.vend, A.L1);
      check("o gerente geral com PIN passa a constar na lista de autorizadores", naLista.ids.includes(A.ids.gerente), j(naLista.ids));
      const trocou = await definirPin(A.tok.g1, "654321");
      check("trocar o próprio PIN (6 números) funciona", ok(trocou), `${trocou.status} ${sobra(trocou)}`);
      const velho = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g1, PIN.g1, 12);
      check("depois da troca o PIN antigo não vale: 422 INVALID_PIN", erro(velho, 422, "pin", "INVALID_PIN"), `${velho.status} ${sobra(velho)}`);
      const novo = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g1, "654321", 12);
      check("e o novo vale", ok(novo), `${novo.status} ${sobra(novo)}`);
      PIN.g1 = "654321";

      const donoApaga = await chamar(A.tok.owner, R.apagarPin, "DELETE", `emporio/team/${A.ids.g1}/pin`, undefined, { userId: A.ids.g1 });
      check("o dono apaga o PIN do gestor", ok(donoApaga), `${donoApaga.status} ${sobra(donoApaga)}`);
      check("has_pin volta a false", (await temPin(A, A.ids.g1)) === false, String(await temPin(A, A.ids.g1)));
      const semMais = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g1, PIN.g1, 12);
      check("sem PIN, o gestor não autoriza mais: 422 em authorizer_user_id", erro(semMais, 422, "authorizer_user_id"), `${semMais.status} ${sobra(semMais)}`);
      const refaz = await definirPin(A.tok.g1, "1234");
      PIN.g1 = "1234";
      check("o gestor cadastra outro PIN", ok(refaz) && (await temPin(A, A.ids.g1)) === true, `${refaz.status}`);

      const gestorApaga = await chamar(A.tok.g1, R.apagarPin, "DELETE", `emporio/team/${A.ids.g12}/pin`, undefined, { userId: A.ids.g12 });
      check("um gestor não apaga o PIN de outro: 403", gestorApaga.status === 403, `${gestorApaga.status} ${sobra(gestorApaga)}`);
      const vendApaga = await chamar(A.tok.vend, R.apagarPin, "DELETE", `emporio/team/${A.ids.g12}/pin`, undefined, { userId: A.ids.g12 });
      check("um vendedor não apaga PIN: 403", vendApaga.status === 403, `${vendApaga.status} ${sobra(vendApaga)}`);
      check("o PIN do g12 segue valendo depois dessas tentativas", (await temPin(A, A.ids.g12)) === true);
      const gerenteApaga = await chamar(A.tok.gerente, R.apagarPin, "DELETE", `emporio/team/${A.ids.g12}/pin`, undefined, { userId: A.ids.g12 });
      check("o gerente geral apaga o PIN de alguém", ok(gerenteApaga) && (await temPin(A, A.ids.g12)) === false, `${gerenteApaga.status} ${sobra(gerenteApaga)}`);
      await definirPin(A.tok.g12, PIN.g12);
    });

    await rodar("brinde", async () => {
      console.log("\n6. Brinde: a apresentação a R$ 0 acompanha uma venda (Q334)");
      const ruleTranca = await Desp.criarRegraVariavelAction(A.db, A.owner, { establishment_id: A.L1, name: "M118 por unidade da tranca", kind: "por_unidade", value: 2, presentation_id: A.p.tranca.p });
      const ruleBonus = await Desp.criarRegraVariavelAction(A.db, A.owner, { establishment_id: A.L1, name: "M118 por unidade do brinde", kind: "por_unidade", value: 1.5, presentation_id: A.p.bonus.p });
      check("as duas regras por unidade nascem (a da tranca é o controle)", ruleTranca.ok === true && ruleBonus.ok === true, j([ruleTranca, ruleBonus]));
      const saldo = async () => {
        const r = await Est.saldoDaLojaAction(A.db, A.owner, A.L1);
        return Number((r.data as Dado[]).find((l) => l.emporio_product_id === A.trancaProductId)?.total_qty);
      };
      const antes = await saldo();
      const v = await vender(A, A.tok.vend, [{ q: "tranca", qty: 2 }, { q: "bonus", qty: 1 }], 20);
      check("duas trancas pagas e um BONUS a R$ 0: 201 sem desconto nem PIN", v.status === 201, `${v.status} ${sobra(v)}`);
      const bi = (v.corpo?.data?.items ?? []).find((i: Dado) => i.presentation_id === A.p.bonus.p);
      check("a linha do brinde tem preço 0 e total 0", bi && Number(bi.unit_price) === 0 && Number(bi.total) === 0, j(bi));
      check("o net_amount só soma o pago (20) e não há desconto", perto(v.corpo?.data?.net_amount, 20) && perto(v.corpo?.data?.discount_amount, 0), j([v.corpo?.data?.net_amount, v.corpo?.data?.discount_amount]));
      check("o estoque do brinde baixou (3 unidades no total)", (await saldo()) === antes - 3, `${antes} -> ${await saldo()}`);
      check("o custo do brinde entra (unit_cost preenchido e maior que zero)", bi && bi.unit_cost !== null && Number(bi.unit_cost) > 0, j(bi?.unit_cost));
      const despesas = (await P.saleVariableExpense.findMany({ where: { sale_id: v.corpo?.data?.id } })) as Dado[];
      check("controle: a regra por unidade da tranca gerou despesa de R$ 4 (2 unidades x R$ 2)", despesas.some((d) => d.rule_id === ruleTranca.data?.id && Number(d.amount) === 4), j(despesas.map((d) => [d.rule_id, String(d.amount)])));
      check("o 'Vendeu, Pagou' por unidade não cobra o brinde (nenhuma despesa da regra do BONUS)", despesas.every((d) => d.rule_id !== ruleBonus.data?.id), j(despesas.map((d) => [d.rule_id, String(d.amount)])));

      const so = await vender(A, A.tok.owner, [{ q: "bonus", qty: 1 }], 0);
      check("venda só com brinde: 422 items 'Um brinde acompanha uma venda'", erro(so, 422, "items") && msg(so).includes("Um brinde acompanha uma venda"), `${so.status} ${sobra(so)}`);
      const soOrc = await orcar(A, A.tok.vend, [{ q: "bonus", qty: 2 }]);
      check("orçamento só com brinde: 422 items 'Um brinde acompanha uma venda'", erro(soOrc, 422, "items") && msg(soOrc).includes("Um brinde acompanha uma venda"), `${soOrc.status} ${sobra(soOrc)}`);
      const soCem = await vender(A, A.tok.owner, [{ q: "quilo", qty: 1, discount_pct: 100 }], 0);
      check("só uma linha com 100% de desconto (nada a pagar): 422 'Um brinde acompanha uma venda'", erro(soCem, 422, "items") && msg(soCem).includes("Um brinde acompanha uma venda"), `${soCem.status} ${sobra(soCem)}`);
      const orcOk = await orcar(A, A.tok.vend, [{ q: "tranca", qty: 1 }, { q: "bonus", qty: 1 }]);
      check("orçamento com produto pago e brinde: 201", orcOk.status === 201, `${orcOk.status} ${sobra(orcOk)}`);
    });

    await rodar("escolhas depois da revisão", async () => {
      console.log("\n7. Escolhas depois da revisão de builder");
      const o = await Orc.salvarOrcamentoAction(A.db, A.owner, {
        operation_key: chave("orc"), establishment_id: A.L1, customer_id: A.cli.id, items: itens(A, [{ q: "quilo", qty: 10 }]), order_discount_amount: 4,
      });
      check("orçamento com R$ 4 no total (net 96)", o.ok === true && perto(o.data?.net_amount, 96) && perto(o.data?.order_discount_amount, 4), j(o.data ?? o));
      const f = await chamar(A.tok.owner, R.sales, "POST", "emporio/sales", {
        operation_key: chave("v"), establishment_id: A.L1, cash_register_id: A.reg1, customer_id: A.cli.id,
        quote_id: o.data?.id, items: itens(A, [{ q: "quilo", qty: 10 }]), payments: din(96),
      });
      check("faturar dentro da validade sem mandar order_discount_amount: a venda herda os R$ 4", f.status === 201 && perto(f.corpo?.data?.order_discount_amount, 4) && perto(f.corpo?.data?.net_amount, 96), `${f.status} ${j(f.corpo?.data ?? f.corpo?.error)}`);

      const o2 = await Orc.salvarOrcamentoAction(A.db, A.owner, {
        operation_key: chave("orc"), establishment_id: A.L1, customer_id: A.cli.id, items: itens(A, [{ q: "quilo", qty: 10 }]), order_discount_amount: 4,
      });
      await P.emporioQuote.update({ where: { id: o2.data?.id }, data: { valid_until: new Date(Date.now() - 3 * DIA) } });
      const f2 = await chamar(A.tok.owner, R.sales, "POST", "emporio/sales", {
        operation_key: chave("v"), establishment_id: A.L1, cash_register_id: A.reg1, customer_id: A.cli.id,
        quote_id: o2.data?.id, items: itens(A, [{ q: "quilo", qty: 10 }]), payments: din(100),
      });
      check("orçamento vencido não herda o desconto no total (net 100, order_discount_amount 0)", f2.status === 201 && perto(f2.corpo?.data?.order_discount_amount, 0) && perto(f2.corpo?.data?.net_amount, 100), `${f2.status} ${j(f2.corpo?.data ?? f2.corpo?.error)}`);

      // Editar mantendo o preço antigo depois de o cadastro baixar.
      const s = await vender(A, A.tok.owner, [{ q: "quilo", qty: 5 }], 50);
      const baixar = (price: number) => Cat.definirPrecoAction(A.db, A.owner, { establishment_id: A.L1, presentation_id: A.p.quilo.p, price });
      try {
        await baixar(8);
        const corpo = (ls: Linha[], pagar: number) => ({ operation_key: chave("ed"), customer_id: A.cli.id, items: itens(A, ls), payments: din(pagar) });
        const nova = await chamar(A.tok.owner, R.replace, "POST", `emporio/sales/${s.corpo?.data?.id}/replace`, corpo([{ q: "quilo", qty: 5, unit_price: 10 }, { q: "sal", qty: 1, unit_price: 9 }], 59), String(s.corpo?.data?.id));
        check("controle: linha NOVA com preço acima do cadastro (sal a 9, cadastro 7) segue recusada: 422 'O preço vem do cadastro'", erro(nova, 422, "items") && msg(nova).includes("O preço vem do cadastro"), `${nova.status} ${sobra(nova)}`);
        const mesma = await chamar(A.tok.owner, R.replace, "POST", `emporio/sales/${s.corpo?.data?.id}/replace`, corpo([{ q: "quilo", qty: 6, unit_price: 10 }], 60), String(s.corpo?.data?.id));
        check("a linha com o mesmo preço da venda original (10, cadastro agora 8) passa na edição, com outra quantidade", ok(mesma), `${mesma.status} ${sobra(mesma)}`);
        check("e a nova venda guarda o preço 10 e o total 60", perto(mesma.corpo?.data?.items?.[0]?.unit_price, 10) && perto(mesma.corpo?.data?.net_amount, 60), j(mesma.corpo?.data?.items?.[0]));
      } finally {
        await baixar(10);
      }

      // Devolução proporcional ao total do item.
      const d = await vender(A, A.tok.owner, [{ q: "quilo", qty: 10 }], 80, { order_discount_amount: 20 });
      check("venda de 10 quilos com R$ 20 no total (dono): net 80", d.status === 201 && perto(d.corpo?.data?.net_amount, 80), `${d.status} ${sobra(d)}`);
      const dev = await chamar(A.tok.owner, R.devolver, "POST", `emporio/sales/${d.corpo?.data?.id}/return`, {
        operation_key: chave("dev"), refund_kind: "dinheiro", cash_register_id: A.reg1,
        items: [{ sale_item_id: d.corpo?.data?.items?.[0]?.id, quantity: 5 }],
      }, String(d.corpo?.data?.id));
      check("devolver metade reembolsa R$ 40 (proporcional ao total do item), não R$ 50", ok(dev) && perto(dev.corpo?.data?.amount, 40), `${dev.status} ${j(dev.corpo?.data?.amount ?? dev.corpo?.error)}`);
    });

    await rodar("correções do juiz", async () => {
      console.log("\n7b. Correções do juiz: trava atômica, % herdado do orçamento, Histórico e PIN trocado");
      const { resetLoginRateLimit } = await import("@/lib/rate-limit");

      // 1. A trava de cinco PINs errados não se contorna com pedidos em paralelo.
      await resetLoginRateLimit("emporio-pin", A.ids.g12);
      const rajada = await Promise.all(
        Array.from({ length: 10 }, (_, i) => pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g12, `99${i}1`, 15)),
      );
      const n422 = rajada.filter((r) => r.status === 422).length;
      const n429 = rajada.filter((r) => r.status === 429).length;
      check("10 PINs errados em paralelo: no máximo 5 recebem 422 e o resto 429", n422 <= 5 && n429 >= 5 && n422 + n429 === 10, `422=${n422} 429=${n429}`);
      check("os 429 são PIN_LOCKED em pin", rajada.filter((r) => r.status === 429).every((r) => erro(r, 429, "pin", "PIN_LOCKED")), j(rajada.map((r) => r.status)));
      const certoDepois = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g12, PIN.g12, 15);
      check("o PIN certo logo depois também recebe 429", erro(certoDepois, 429, "pin", "PIN_LOCKED") && certoDepois.corpo?.data?.authorization === undefined, `${certoDepois.status} ${sobra(certoDepois)}`);
      await resetLoginRateLimit("emporio-pin", A.ids.g12);
      const liberado = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g12, PIN.g12, 15);
      check("zerada a trava, o PIN certo volta a valer", ok(liberado), `${liberado.status} ${sobra(liberado)}`);

      // O mesmo na senha de login que protege o cadastro do PIN.
      await resetLoginRateLimit("emporio-pin-senha", A.ids.g12);
      const rajadaSenha = await Promise.all(Array.from({ length: 10 }, (_, i) => definirPin(A.tok.g12, "5678", `errada-${i}`)));
      const s422 = rajadaSenha.filter((r) => r.status === 422).length;
      const s429 = rajadaSenha.filter((r) => r.status === 429).length;
      check("10 senhas erradas em paralelo ao definir o PIN: no máximo 5 recebem 422 e o resto 429", s422 <= 5 && s429 >= 5 && s422 + s429 === 10, `422=${s422} 429=${s429}`);
      const senhaCerta = await definirPin(A.tok.g12, "5678");
      check("a senha certa logo depois também recebe 429", senhaCerta.status === 429, `${senhaCerta.status} ${sobra(senhaCerta)}`);
      await resetLoginRateLimit("emporio-pin-senha", A.ids.g12);

      // 2. A autorização herdada do orçamento não cobre um % maior ao faturar parte dos itens.
      const oAut = await Orc.salvarOrcamentoAction(A.db, A.owner, {
        operation_key: chave("orc"), establishment_id: A.L1, customer_id: A.cli.id, items: itens(A, [{ q: "quilo", qty: 10 }]), order_discount_amount: 30,
      });
      check("(preparo) o dono orça 10 x R$ 10 com R$ 30 no total (30% acima do limite de 10%)", oAut.ok === true && oAut.data?.discount_authorized_by_user_id === A.owner.id, j(oAut.data ?? oAut));
      const parte = await chamar(A.tok.vend, R.sales, "POST", "emporio/sales", {
        operation_key: chave("v"), establishment_id: A.L1, cash_register_id: A.reg1, customer_id: A.cli.id,
        quote_id: oAut.data?.id, items: itens(A, [{ q: "quilo", qty: 4 }]), payments: din(10),
      });
      check("faturar 4 dos 10 pelo vendedor herdando os R$ 30 (75%): 403 DISCOUNT_ABOVE_LIMIT, não sai autorizado", erro(parte, 403, "items", "DISCOUNT_ABOVE_LIMIT"), `${parte.status} ${sobra(parte)}`);
      const inteiro = await chamar(A.tok.vend, R.sales, "POST", "emporio/sales", {
        operation_key: chave("v"), establishment_id: A.L1, cash_register_id: A.reg1, customer_id: A.cli.id,
        quote_id: oAut.data?.id, items: itens(A, [{ q: "quilo", qty: 10 }]), payments: din(70),
      });
      check("faturar o orçamento inteiro herda a autorização do dono (mesmo %): 201", inteiro.status === 201 && inteiro.corpo?.data?.discount_authorized_by_user_id === A.owner.id, `${inteiro.status} ${sobra(inteiro)}`);
      const oAut2 = await Orc.salvarOrcamentoAction(A.db, A.owner, {
        operation_key: chave("orc"), establishment_id: A.L1, customer_id: A.cli.id, items: itens(A, [{ q: "quilo", qty: 10 }]), order_discount_amount: 30,
      });
      const aParte = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g1, PIN.g1, 80);
      const parteComToken = await chamar(A.tok.vend, R.sales, "POST", "emporio/sales", {
        operation_key: chave("v"), establishment_id: A.L1, cash_register_id: A.reg1, customer_id: A.cli.id,
        quote_id: oAut2.data?.id, items: itens(A, [{ q: "quilo", qty: 4 }]), payments: din(10),
        discount_authorization: String(aParte.corpo?.data?.authorization ?? ""),
      });
      check("faturar parte com autorização nova do gestor (80%): 201 em nome do gestor", parteComToken.status === 201 && parteComToken.corpo?.data?.discount_authorized_by_user_id === A.ids.g1, `${parteComToken.status} ${sobra(parteComToken)}`);

      // 3. O Histórico nomeia o gestor que autorizou, sem PIN nem token.
      const reg = await P.emporioAuditLog.findFirst({ where: { tenant_id: A.tenantId, action: "desconto.autorizar", target_id: A.ids.g1 }, orderBy: { created_at: "desc" } });
      check("o Histórico de desconto.autorizar traz o nome do gestor e 'autorizou com PIN'", !!reg && String(reg.summary).includes("M118 g1") && String(reg.summary).includes("autorizou com PIN"), String(reg?.summary));
      check("e não traz PIN nem token", !!reg && !String(reg.summary).includes(PIN.g1) && !String(reg.summary).includes(String(aParte.corpo?.data?.authorization)), String(reg?.summary));

      // 4. Apagar ou trocar o PIN derruba as autorizações já emitidas.
      const emitida = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g1, PIN.g1, 15);
      const tokenA = String(emitida.corpo?.data?.authorization ?? "");
      const usar = (tk: string) => vender(A, A.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 15 }], 85, { discount_authorization: tk });
      const antes = await usar(tokenA);
      check("(controle) a autorização emitida vale antes de mexer no PIN: 201", antes.status === 201, `${antes.status} ${sobra(antes)}`);
      await chamar(A.tok.owner, R.apagarPin, "DELETE", `emporio/team/${A.ids.g1}/pin`, undefined, { userId: A.ids.g1 });
      const depoisApagar = await usar(tokenA);
      check("o Dono apaga o PIN do gestor: a venda com o token recebe 403 DISCOUNT_AUTHORIZATION_INVALID", erro(depoisApagar, 403, "discount_authorization", "DISCOUNT_AUTHORIZATION_INVALID"), `${depoisApagar.status} ${sobra(depoisApagar)}`);
      await definirPin(A.tok.g1, PIN.g1);
      const mesmoPinDeNovo = await usar(tokenA);
      check("o gestor cadastra outro PIN (mesmo número, outro hash): o token antigo segue recusado", erro(mesmoPinDeNovo, 403, "discount_authorization", "DISCOUNT_AUTHORIZATION_INVALID"), `${mesmoPinDeNovo.status} ${sobra(mesmoPinDeNovo)}`);
      const emitida2 = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g1, PIN.g1, 15);
      const tokenB = String(emitida2.corpo?.data?.authorization ?? "");
      check("(controle) a autorização nova vale: 201", (await usar(tokenB)).status === 201);
      await definirPin(A.tok.g1, "135790");
      const depoisTrocar = await usar(tokenB);
      check("o gestor troca o PIN: o token emitido com o anterior recebe 403 DISCOUNT_AUTHORIZATION_INVALID", erro(depoisTrocar, 403, "discount_authorization", "DISCOUNT_AUTHORIZATION_INVALID"), `${depoisTrocar.status} ${sobra(depoisTrocar)}`);
      await definirPin(A.tok.g1, PIN.g1);
    });

    await rodar("isolamento", async () => {
      console.log("\n8. Isolamento entre contas");
      const doA = await pedirAutorizacao(A, A.tok.vend, A.L1, A.ids.g1, PIN.g1, 15);
      const authDoA = String(doA.corpo?.data?.authorization ?? "");
      check("(preparo) o A emite uma autorização válida", ok(doA) && authDoA.length > 10, `${doA.status}`);
      const pedirDoB = await pedirAutorizacao(B, B.tok.vend, A.L1, A.ids.g1, PIN.g1, 15);
      check("o B não pede autorização na loja nem com o gestor do A: recusa (4xx), sem autorização", recusada(pedirDoB) && pedirDoB.corpo?.data?.authorization === undefined, `${pedirDoB.status} ${sobra(pedirDoB)}`);
      const gestorDoA = await pedirAutorizacao(B, B.tok.vend, B.L1, A.ids.g1, PIN.g1, 15);
      check("nem usa o gestor do A na loja do B: recusa (4xx)", recusada(gestorDoA) && gestorDoA.corpo?.data?.authorization === undefined, `${gestorDoA.status} ${sobra(gestorDoA)}`);
      const lista = await listaDeAutorizadores(B, B.tok.vend, A.L1);
      check("o B não lista os autorizadores da loja do A (404)", lista.r.status === 404, `${lista.r.status}`);
      const venda = await vender(B, B.tok.vend, [{ q: "quilo", qty: 10, discount_pct: 15 }], 85, { discount_authorization: authDoA });
      check("o B não vende acima do limite com a autorização do A: 403", venda.status === 403, `${venda.status} ${sobra(venda)}`);
      check("e nenhuma venda foi gravada no B", (await P.emporioSale.count({ where: { tenant_id: B.tenantId } })) === 0);
      const apagar = await chamar(B.tok.owner, R.apagarPin, "DELETE", `emporio/team/${A.ids.g1}/pin`, undefined, { userId: A.ids.g1 });
      check("o dono do B não apaga o PIN de usuário do A (404)", apagar.status === 404, `${apagar.status} ${sobra(apagar)}`);
      check("o PIN do gestor do A continua lá", (await temPin(A, A.ids.g1)) === true);
      const equipeB = j((await chamar(B.tok.owner, R.team, "GET", "emporio/team")).corpo);
      check("a Equipe do B não cita ninguém do A", !equipeB.includes(A.ids.g1) && !equipeB.includes(A.ids.gerente));
    });
  } finally {
    for (const id of tenantIds.reverse()) {
      await limpar(id);
    }
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\n✅ M118 (Módulo 39, Empório): preço do cadastro, desconto por PIN e brinde passaram." : `\n❌ M118 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

async function limpar(id: string) {
  const { prisma } = await import("@/lib/prisma");
  const P = prisma as Dado;
  await P.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } }).catch(() => undefined);
  await P.emporioQuote.updateMany({ where: { tenant_id: id }, data: { sale_id: null, based_on_quote_id: null } }).catch(() => undefined);
  await P.saleVariableExpense.deleteMany({ where: { tenant_id: id } }).catch(() => undefined);
  await P.variableExpenseRule.deleteMany({ where: { tenant_id: id } }).catch(() => undefined);
  await prisma.tenant.delete({ where: { id } }).catch((e: unknown) => console.log(`  (teardown ${id}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
