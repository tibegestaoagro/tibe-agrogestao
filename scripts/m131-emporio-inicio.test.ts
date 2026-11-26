import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";
import { colunasDoInicio } from "@/lib/emporio/inicio";
import type { PapelContexto, PapelEmporio } from "@/lib/emporio/papel";

exigirBancoLocal();

/**
 * M131: Módulo 39 (Meu Empório), UX onda 2: a leitura do Início (`lerInicioAction`, `GET /api/v1/emporio/inicio`).
 * Roda: `npm run test:m131`
 *
 * Escrita só do plano docs/superpowers/plans/2026-11-25-emporio-ux-onda2-inicio.md (T1) e do
 * desenho §5.5, sem ler a implementação.
 *
 * Seção 1: quem vê qual coluna (função pura, sem banco).
 * Seção 2: o mundo de teste.
 * Seção 3: papéis (dono, gestor, financeiro, vendedor, caixa) com o relógio real.
 * Seção 4: vendas do mês, mês anterior zerado (variacao_pct nulo), e conta sem loja.
 * Seção 5: relógio fixo em 25/11 22h30 de São Paulo (já 26/11 em UTC): orçamento, caixa de ontem, vendas de hoje.
 * Seção 6: gestor de A não enxerga a loja B (alcance).
 * Seção 7: a rota e dois tenants.
 * Seções 8 a 10: dia de São Paulo, venda cancelada, avisos de dinheiro (com a concordância no plural).
 * Seção 11: a concordância no singular.
 *
 * Suposições de contrato que o plano não fechava (ver o relato): a chave do aviso por loja/turno pode ser
 * `estoque_baixo` ou `estoque_baixo:<id>` (a suíte casa por prefixo); o `valor` do `pagar_hoje` é a soma
 * em reais; `quantidade` de `estoque_baixo` é o número de produtos abaixo do mínimo naquela loja.
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

console.log("🏠 M131: Módulo 39 (Meu Empório), UX onda 2: a leitura do Início\n");

// ---------------------------------------------------------------------------------------------- 1
console.log("1. Quem vê qual coluna (colunasDoInicio)");
function ctx(papel: PapelEmporio, lojas: string[] | null): PapelContexto {
  return { papel, lojas: lojas ? new Set(lojas) : null, chaves: new Set(), soDaLoja: papel !== "dono" };
}
const cols = (papel: PapelEmporio, lojas: string[] | null) => j(colunasDoInicio(ctx(papel, lojas)));
check("dono: gestor e dinheiro", cols("dono", null) === j({ gestor: true, dinheiro: true }), cols("dono", null));
check("gerente geral: gestor e dinheiro", cols("gerente_geral", null) === j({ gestor: true, dinheiro: true }), cols("gerente_geral", null));
check("gestor: só gestor", cols("gestor", ["L"]) === j({ gestor: true, dinheiro: false }), cols("gestor", ["L"]));
check("financeiro: só dinheiro", cols("financeiro", null) === j({ gestor: false, dinheiro: true }), cols("financeiro", null));
check("vendedor: nenhuma", cols("vendedor", ["L"]) === j({ gestor: false, dinheiro: false }), cols("vendedor", ["L"]));
check("caixa: nenhuma", cols("caixa", ["L"]) === j({ gestor: false, dinheiro: false }), cols("caixa", ["L"]));

// ---------------------------------------------------------------------------------------------- banco
const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];
const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
let seq = 0;
const chave = (p: string) => `m131-${p}-${stamp}-${(seq += 1)}`;

// O relógio da seção 5: 25/11/2026 às 22h30 em São Paulo (UTC-3) = 26/11 01:30 em UTC.
const AGORA_FIXO = new Date("2026-11-26T01:30:00Z");

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
    data: { name: `M131 ${rotulo} ${stamp}`, document: `M131${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  // Validade curta: o orçamento nasce a hoje + 2, dentro da janela de "vencendo".
  await (prisma as Dado).emporioSettings.upsert({
    where: { tenant_id: t.id },
    create: { tenant_id: t.id, quote_validity_days: 2 },
    update: { quote_validity_days: 2 },
  });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M131 ${suf}`, email: `m131-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const users: Record<string, Usuario> = {};
  const db = prismaForTenant(t.id) as Dado;

  const lojas: Record<string, string> = {};
  for (const nome of lojasNomes) {
    const l = await Cat.criarEstabelecimentoAction(db, owner, { name: `M131 ${rotulo} ${nome}` });
    if (!l.ok) throw new Error(`loja ${nome}: ${j(l)}`);
    lojas[nome] = l.data.id as string;
  }

  const papeis: Record<string, Dado> = {
    gestor: { emporio_role: "gestor", emporio_keys: [] },
    fin: { emporio_role: "financeiro", emporio_only: true, emporio_keys: [] },
    vend: { emporio_role: "vendedor", emporio_keys: [] },
    caixa: { emporio_role: "caixa", emporio_keys: [] },
  };
  for (const suf of extras) users[suf] = await mk(suf, "OPERADOR", papeis[suf]);
  // Gestor, vendedor e caixa só têm a primeira loja ("A"). O financeiro não tem vínculo.
  const primeira = lojas[lojasNomes[0]];
  const vinculados = extras.filter((s) => s !== "fin").map((s) => users[s].id);
  if (primeira && vinculados.length) await vincularTodas(prisma, t.id, vinculados, [primeira]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M131 categoria ${rotulo}` }) });
  const produto = async (nome: string) => {
    const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M131 ${nome} ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
    const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
    return { prodId: prod.data.id as string, presId: pres.data.id as string };
  };
  // Produto de venda: preço 10 e estoque em toda loja.
  const ps = await produto("Ração");
  for (const id of Object.values(lojas)) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: id, presentation_id: ps.presId, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: id, emporio_product_id: ps.prodId, sealed: [], loose_qty: 100000, unit_cost: 4 });
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
  return { tenantId: t.id, db, owner, tok, lojas, presId: ps.presId, prodId: ps.prodId, regs, users };
}

/** Produto sem estoque e com mínimo 5 na loja: entra na reposição. */
async function produtoAbaixoDoMinimo(w: Mundo, loja: string, nome: string) {
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const cat = await w.db.productCategory.findFirst({});
  const prod = await Cat.criarProdutoEmporioAction(w.db, w.owner, { name: `M131 ${nome} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto ${nome}: ${j(prod)}`);
  const Est = await import("@/lib/actions/emporio-estoque");
  const lim = await Est.definirLimitesAction(w.db, w.owner, { establishment_id: w.lojas[loja], emporio_product_id: prod.data.id, min_qty: 5, max_qty: 20 });
  if (!lim.ok) throw new Error(`limites ${nome}: ${j(lim)}`);
}

async function vender(w: Mundo, loja: string, qtd: number, cli: Dado) {
  const V: Dado = await import("@/lib/actions/emporio-vendas");
  const r = await V.venderAction(w.db, w.owner, {
    operation_key: chave("venda"), customer_id: cli.id, establishment_id: w.lojas[loja], cash_register_id: w.regs[loja],
    items: [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: qtd }],
    payments: [{ kind: "dinheiro", amount: qtd * 10 }],
  });
  if (!r.ok) throw new Error(`venda ${loja}: ${j(r)}`);
  return (r.data?.id ?? r.data?.sale_id) as string;
}

