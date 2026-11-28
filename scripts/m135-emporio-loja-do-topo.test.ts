import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M135: Módulo 39 (Meu Empório), UX onda 6: a loja do topo no servidor.
 * Roda: `npm run test:m135`
 *
 * Escrita do plano docs/superpowers/plans/2026-11-27-emporio-ux-onda6-loja-no-topo.md (T1 e T2).
 *
 * Seção 1: funções puras (seletorDeLojaVale, escolherLojaDoTopo), sem banco.
 * Seção 2: o mundo de teste (duas contas, duas lojas na primeira, um Gestor só da loja A).
 * Seção 3: escolherLojaDoTopoAction (alcance, outro tenant, null).
 * Seção 4: a rota POST /api/v1/emporio/loja-do-topo (cookie gravado e apagado, recusa, 401).
 * Seção 5: o Início por loja (lerInicioAction com establishment_id, e a rota GET).
 * Seção 6: as despesas fixas por loja (listarDespesasFixasAction com establishment_id).
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

console.log("🏪 M135: Módulo 39 (Meu Empório), UX onda 6: a loja do topo no servidor\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];
let seq = 0;
const chave = (p: string) => `m135-${p}-${stamp}-${(seq += 1)}`;

type Usuario = { id: string; role: "OWNER" | "OPERADOR"; email: string };
type Mundo = {
  tenantId: string;
  db: Dado;
  owner: Usuario;
  tok: Record<string, string>;
  lojas: Record<string, string>;
  presId: string;
  prodId: string;
  regs: Record<string, string>;
  users: Record<string, Usuario>;
};

async function montar(rotulo: string, lojasNomes: string[], extras: string[]): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M135 ${rotulo} ${stamp}`, document: `M135${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M135 ${suf}`, email: `m135-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const users: Record<string, Usuario> = {};
  const db = prismaForTenant(t.id) as Dado;

  const lojas: Record<string, string> = {};
  for (const nome of lojasNomes) {
    const l = await Cat.criarEstabelecimentoAction(db, owner, { name: `M135 ${rotulo} ${nome}` });
    if (!l.ok) throw new Error(`loja ${nome}: ${j(l)}`);
    lojas[nome] = l.data.id as string;
  }

  const papeis: Record<string, Dado> = {
    gestor: { emporio_role: "gestor", emporio_keys: [] },
    caixa: { emporio_role: "caixa", emporio_keys: [] },
  };
  for (const suf of extras) users[suf] = await mk(suf, "OPERADOR", papeis[suf]);
  const primeira = lojas[lojasNomes[0]];
  if (primeira && extras.length) await vincularTodas(prisma, t.id, extras.map((s) => users[s].id), [primeira]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M135 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M135 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  for (const id of Object.values(lojas)) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: id, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: id, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  }

  const regs: Record<string, string> = {};
  for (const [nome, id] of Object.entries(lojas)) {
    const turno = await abrirTurnoDeTeste(db, owner, id);
    regs[nome] = turno.cash_register_id;
  }

  const tok: Record<string, string> = {};
  const todos: [string, Usuario][] = [["owner", owner], ...Object.entries(users)];
  for (const [k, u] of todos) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { tenantId: t.id, db, owner, tok, lojas, presId: pres.data.id, prodId: prod.data.id, regs, users };
}

let cpfSeq = 0;
async function clienteCompleto(w: Mundo, nome: string) {
  const { prisma } = await import("@/lib/prisma");
  const cpfs = ["39053344705", "52998224725", "11144477735", "86288366757", "16899535009"];
  const cpf = cpfs[(cpfSeq += 1) % cpfs.length];
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: nome, person_kind: "pf", document: cpf, phone: "11999990000" } as Dado })) as Dado;
}

async function vender(w: Mundo, loja: string, qtd: number, cli: Dado) {
  const V: Dado = await import("@/lib/actions/emporio-vendas");
  const r = await V.venderAction(w.db, w.owner, {
    operation_key: chave("venda"), customer_id: cli.id, establishment_id: w.lojas[loja], cash_register_id: w.regs[loja],
    items: [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: qtd }],
    payments: [{ kind: "dinheiro", amount: qtd * 10 }],
  });
  if (!r.ok) throw new Error(`venda ${loja}: ${j(r)}`);
}