const R = { inicio: () => import("@/app/api/v1/emporio/inicio/route"), quotes: () => import("@/app/api/v1/emporio/quotes/route") };
type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST", url: string, corpo?: unknown): Promise<Resp> {
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
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}

let cpfSeq = 0;
async function clienteCompleto(w: Mundo, nome: string) {
  const { prisma } = await import("@/lib/prisma");
  const cpfs = ["39053344705", "52998224725", "11144477735", "86288366757", "16899535009"];
  const cpf = cpfs[(cpfSeq += 1) % cpfs.length];
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: nome, person_kind: "pf", document: cpf, phone: "11999990000" } as Dado })) as Dado;
}
async function orcamento(w: Mundo, loja: string, cli: Dado): Promise<string> {
  const r = await chamar(w.tok.owner, R.quotes, "POST", "emporio/quotes", {
    operation_key: chave("orc"), establishment_id: w.lojas[loja], customer_id: cli.id,
    items: [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: 1 }],
  });
  if (r.status !== 201) throw new Error(`orçamento ${loja}: ${r.status} ${j(r.corpo)}`);
  return String(r.corpo?.data?.id);
}

type Lido = { ok: true; data: { avisos: Dado[]; numeros: Dado } } | { ok: false; status?: number; [k: string]: Dado };
async function ler(w: Mundo, quem: Usuario, agora?: Date): Promise<Lido> {
  const A: Dado = await import("@/lib/actions/emporio-inicio");
  return A.lerInicioAction(w.db, quem, agora ? { agora } : undefined);
}
const avisosDe = (r: Lido): Dado[] => (r.ok ? r.data.avisos : []);
const daChave = (r: Lido, prefixo: string) => avisosDe(r).filter((a) => String(a.chave).startsWith(prefixo));
const colunas = (r: Lido) => [...new Set(avisosDe(r).map((a) => a.coluna))].sort();
const qtds = (as: Dado[]) => as.map((a) => Number(a.quantidade)).sort((a, b) => a - b);

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

async function comBanco() {
  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    // ------------------------------------------------------------------------------------------ 2
    console.log("\n2. O mundo de teste");
    // T1: lojas A e B (e Z, sem nada abaixo do mínimo), com todos os papéis. T2: outra conta, loja C.
    const W = await montar("T1", ["A", "B", "Z"], ["gestor", "fin", "vend", "caixa"]);
    const W2 = await montar("T2", ["C"], []);
    check("(fixture) as duas contas montadas", !!W.tenantId && !!W2.tenantId);
    const gestorA = W.users.gestor, fin = W.users.fin, vend = W.users.vend, caixa = W.users.caixa;

    await produtoAbaixoDoMinimo(W, "A", "Falta A");
    await produtoAbaixoDoMinimo(W, "B", "Falta B");
    await produtoAbaixoDoMinimo(W2, "C", "Falta C");

    const cli = await clienteCompleto(W, "M131 Cliente");
    const cli2 = await clienteCompleto(W2, "M131 Cliente 2");
    const idQA1 = await orcamento(W, "A", cli);
    const idQA2 = await orcamento(W, "A", cli);
    const idQA3 = await orcamento(W, "A", cli);
    const idQA4 = await orcamento(W, "A", cli);
    const idQB = await orcamento(W, "B", cli);
    await orcamento(W2, "C", cli2);
    check("(fixture) cinco orçamentos em T1 e um em T2", true);

    // Vendas reais (relógio real): A 2 unidades (20), B 1 unidade (10); T2: 5 unidades (50).
    const vendaA = await vender(W, "A", 2, cli);
    const vendaB = await vender(W, "B", 1, cli);
    await vender(W2, "C", 5, cli2);

    // A pagar hoje (conta do dinheiro): compra a prazo de 100 vencendo hoje na loja A.
    const Compras: Dado = await import("@/lib/actions/emporio-compras");
    const rc = await Compras.criarCompraAction(W.db, W.owner, {
      operation_key: chave("compra"), establishment_id: W.lojas.A, purchased_at: new Date(), received: true, freight: 0,
      items: [{ emporio_product_id: W.prodId, quantity: 10, item_total: 100 }],
      payment: { kind: "a_prazo", due_date: meioDia(hojeStr) },
    });
    check("(fixture) compra a prazo vencendo hoje: ok", rc.ok === true, j(rc));

    // ------------------------------------------------------------------------------------------ 3
    await rodar("papéis", async () => {
      console.log("\n3. Papéis (relógio real)");
      const dono = await ler(W, W.owner);
      check("dono: ok", dono.ok === true, j(dono));
      check("dono vê as duas colunas", j(colunas(dono)) === j(["dinheiro", "gestor"]), j(colunas(dono)));
      check("dono: estoque_baixo de A e de B, um aviso por loja, e nenhum de Z (quantidade zero não entra)",
        daChave(dono, "estoque_baixo").length === 2 && j(qtds(daChave(dono, "estoque_baixo"))) === j([1, 1]), j(daChave(dono, "estoque_baixo")));
      check("dono: orcamento_vencendo existe", daChave(dono, "orcamento_vencendo").length === 1, j(daChave(dono, "orcamento_vencendo")));
      const pagar = daChave(dono, "pagar_hoje");
      check("dono: pagar_hoje existe", pagar.length === 1, j(pagar));
      check("dono: pagar_hoje vale 100", pagar.length === 1 && Number(pagar[0].valor) === 100, j(pagar));
      check("nenhum aviso com quantidade zero", avisosDe(dono).every((a) => Number(a.quantidade) > 0), j(avisosDe(dono)));
      check("todo aviso tem texto, href e acao", avisosDe(dono).every((a) => a.texto && String(a.href).startsWith("/emporio") && a.acao), j(avisosDe(dono)));

      const g = await ler(W, gestorA);
      check("gestor: ok", g.ok === true, j(g));
      check("gestor só vê a coluna gestor", j(colunas(g)) === j(["gestor"]), j(colunas(g)));
      check("gestor: nenhum aviso de dinheiro", ["fiado_vencido", "pagar_hoje", "aprovacao_pendente", "boleto_cheque_vencido", "conferir_banco"].every((c) => daChave(g, c).length === 0));
      check("gestor: estoque_baixo só da loja dele (um aviso, um produto)", daChave(g, "estoque_baixo").length === 1 && j(qtds(daChave(g, "estoque_baixo"))) === j([1]), j(daChave(g, "estoque_baixo")));
      check("gestor: entra_hoje e sai_hoje nulos (sem dinheiro)", g.ok && g.data.numeros.entra_hoje === null && g.data.numeros.sai_hoje === null, j(g.ok && g.data.numeros));

      const f = await ler(W, fin);
      check("financeiro: ok", f.ok === true, j(f));
      check("financeiro só vê a coluna dinheiro", j(colunas(f)) === j(["dinheiro"]), j(colunas(f)));
      check("financeiro: sem estoque_baixo, orcamento_vencendo e caixa_de_ontem",
        daChave(f, "estoque_baixo").length === 0 && daChave(f, "orcamento_vencendo").length === 0 && daChave(f, "caixa_de_ontem").length === 0);
      check("financeiro: pagar_hoje existe", daChave(f, "pagar_hoje").length === 1, j(daChave(f, "pagar_hoje")));
      check("financeiro: entra_hoje e sai_hoje presentes", f.ok && f.data.numeros.entra_hoje !== null && f.data.numeros.sai_hoje !== null, j(f.ok && f.data.numeros));

      const v = await ler(W, vend);
      check("vendedor: ok", v.ok === true, j(v));
      check("vendedor: nenhum aviso, mesmo com produto abaixo do mínimo e orçamento vencendo na loja dele", avisosDe(v).length === 0, j(avisosDe(v)));
      check("vendedor recebe os números: vendas de hoje da loja dele (20, 1 venda)",
        v.ok && Number(v.data.numeros.vendas_hoje.total) === 20 && Number(v.data.numeros.vendas_hoje.quantidade) === 1, j(v.ok && v.data.numeros.vendas_hoje));
      check("vendedor: entra_hoje e sai_hoje nulos", v.ok && v.data.numeros.entra_hoje === null && v.data.numeros.sai_hoje === null);

      const c = await ler(W, caixa);
      check("caixa: recusa 403", c.ok === false && c.status === 403, j(c));

      check("dono: vendas de hoje somam as duas lojas (30, 2 vendas)",
        dono.ok && Number(dono.data.numeros.vendas_hoje.total) === 30 && Number(dono.data.numeros.vendas_hoje.quantidade) === 2, j(dono.ok && dono.data.numeros.vendas_hoje));
      check("gestor de A: vendas de hoje só da loja A (20, 1 venda)",
        g.ok && Number(g.data.numeros.vendas_hoje.total) === 20 && Number(g.data.numeros.vendas_hoje.quantidade) === 1, j(g.ok && g.data.numeros.vendas_hoje));
    });

    // ------------------------------------------------------------------------------------------ 4
    await rodar("mês", async () => {
      console.log("\n4. Vendas do mês, mês anterior zerado, conta sem loja");
      const dono = await ler(W, W.owner);
      check("vendas_mes.total é 30", dono.ok && Number(dono.data.numeros.vendas_mes.total) === 30, j(dono.ok && dono.data.numeros.vendas_mes));
      check("mês anterior em zero: variacao_pct é null (nem Infinity, nem NaN)", dono.ok && dono.data.numeros.vendas_mes.variacao_pct === null, j(dono.ok && dono.data.numeros.vendas_mes));

      // Conta nova, sem loja nenhuma.
      const { prisma: pr, prismaForTenant } = await import("@/lib/prisma");
      const t0 = await pr.tenant.create({
        data: { name: `M131 T0 ${stamp}`, document: `M131T0${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
      });
      tenantIds.push(t0.id);
      await pr.tenantProfile.create({ data: { tenant_id: t0.id, profile_type: "emporio", active: true } });
      await pr.tenantFeature.create({ data: { tenant_id: t0.id, feature_key: "emporio", enabled: true } });
      const u0 = await pr.user.create({ data: { tenant_id: t0.id, name: "M131 vazio", email: `m131-t0-${stamp}@teste.local`, password_hash: "x", role: "OWNER" } });
      const r0 = await (await import("@/lib/actions/emporio-inicio") as Dado).lerInicioAction(prismaForTenant(t0.id), { id: u0.id, role: "OWNER" });
      check("conta sem loja: ok", r0.ok === true, j(r0));
      check("conta sem loja: nenhum aviso", r0.ok && r0.data.avisos.length === 0, j(r0.data?.avisos));
      const n0 = r0.ok ? r0.data.numeros : null;
      check("conta sem loja: números zerados, sem divisão por zero",
        !!n0 && Number(n0.vendas_hoje.total) === 0 && Number(n0.vendas_hoje.quantidade) === 0 && Number(n0.vendas_mes.total) === 0 && n0.vendas_mes.variacao_pct === null, j(n0));
    });

    // ------------------------------------------------------------------------------------------ 5
    await rodar("relógio fixo", async () => {
      console.log("\n5. Relógio fixo: 25/11 às 22h30 de São Paulo (26/11 em UTC)");
      // Orçamentos da loja A: hoje (25/11), hoje+3 (28/11), hoje+4 (29/11) e ontem (24/11). Loja B: hoje+1.
      const dia = (d: string) => meioDia(d);
      await P.emporioQuote.update({ where: { id: idQA1 }, data: { valid_until: dia("2026-11-28") } });
      await P.emporioQuote.update({ where: { id: idQA2 }, data: { valid_until: dia("2026-11-29") } });
      await P.emporioQuote.update({ where: { id: idQA3 }, data: { valid_until: dia("2026-11-24") } });
      await P.emporioQuote.update({ where: { id: idQA4 }, data: { valid_until: dia("2026-11-25") } });
      await P.emporioQuote.update({ where: { id: idQB }, data: { valid_until: dia("2026-11-26") } });

      // Turnos: A caixa 1 aberto ontem às 23h (02:00Z de 25/11), A caixa 2 aberto hoje às 00h05 (03:05Z), B caixa 1 ontem às 23h.
      const { scoped } = await import("@/lib/prisma");
      const { abrirTurnoDeTeste } = await import("./_emporio-turno");
      const caixa2 = await W.db.cashRegister.create({ data: scoped({ establishment_id: W.lojas.A, number: 2 }) });
      const t2 = await abrirTurnoDeTeste(W.db, W.owner, W.lojas.A, undefined, { cash_register_id: caixa2.id });
      const tA1 = await P.cashSession.findFirst({ where: { cash_register_id: W.regs.A, closed_at: null } });
      const tB1 = await P.cashSession.findFirst({ where: { cash_register_id: W.regs.B, closed_at: null } });
      await P.cashSession.update({ where: { id: tA1.id }, data: { opened_at: new Date("2026-11-25T02:00:00Z") } });
      await P.cashSession.update({ where: { id: tB1.id }, data: { opened_at: new Date("2026-11-25T02:00:00Z") } });
      await P.cashSession.update({ where: { id: t2.id }, data: { opened_at: new Date("2026-11-25T03:05:00Z") } });

      // Vendas: a de A às 22h de hoje em SP (01:00Z de 26/11), a de B às 23h30 de ontem em SP (02:30Z de 25/11).
      await P.emporioSale.update({ where: { id: vendaA }, data: { sold_at: new Date("2026-11-26T01:00:00Z") } });
      await P.emporioSale.update({ where: { id: vendaB }, data: { sold_at: new Date("2026-11-25T02:30:00Z") } });

      const dono = await ler(W, W.owner, AGORA_FIXO);
      check("dono: ok", dono.ok === true, j(dono));
      const orc = daChave(dono, "orcamento_vencendo");
      check("orçamentos vencendo: hoje, hoje+3 e o de B (hoje+1) entram; hoje+4 e ontem não: 3 no total",
        orc.length === 1 && Number(orc[0].quantidade) === 3, j(orc));
      const caix = daChave(dono, "caixa_de_ontem");
      check("caixa de dia anterior: os turnos de ontem 23h (A e B) entram, um aviso por turno; o de hoje 00h05 não",
        caix.length === 2 && caix.every((a) => Number(a.quantidade) === 1), j(caix));
      check("vendas de hoje seguem o dia de São Paulo: só a das 22h (20, 1 venda)",
        dono.ok && Number(dono.data.numeros.vendas_hoje.total) === 20 && Number(dono.data.numeros.vendas_hoje.quantidade) === 1, j(dono.ok && dono.data.numeros.vendas_hoje));
      check("vendas do mês: as duas (30) e mês anterior sem vendas continua null",
        dono.ok && Number(dono.data.numeros.vendas_mes.total) === 30 && dono.data.numeros.vendas_mes.variacao_pct === null, j(dono.ok && dono.data.numeros.vendas_mes));

      // Uma venda de 10 no mesmo trecho do mês anterior (1/10): a variação passa a existir. (30 - 10) / 10 = +200%.
      const vendaOut = await vender(W, "A", 1, cli);
      await P.emporioSale.update({ where: { id: vendaOut }, data: { sold_at: new Date("2026-10-01T15:00:00Z") } });
      const d2 = await ler(W, W.owner, AGORA_FIXO);
      check("com 10 no mesmo trecho do mês anterior, vendas_mes.total segue 30 e variacao_pct é +200",
        d2.ok && Number(d2.data.numeros.vendas_mes.total) === 30 && Math.abs(Number(d2.data.numeros.vendas_mes.variacao_pct) - 200) < 0.6, j(d2.ok && d2.data.numeros.vendas_mes));
      // Uma venda do mês anterior DEPOIS do dia 25 não entra no trecho comparado.
      const vendaTarde = await vender(W, "A", 1, cli);
      await P.emporioSale.update({ where: { id: vendaTarde }, data: { sold_at: new Date("2026-10-28T15:00:00Z") } });
      const d3 = await ler(W, W.owner, AGORA_FIXO);
      check("venda de 28/10 fica fora do trecho 1 a 25 do mês anterior: a variação segue +200",
        d3.ok && Math.abs(Number(d3.data.numeros.vendas_mes.variacao_pct) - 200) < 0.6, j(d3.ok && d3.data.numeros.vendas_mes));

      // ---------------------------------------------------------------------------------------- 6
      console.log("\n6. Gestor de A não enxerga a loja B (alcance)");
      const g = await ler(W, gestorA, AGORA_FIXO);
      check("gestor de A: ok", g.ok === true, j(g));
      const orcG = daChave(g, "orcamento_vencendo");
      check("orçamentos vencendo do gestor: 2 (hoje e hoje+3, da loja A); zero do de B", orcG.length === 1 && Number(orcG[0].quantidade) === 2, j(orcG));
      const caixG = daChave(g, "caixa_de_ontem");
      check("caixa de ontem do gestor: só o turno de A (1); zero do de B", caixG.length === 1 && Number(caixG[0].quantidade) === 1, j(caixG));
      const estG = daChave(g, "estoque_baixo");
      check("estoque baixo do gestor: só A (um aviso, um produto), zero do produto de B", estG.length === 1 && Number(estG[0].quantidade) === 1, j(estG));
      check("vendas de hoje do gestor: só a de A (20)", g.ok && Number(g.data.numeros.vendas_hoje.total) === 20, j(g.ok && g.data.numeros.vendas_hoje));
      const temB = JSON.stringify(g).includes(W.lojas.B);
      check("nenhum trecho da resposta do gestor cita a loja B", !temB, "a loja B apareceu");
    });

    // ------------------------------------------------------------------------------------------ 7
    await rodar("rota", async () => {
      console.log("\n7. A rota e dois tenants");
      const r1 = await chamar(W.tok.owner, R.inicio, "GET", "emporio/inicio");
      check("GET como dono de T1: 200", r1.status === 200, `${r1.status} ${j(r1.corpo)}`);
      check("devolve avisos (lista) e numeros", Array.isArray(r1.corpo?.data?.avisos) && !!r1.corpo?.data?.numeros, j(r1.corpo));
      const r2 = await chamar(W2.tok.owner, R.inicio, "GET", "emporio/inicio");
      check("GET como dono de T2: 200", r2.status === 200, `${r2.status} ${j(r2.corpo)}`);
      const n1 = r1.corpo?.data?.numeros, n2 = r2.corpo?.data?.numeros;
      check("T2 vê só a venda dela (50, 1 venda)", Number(n2?.vendas_hoje?.total) === 50 && Number(n2?.vendas_hoje?.quantidade) === 1, j(n2?.vendas_hoje));
      check("T1 não vê o número de T2: o total de hoje de T1 nunca é 50", Number(n1?.vendas_hoje?.total) !== 50 && Number(n1?.vendas_mes?.total) !== 50 + 30, j(n1?.vendas_mes));
      const av2 = (r2.corpo?.data?.avisos ?? []) as Dado[];
      check("T2: um estoque_baixo só, da loja dela, e nada de A ou B", av2.filter((a) => String(a.chave).startsWith("estoque_baixo")).length === 1
        && !JSON.stringify(av2).includes(W.lojas.A) && !JSON.stringify(av2).includes(W.lojas.B), j(av2));
      check("T2 não tem orçamento vencendo de T1 nem caixa de ontem", av2.every((a) => !String(a.chave).startsWith("caixa_de_ontem")), j(av2));
      const rc = await chamar(W.tok.caixa, R.inicio, "GET", "emporio/inicio");
      check("GET como caixa: 403", rc.status === 403, `${rc.status} ${j(rc.corpo)}`);
      const rv = await chamar(W.tok.vend, R.inicio, "GET", "emporio/inicio");
      check("GET como vendedor: 200 e nenhum aviso", rv.status === 200 && (rv.corpo?.data?.avisos ?? []).length === 0, `${rv.status} ${j(rv.corpo)}`);
      const rg = await chamar(W.tok.gestor, R.inicio, "GET", "emporio/inicio");
      check("GET como gestor: 200 e só a coluna gestor",
        rg.status === 200 && ((rg.corpo?.data?.avisos ?? []) as Dado[]).every((a) => a.coluna === "gestor"), `${rg.status} ${j(rg.corpo)}`);
      const rs = await chamar("", R.inicio, "GET", "emporio/inicio");
      check("GET sem token: 401", rs.status === 401, `${rs.status} ${j(rs.corpo)}`);
    });

    // ------------------------------------------------------------------------------------------ 8
    await rodar("dia de São Paulo, vendas e orçamentos", async () => {
      console.log("\n8. Dia de São Paulo: vendas e orçamentos (conta própria, relógio 26/11 01:30Z = 25/11 22:30 em SP)");
      const W3 = await montar("T3", ["A"], []);
      const c3 = await clienteCompleto(W3, "M131 Cliente T3");
      const orc = [
        { id: await orcamento(W3, "A", c3), dia: "2026-11-25", valor: 11 }, // hoje: entra
        { id: await orcamento(W3, "A", c3), dia: "2026-11-28", valor: 22 }, // hoje+3: entra
        { id: await orcamento(W3, "A", c3), dia: "2026-11-29", valor: 400 }, // hoje+4: fora
        { id: await orcamento(W3, "A", c3), dia: "2026-11-29", valor: 500 }, // hoje+4: fora
        { id: await orcamento(W3, "A", c3), dia: "2026-11-24", valor: 800 }, // ontem: fora
      ];
      for (const o of orc) await P.emporioQuote.update({ where: { id: o.id }, data: { valid_until: meioDia(o.dia), net_amount: o.valor } });

      // Vendas: 20 às 15h de hoje em SP (18:00Z de 25/11), 30 às 22h de hoje em SP (01:00Z de 26/11),
      // 50 às 23h de ontem em SP (02:00Z de 25/11), 40 de hoje cancelada.
      const v1 = await vender(W3, "A", 2, c3);
      const v2 = await vender(W3, "A", 3, c3);
      const v3 = await vender(W3, "A", 5, c3);
      const v4 = await vender(W3, "A", 4, c3);
      await P.emporioSale.update({ where: { id: v1 }, data: { sold_at: new Date("2026-11-25T18:00:00Z") } });
      await P.emporioSale.update({ where: { id: v2 }, data: { sold_at: new Date("2026-11-26T01:00:00Z") } });
      await P.emporioSale.update({ where: { id: v3 }, data: { sold_at: new Date("2026-11-25T02:00:00Z") } });
      await P.emporioSale.update({ where: { id: v4 }, data: { sold_at: new Date("2026-11-25T15:00:00Z"), status: "cancelada", canceled_at: new Date("2026-11-25T16:00:00Z") } });

      const r = await ler(W3, W3.owner, AGORA_FIXO);
      check("T3: ok", r.ok === true, j(r));
      const vh = r.ok ? r.data.numeros.vendas_hoje : null;
      check("vendas de hoje: 50 e 2 vendas (a das 15h e a das 22h de SP); a das 15h só entra no dia de São Paulo",
        !!vh && Number(vh.total) === 50 && Number(vh.quantidade) === 2, j(vh));
      check("a venda de ontem em SP (23h) não entra em hoje", !!vh && Number(vh.total) !== 100, j(vh));
      const vm = r.ok ? r.data.numeros.vendas_mes : null;
      check("vendas do mês: 100 (20 + 30 + 50), sem a cancelada", !!vm && Number(vm.total) === 100, j(vm));

      const oq = daChave(r, "orcamento_vencendo");
      check("orçamentos vencendo: entram hoje (11) e hoje+3 (22): 2 orçamentos, 33; fora hoje+4 (400 e 500) e ontem (800)",
        oq.length === 1 && Number(oq[0].quantidade) === 2 && Number(oq[0].valor) === 33, j(oq));

      // ---------------------------------------------------------------------------------------- 9
      console.log("\n9. Venda cancelada não conta");
      check("a cancelada de hoje (40) fora de Vendas hoje: total 50 e não 90, 2 vendas e não 3",
        !!vh && Number(vh.total) !== 90 && Number(vh.quantidade) === 2, j(vh));
      check("a cancelada de hoje (40) fora de Vendas no mês: total 100 e não 140", !!vm && Number(vm.total) !== 140 && Number(vm.total) === 100, j(vm));
    });

    // ------------------------------------------------------------------------------------------ 10
    await rodar("avisos de dinheiro", async () => {
      console.log("\n10. Avisos de dinheiro, Entra hoje e Sai hoje (conta própria, relógio real)");
      const W4 = await montar("T4", ["A"], ["gestor", "vend"]);
      const { scoped } = await import("@/lib/prisma");
      await P.emporioSettings.update({ where: { tenant_id: W4.tenantId }, data: { fiado_block_after_days: 365 } });
      const c4 = await clienteCompleto(W4, "M131 Cliente T4");
      const diaStr = (off: number) => new Date(Date.parse(`${hojeStr}T00:00:00Z`) + off * DIA).toISOString().slice(0, 10);
      const dataDia = (off: number) => new Date(`${diaStr(off)}T00:00:00Z`);
      const V: Dado = await import("@/lib/actions/emporio-vendas");
      const fiado = async (qtd: number, off: number) => {
        const rv = await V.venderAction(W4.db, W4.owner, {
          operation_key: chave("fiado"), customer_id: c4.id, establishment_id: W4.lojas.A, cash_register_id: W4.regs.A,
          items: [{ emporio_product_id: W4.prodId, presentation_id: W4.presId, quantity: qtd }],
          payments: [{ kind: "fiado", amount: qtd * 10, due_date: meioDia(diaStr(off)) }],
          ...(off < 0 ? { sold_at: new Date(Date.now() - (-off + 5) * DIA) } : {}),
        });
        if (!rv.ok) throw new Error(`fiado ${off}: ${j(rv)}`);
      };
      await fiado(4, -3); // vencido: 40
      await fiado(2.5, 0); // vence hoje: 25
      await fiado(1.5, 1); // vence amanhã: 15

      // Cheques e boleto: uma venda de dinheiro (10) por título, e o título aponta para o pagamento dela.
      const titulo = async () => {
        const sid = await vender(W4, "A", 1, c4);
        const pag = await P.emporioSalePayment.findFirst({ where: { sale_id: sid } });
        return { sale_id: sid, sale_payment_id: pag.id, customer_id: c4.id, establishment_id: W4.lojas.A, tenant_id: W4.tenantId };
      };
      await P.emporioCheck.create({ data: { ...(await titulo()), holder_name: "M131 emitente", amount: 30, status: "recebido", good_for: dataDia(-1) } });
      await P.emporioCheck.create({ data: { ...(await titulo()), holder_name: "M131 emitente", amount: 70, status: "recebido", good_for: dataDia(0) } });
      await P.emporioBoleto.create({ data: { ...(await titulo()), due_on: dataDia(-1), amount: 50, status: "aberto" } });

      // Pedidos de aprovação: dois pendentes (45 e 30) e um aprovado (999, não conta).
      for (const [total, status] of [[45, "pendente"], [30, "pendente"], [999, "aprovado"]] as const) {
        await P.emporioPaymentRequest.create({ data: { tenant_id: W4.tenantId, requested_by_user_id: W4.owner.id, entry_ids: [], total, status } });
      }

      // Linhas da conta sem conferir: uma de 20 sem carimbo, uma de 35 já conferida (não conta).
      const conta = await W4.db.bankAccount.create({ data: scoped({ name: "M131 Banco T4" }) });
      await W4.db.cashMovement.create({ data: scoped({ bank_account_id: conta.id, direction: "entrada", origin: "implantacao", amount: 20, occurred_at: new Date() }) });
      await W4.db.cashMovement.create({ data: scoped({ bank_account_id: conta.id, direction: "entrada", origin: "implantacao", amount: 35, occurred_at: new Date(), reconciled_at: new Date() }) });

      // A pagar: vencida (60), vence hoje (100) e vence amanhã (40, fora).
      const Compras: Dado = await import("@/lib/actions/emporio-compras");
      for (const [off, valor] of [[-1, 60], [0, 100], [1, 40]] as const) {
        const rc = await Compras.criarCompraAction(W4.db, W4.owner, {
          operation_key: chave("compra"), establishment_id: W4.lojas.A, purchased_at: new Date(), received: true, freight: 0,
          items: [{ emporio_product_id: W4.prodId, quantity: 10, item_total: valor }],
          payment: { kind: "a_prazo", due_date: meioDia(diaStr(off)) },
        });
        if (!rc.ok) throw new Error(`compra ${off}: ${j(rc)}`);
      }

      const d = await ler(W4, W4.owner);
      check("T4: dono ok", d.ok === true, j(d));
      const um = (c: string) => daChave(d, c)[0];
      const fv = um("fiado_vencido");
      check("fiado vencido: 1 cliente, 40 (o de hoje e o de amanhã ficam de fora)", daChave(d, "fiado_vencido").length === 1 && Number(fv?.quantidade) === 1 && Number(fv?.valor) === 40, j(fv));
      const bc = um("boleto_cheque_vencido");
      check("boleto ou cheque vencido: 2 (o cheque de ontem e o boleto de ontem), 80", daChave(d, "boleto_cheque_vencido").length === 1 && Number(bc?.quantidade) === 2 && Number(bc?.valor) === 80, j(bc));
      check("fronteira do cheque: o cheque bom para HOJE (70) não está vencido, só o de ontem (30) entra", Number(bc?.quantidade) === 2 && Number(bc?.valor) !== 150, j(bc));
      const ap = um("aprovacao_pendente");
      check("aprovação pendente: 2 pedidos, 75 (o aprovado de 999 não conta)", daChave(d, "aprovacao_pendente").length === 1 && Number(ap?.quantidade) === 2 && Number(ap?.valor) === 75, j(ap));
      const cb = um("conferir_banco");
      check("linha sem conferir: 1, 20 (a conferida de 35 não conta)", daChave(d, "conferir_banco").length === 1 && Number(cb?.quantidade) === 1 && Number(cb?.valor) === 20, j(cb));
      const pg = um("pagar_hoje");
      check("pagar hoje: 2 contas (a vencida e a de hoje), 160", daChave(d, "pagar_hoje").length === 1 && Number(pg?.quantidade) === 2 && Number(pg?.valor) === 160, j(pg));

      check("concordância no plural: 2 contas a pagar vencidas ou vencendo hoje",
        pg?.texto === "2 contas a pagar vencidas ou vencendo hoje", j(pg));
      check("concordância no plural: 2 boletos e cheques vencidos sem baixa",
        bc?.texto === "2 boletos e cheques vencidos sem baixa", j(bc));

      const n = d.ok ? d.data.numeros : null;
      check("Entra hoje: 215 (fiado 40 + 25, cheques 30 + 70, boleto 50); o fiado de amanhã (15) fica de fora",
        !!n?.entra_hoje && Number(n.entra_hoje.total) === 215, j(n?.entra_hoje));
      check("Sai hoje: 160 e 2 contas (a vencida 60 e a de hoje 100); a de amanhã (40) fica de fora",
        !!n?.sai_hoje && Number(n.sai_hoje.total) === 160 && Number(n.sai_hoje.quantidade) === 2, j(n?.sai_hoje));

      for (const [rotulo, quem] of [["gestor", W4.users.gestor], ["vendedor", W4.users.vend]] as const) {
        const x = await ler(W4, quem);
        check(`${rotulo}: com dinheiro em aberto na conta, Entra hoje e Sai hoje continuam nulos`,
          x.ok && x.data.numeros.entra_hoje === null && x.data.numeros.sai_hoje === null, j(x.ok && x.data.numeros));
        check(`${rotulo}: nenhum aviso de dinheiro`,
          ["fiado_vencido", "pagar_hoje", "aprovacao_pendente", "boleto_cheque_vencido", "conferir_banco"].every((c) => daChave(x, c).length === 0), j(avisosDe(x)));
      }
    });

    // ------------------------------------------------------------------------------------------ 11
    await rodar("concordância no singular", async () => {
      console.log("\n11. Concordância no singular: 1 conta a pagar e 1 boleto vencido (conta própria)");
      const W5 = await montar("T5", ["A"], []);
      const c5 = await clienteCompleto(W5, "M131 Cliente T5");
      const diaStr = (off: number) => new Date(Date.parse(`${hojeStr}T00:00:00Z`) + off * DIA).toISOString().slice(0, 10);
      const Compras: Dado = await import("@/lib/actions/emporio-compras");
      const rc = await Compras.criarCompraAction(W5.db, W5.owner, {
        operation_key: chave("compra5"), establishment_id: W5.lojas.A, purchased_at: new Date(), received: true, freight: 0,
        items: [{ emporio_product_id: W5.prodId, quantity: 10, item_total: 100 }],
        payment: { kind: "a_prazo", due_date: meioDia(diaStr(0)) },
      });
      if (!rc.ok) throw new Error(`compra T5: ${j(rc)}`);
      const sid = await vender(W5, "A", 1, c5);
      const pag = await P.emporioSalePayment.findFirst({ where: { sale_id: sid } });
      await P.emporioBoleto.create({
        data: { sale_id: sid, sale_payment_id: pag.id, customer_id: c5.id, establishment_id: W5.lojas.A, tenant_id: W5.tenantId, due_on: new Date(`${diaStr(-1)}T00:00:00Z`), amount: 50, status: "aberto" },
      });
      const d = await ler(W5, W5.owner);
      const pg = daChave(d, "pagar_hoje")[0];
      const bc = daChave(d, "boleto_cheque_vencido")[0];
      check("singular: 1 conta a pagar vencida ou vencendo hoje", pg?.texto === "1 conta a pagar vencida ou vencendo hoje", j(pg));
      check("singular: 1 boleto ou cheque vencido sem baixa", bc?.texto === "1 boleto ou cheque vencido sem baixa", j(bc));
    });
  } finally {
    const cru = P;
    for (const id of tenantIds.reverse()) {
      const por = { where: { tenant_id: id } };
      await cru.emporioSale.updateMany({ ...por, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } }).catch(() => undefined);
      await cru.emporioQuote.updateMany({ ...por, data: { sale_id: null, based_on_quote_id: null } }).catch(() => undefined);
      for (const m of ["emporioPaymentRequest", "cashMovement", "cashCount", "cashHandover", "cardAnticipation", "productionEntry", "stockTransfer", "emporioCheck", "emporioBoleto"]) {
        await cru[m].deleteMany(por).catch(() => undefined);
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
    console.log(falhas === 0 ? "\n✅ M131 (Módulo 39, Empório): a leitura do Início passou." : `\n❌ M131 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
    // Como as outras suítes: a rota de token deixa o Redis aberto e o processo não encerra sozinho.
    process.exit(falhas === 0 ? 0 : 1);
  });