const R = {
  topo: () => import("@/app/api/v1/emporio/loja-do-topo/route"),
  inicio: () => import("@/app/api/v1/emporio/inicio/route"),
};
type Resp = { status: number; corpo: Dado; setCookie: string };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST", url: string, corpo?: unknown): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  let m: Dado;
  try {
    m = await rota();
  } catch (e) {
    return { status: 0, corpo: { import_error: e instanceof Error ? e.message.slice(0, 120) : String(e) }, setCookie: "" };
  }
  if (typeof m[metodo] !== "function") return { status: 0, corpo: { sem_metodo: metodo }, setCookie: "" };
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado, setCookie: res.headers.get("set-cookie") ?? "" };
}

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

async function comBanco() {
  // ------------------------------------------------------------------------------------------ 1
  console.log("1. Funções puras");
  let puro: Dado = null;
  try {
    puro = await import("@/lib/emporio/loja-do-topo");
  } catch (e) {
    check("o módulo loja-do-topo existe", false, e instanceof Error ? e.message.slice(0, 120) : String(e));
  }
  if (puro) {
    const { seletorDeLojaVale, escolherLojaDoTopo, LOJA_DO_TOPO_COOKIE } = puro;
    check("o cookie se chama tibe_emporio_loja", LOJA_DO_TOPO_COOKIE === "tibe_emporio_loja", String(LOJA_DO_TOPO_COOKIE));
    for (const p of ["/emporio", "/emporio/estoque", "/emporio/financeiro/pagar/", "/emporio/vendas", "/emporio/historico", "/emporio/estatisticas"]) {
      check(`seletorDeLojaVale(${p}) é true`, seletorDeLojaVale(p) === true);
    }
    for (const p of ["/emporio/vender", "/emporio/caixa", "/emporio/produtos", "/emporio/vendas/abc", "/rebanho", "/emporio/estoque/x"]) {
      check(`seletorDeLojaVale(${p}) é false`, seletorDeLojaVale(p) === false);
    }
    const lojas = [{ id: "A" }, { id: "B" }];
    check("a URL vence o cookie", escolherLojaDoTopo({ daUrl: "B", doCookie: "A", lojas }) === "B");
    check("URL inválida cai no cookie válido", escolherLojaDoTopo({ daUrl: "X", doCookie: "A", lojas }) === "A");
    check("cookie inválido sem URL vira Todas", escolherLojaDoTopo({ doCookie: "X", lojas }) === "");
    check("sem lojas vira Todas", escolherLojaDoTopo({ lojas: [] }) === "");
    check("nada informado vira Todas", escolherLojaDoTopo({ lojas }) === "");
  }

  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    // ------------------------------------------------------------------------------------------ 2
    console.log("\n2. O mundo de teste");
    const W = await montar("T1", ["A", "B"], ["gestor", "caixa"]);
    const W2 = await montar("T2", ["C"], []);
    check("(fixture) as duas contas montadas", !!W.tenantId && !!W2.tenantId);
    const gestorA = W.users.gestor, caixa = W.users.caixa;
    const cli = await clienteCompleto(W, "M135 Cliente");
    await vender(W, "A", 10, cli); // 100 na loja A
    await vender(W, "B", 3, cli); // 30 na loja B

    // ------------------------------------------------------------------------------------------ 3
    await rodar("a action", async () => {
      console.log("\n3. escolherLojaDoTopoAction");
      const A: Dado = await import("@/lib/actions/emporio-loja-do-topo");
      const dono = await A.escolherLojaDoTopoAction(W.db, W.owner, W.lojas.B);
      check("dono escolhe uma loja da conta", dono.ok === true && dono.data.establishment_id === W.lojas.B, j(dono));
      const nulo = await A.escolherLojaDoTopoAction(W.db, W.owner, null);
      check("null passa (Todas)", nulo.ok === true && nulo.data.establishment_id === null, j(nulo));
      const gOk = await A.escolherLojaDoTopoAction(W.db, gestorA, W.lojas.A);
      check("gestor escolhe a loja que alcança", gOk.ok === true, j(gOk));
      const gNo = await A.escolherLojaDoTopoAction(W.db, gestorA, W.lojas.B);
      check("gestor escolhendo a loja que não alcança: NOT_FOUND 404", gNo.ok === false && gNo.code === "NOT_FOUND" && gNo.status === 404 && gNo.field === "establishment_id", j(gNo));
      const fora = await A.escolherLojaDoTopoAction(W.db, W.owner, W2.lojas.C);
      check("id de outro tenant: NOT_FOUND", fora.ok === false && fora.code === "NOT_FOUND" && fora.field === "establishment_id", j(fora));
      const inventado = await A.escolherLojaDoTopoAction(W.db, W.owner, "nao-existe");
      check("id inexistente: NOT_FOUND", inventado.ok === false && inventado.code === "NOT_FOUND", j(inventado));
      const cx = await A.escolherLojaDoTopoAction(W.db, caixa, W.lojas.A);
      check("o Caixa também pode escolher a loja dele", cx.ok === true, j(cx));
    });

    // ------------------------------------------------------------------------------------------ 4
    await rodar("a rota", async () => {
      console.log("\n4. POST /api/v1/emporio/loja-do-topo");
      const r1 = await chamar(W.tok.owner, R.topo, "POST", "emporio/loja-do-topo", { establishment_id: W.lojas.B });
      check("dono: 200", r1.status === 200, `${r1.status} ${j(r1.corpo)}`);
      check("devolve o id escolhido", r1.corpo?.data?.establishment_id === W.lojas.B, j(r1.corpo));
      check("grava o cookie com a loja, path /, um ano, lax",
        r1.setCookie.includes(`tibe_emporio_loja=${W.lojas.B}`) && /path=\//i.test(r1.setCookie) && r1.setCookie.includes("31536000") && /samesite=lax/i.test(r1.setCookie), r1.setCookie);
      const r2 = await chamar(W.tok.owner, R.topo, "POST", "emporio/loja-do-topo", { establishment_id: null });
      check("null: 200 e apaga o cookie", r2.status === 200 && r2.setCookie.includes("tibe_emporio_loja=") && !r2.setCookie.includes(W.lojas.B) && /max-age=0|expires=/i.test(r2.setCookie), `${r2.status} ${r2.setCookie}`);
      const r3 = await chamar(W.tok.gestor, R.topo, "POST", "emporio/loja-do-topo", { establishment_id: W.lojas.B });
      check("gestor pedindo a loja B: 404 e nenhum cookie", r3.status === 404 && r3.setCookie === "", `${r3.status} ${r3.setCookie}`);
      const r4 = await chamar(W.tok.owner, R.topo, "POST", "emporio/loja-do-topo", { establishment_id: W2.lojas.C });
      check("loja de outro tenant: 404 e nenhum cookie", r4.status === 404 && r4.setCookie === "", `${r4.status} ${r4.setCookie}`);
      const r5 = await chamar(W.tok.owner, R.topo, "POST", "emporio/loja-do-topo", { establishment_id: 5 });
      check("corpo inválido: 422 com o campo", r5.status === 422 && r5.corpo?.error?.code === "VALIDATION_ERROR", `${r5.status} ${j(r5.corpo)}`);
      const r6 = await chamar(W.tok.caixa, R.topo, "POST", "emporio/loja-do-topo", { establishment_id: W.lojas.A });
      check("caixa: 200", r6.status === 200, `${r6.status} ${j(r6.corpo)}`);
      const r7 = await chamar("", R.topo, "POST", "emporio/loja-do-topo", { establishment_id: null });
      check("sem token: 401", r7.status === 401, `${r7.status} ${j(r7.corpo)}`);
    });

    // ------------------------------------------------------------------------------------------ 5
    await rodar("o Início por loja", async () => {
      console.log("\n5. O Início por loja");
      const Ini: Dado = await import("@/lib/actions/emporio-inicio");
      const Cat = await import("@/lib/actions/emporio-catalogo");
      const Est = await import("@/lib/actions/emporio-estoque");
      // Produto abaixo do mínimo só na loja A.
      const cat = await W.db.productCategory.findFirst({});
      const prod = await Cat.criarProdutoEmporioAction(W.db, W.owner, { name: `M135 Falta A ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
      if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
      const lim = await Est.definirLimitesAction(W.db, W.owner, { establishment_id: W.lojas.A, emporio_product_id: prod.data.id, min_qty: 5, max_qty: 20 });
      if (!lim.ok) throw new Error(`limites: ${j(lim)}`);

      const semFiltro = await Ini.lerInicioAction(W.db, W.owner);
      check("sem filtro: vendas hoje 130", semFiltro.ok && Number(semFiltro.data.numeros.vendas_hoje.total) === 130, j(semFiltro.ok && semFiltro.data.numeros.vendas_hoje));
      check("sem filtro: aviso de estoque baixo existe", semFiltro.ok && semFiltro.data.avisos.some((a: Dado) => String(a.chave).startsWith("estoque_baixo")), j(semFiltro.ok && semFiltro.data.avisos));
      const comB = await Ini.lerInicioAction(W.db, W.owner, { establishment_id: W.lojas.B });
      check("loja B: vendas hoje 30, 1 venda", comB.ok && Number(comB.data.numeros.vendas_hoje.total) === 30 && Number(comB.data.numeros.vendas_hoje.quantidade) === 1, j(comB.ok && comB.data.numeros.vendas_hoje));
      check("loja B: vendas do mês 30", comB.ok && Number(comB.data.numeros.vendas_mes.total) === 30, j(comB.ok && comB.data.numeros.vendas_mes));
      check("loja B: sem aviso de estoque baixo (o produto falta só na A)", comB.ok && !comB.data.avisos.some((a: Dado) => String(a.chave).startsWith("estoque_baixo")), j(comB.ok && comB.data.avisos));
      const comA = await Ini.lerInicioAction(W.db, W.owner, { establishment_id: W.lojas.A });
      check("loja A: vendas hoje 100", comA.ok && Number(comA.data.numeros.vendas_hoje.total) === 100, j(comA.ok && comA.data.numeros.vendas_hoje));
      check("loja A: o aviso de estoque baixo aparece", comA.ok && comA.data.avisos.some((a: Dado) => String(a.chave).startsWith("estoque_baixo")), j(comA.ok && comA.data.avisos));
      const gNo = await Ini.lerInicioAction(W.db, gestorA, { establishment_id: W.lojas.B });
      check("gestor só da A pedindo a B: NOT_FOUND", gNo.ok === false && gNo.code === "NOT_FOUND" && gNo.field === "establishment_id", j(gNo));
      const gOk = await Ini.lerInicioAction(W.db, gestorA, { establishment_id: W.lojas.A });
      check("gestor pedindo a A: ok e vendas 100", gOk.ok && Number(gOk.data.numeros.vendas_hoje.total) === 100, j(gOk));
      const fora = await Ini.lerInicioAction(W.db, W.owner, { establishment_id: W2.lojas.C });
      check("dono pedindo loja de outro tenant: NOT_FOUND", fora.ok === false && fora.code === "NOT_FOUND", j(fora));

      const rg = await chamar(W.tok.owner, R.inicio, "GET", `emporio/inicio?establishment_id=${W.lojas.B}`);
      check("GET com establishment_id: 200 e 30", rg.status === 200 && Number(rg.corpo?.data?.numeros?.vendas_hoje?.total) === 30, `${rg.status} ${j(rg.corpo?.data?.numeros?.vendas_hoje)}`);
      const rg2 = await chamar(W.tok.owner, R.inicio, "GET", `emporio/inicio?establishment_id=${W2.lojas.C}`);
      check("GET com loja de outro tenant: 404", rg2.status === 404, `${rg2.status} ${j(rg2.corpo)}`);
      const rg3 = await chamar(W.tok.owner, R.inicio, "GET", "emporio/inicio");
      check("GET sem o parâmetro segue como hoje (130)", rg3.status === 200 && Number(rg3.corpo?.data?.numeros?.vendas_hoje?.total) === 130, `${rg3.status} ${j(rg3.corpo?.data?.numeros?.vendas_hoje)}`);
    });

    // ------------------------------------------------------------------------------------------ 6
    await rodar("6. A pagar, aba Despesas fixas: a loja do topo filtra os modelos (achado do juiz da onda 6)", async () => {
      const D = await import("@/lib/actions/emporio-despesas");
      const soA = await D.criarDespesaFixaAction(W.db, W.owner, { name: `M135 Fixa A ${stamp}`, amount: 100, due_day: 10, split_kind: "valor", splits: [{ establishment_id: W.lojas.A, value: 100 }] });
      const soB = await D.criarDespesaFixaAction(W.db, W.owner, { name: `M135 Fixa B ${stamp}`, amount: 200, due_day: 10, split_kind: "valor", splits: [{ establishment_id: W.lojas.B, value: 200 }] });
      const ambas = await D.criarDespesaFixaAction(W.db, W.owner, { name: `M135 Fixa AB ${stamp}`, amount: 300, due_day: 10, split_kind: "valor", splits: [{ establishment_id: W.lojas.A, value: 150 }, { establishment_id: W.lojas.B, value: 150 }] });
      check("(fixture) três despesas fixas criadas", soA.ok && soB.ok && ambas.ok, j([soA, soB, ambas].map((r) => (r.ok ? "ok" : r))));
      const nomes = (r: Dado) => (r.ok ? (r.data as { name: string }[]).map((f) => f.name).filter((n) => n.startsWith("M135 Fixa")).sort() : r);

      const todas = await D.listarDespesasFixasAction(W.db, W.owner);
      check("sem loja: as três", j(nomes(todas)) === j([`M135 Fixa A ${stamp}`, `M135 Fixa AB ${stamp}`, `M135 Fixa B ${stamp}`]), j(nomes(todas)));
      const naB = await D.listarDespesasFixasAction(W.db, W.owner, { establishment_id: W.lojas.B });
      check("com a loja B: a da B e a dividida, não a da A", j(nomes(naB)) === j([`M135 Fixa AB ${stamp}`, `M135 Fixa B ${stamp}`]), j(nomes(naB)));
      const gNo = await D.listarDespesasFixasAction(W.db, W.users.gestor, { establishment_id: W.lojas.B });
      check("gestor só da A pedindo a B: NOT_FOUND em establishment_id", gNo.ok === false && gNo.code === "NOT_FOUND" && gNo.field === "establishment_id", j(gNo));
      const fora = await D.listarDespesasFixasAction(W.db, W.owner, { establishment_id: W2.lojas.C });
      check("dono pedindo loja de outro tenant: nada vaza (lista vazia ou NOT_FOUND)", fora.ok ? j(nomes(fora)) === "[]" : fora.code === "NOT_FOUND", j(fora.ok ? nomes(fora) : fora));
    });
  } finally {
    for (const id of tenantIds.reverse()) {
      const por = { where: { tenant_id: id } };
      await P.emporioSale.updateMany({ ...por, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } }).catch(() => undefined);
      await P.emporioQuote.updateMany({ ...por, data: { sale_id: null, based_on_quote_id: null } }).catch(() => undefined);
      for (const m of ["emporioPaymentRequest", "cashMovement", "cashCount", "cashHandover", "cardAnticipation", "productionEntry", "stockTransfer", "emporioCheck", "emporioBoleto"]) {
        await P[m].deleteMany(por).catch(() => undefined);
      }
      await prisma.tenant.delete({ where: { id } }).catch((e: unknown) => console.log(`  (teardown ${id}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.$disconnect();
  }
}

comBanco()
  .catch((err) => {
    falhas += 1;
    console.error(err);
  })
  .finally(() => {
    console.log(falhas === 0 ? "\n✅ M135 (Módulo 39, Empório): a loja do topo no servidor passou." : `\n❌ M135 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
    process.exit(falhas === 0 ? 0 : 1);
  });
