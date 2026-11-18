import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M125: Módulo 39 (Meu Empório), paginação das listas (dívida 5.26, Q366) e acertos da curva ABC (dívida 5.27, Q367).
 * Roda: `npm run test:m125`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-18-emporio-paginacao-listas-design.md e do bloco Interfaces da
 * Task 1 do plano, sem ler a implementação nova. Cada lista é provada pela ACTION (retorno `{ linhas, total, page,
 * per_page }`) e pela ROTA (`data` = linhas, `meta` = `{ total, page, per_page }`).
 *
 * Seção 1: vendas.            Seção 2: compras.        Seção 3: transferências.   Seção 4: produções.
 * Seção 5: antecipações.      Seção 6: entregas.       Seção 7: conferências.     Seção 8: movimentos do caixa.
 * Seção 9: pedidos de pagamento (pula com aviso se a action não aceitar `page`).
 * Seção 10: curva ABC fechando em 100,00 e `podeVerLucroAction`.
 *
 * Fixtures: vendas pelas rotas; compras, transferências, produções, antecipações, entregas, conferências e movimentos
 * por insert direto (a suíte só prova a LISTA, e 45 registros pelo caminho de negócio custariam minutos). Cada lista
 * usa uma loja própria. Antecipação não tem loja: o total é o da conta de teste (ninguém mais as cria nela).
 *
 * Leituras adotadas onde a spec era ambígua (ver o relato):
 * - o `limit` sem `page` é provado nas listas cujo `opts` já tem `limit` (vendas, compras, transferências, produções
 *   e conferências); a action devolve `{ linhas }` mesmo assim;
 * - `lerCaixaAction` não ganhou `order` no contrato: a ordem crescente dos movimentos não é provada;
 * - conferências e movimentos usam o banco como oráculo da ordem (o turno de teste já grava a contagem de abertura
 *   e movimentos próprios, então o total passa de 45);
 * - o 422 de `per_page` nos movimentos aceita o campo `per_page` ou `mov_per_page`.
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

console.log("📄 M125: Módulo 39 (Meu Empório), paginação das listas e curva ABC (Q366, Q367)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];
const brDia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
const somaDias = (s: string, k: number) => new Date(new Date(`${s}T12:00:00Z`).getTime() + k * DIA).toISOString().slice(0, 10);
const HOJE = brDia(new Date());
const AGORA = Date.now();

type Ator = { id: string; role: "OWNER" | "OPERADOR"; email?: string };
type Mundo = {
  rotulo: string;
  tenantId: string;
  db: Dado;
  owner: Ator;
  tok: { owner: string; vend: string; gestor: string };
  gestorId: string;
  vend: Ator;
  gestor: Ator;
  categoriaId: string;
};

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture } = await import("./_emporio-papel");
  const bcrypt = (await import("bcryptjs")).default;
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M125 ${rotulo} ${stamp}`, document: `M125${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Ator> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M125 ${suf}`, email: `m125-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id as string, role, email: u.email as string };
  };
  const owner = await mk("own", "OWNER");
  const vend = await mk("vend", "OPERADOR");
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });

  const db = prismaForTenant(t.id) as Dado;
  const cat = await db.productCategory.create({ data: scoped({ name: `M125 categoria ${rotulo}` }) });
  const token = async (u: Ator) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  return {
    rotulo, tenantId: t.id, db, owner, vend, gestor, gestorId: gestor.id, categoriaId: cat.id as string,
    tok: { owner: await token(owner), vend: await token(vend), gestor: await token(gestor) },
  };
}

const R = {
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  purchases: () => import("@/app/api/v1/emporio/purchases/route"),
  transfers: () => import("@/app/api/v1/emporio/transfers/route"),
  production: () => import("@/app/api/v1/emporio/production/route"),
  anticipations: () => import("@/app/api/v1/emporio/card-anticipations/route"),
  handovers: () => import("@/app/api/v1/emporio/cash/handovers/route"),
  counts: () => import("@/app/api/v1/emporio/cash/counts/route"),
  cash: () => import("@/app/api/v1/emporio/cash/route"),
  abc: () => import("@/app/api/v1/emporio/reports/abc/route"),
  paymentRequests: () => import("@/app/api/v1/emporio/finance/payment-requests/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, url: string, corpo?: unknown): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  const metodo = corpo === undefined ? "GET" : "POST";
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
    const res = await withBearer(tok, (): Promise<Response> => m[metodo](req));
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
  } catch (e) {
    return { status: 0, corpo: { throw: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
}
const ok2xx = (r: Resp) => r.status >= 200 && r.status < 300;
const dados = (r: Resp): Dado => r.corpo?.data;
const resumo = (r: Resp) => `${r.status} ${j(r.corpo).slice(0, 260)}`;
const qs = (p: Record<string, string>) => new URLSearchParams(p).toString();

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 6).join(" | ").slice(0, 700) : String(e));
  }
}

// --- fixtures ---

let seq = 0;
const chave = (p: string) => `m125-${p}-${stamp}-${(seq += 1)}`;
const prismaCru = async (): Promise<Dado> => (await import("@/lib/prisma")).prisma as Dado;

type Loja = { id: string; reg: string };
async function novaLoja(w: Mundo, nome: string): Promise<Loja> {
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const l = await Cat.criarEstabelecimentoAction(w.db, w.owner, { name: `M125 ${w.rotulo} ${nome} ${stamp}` });
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

async function vender(w: Mundo, loja: Loja, clienteId: string, itens: { p: Prod; qty: number }[], quando?: string): Promise<string> {
  const total = itens.reduce((s, i) => s + i.p.preco * i.qty, 0);
  const r = await chamar(w.tok.owner, R.sales, "emporio/sales", {
    operation_key: chave("venda"),
    establishment_id: loja.id,
    cash_register_id: loja.reg,
    customer_id: clienteId,
    items: itens.map((i) => ({ emporio_product_id: i.p.id, presentation_id: i.p.presId, quantity: i.qty })),
    payments: [{ kind: "dinheiro", amount: total }],
  });
  if (!ok2xx(r)) throw new Error(`venda: ${resumo(r)}`);
  const id = String(dados(r).id);
  if (quando) await (await prismaCru()).emporioSale.update({ where: { id }, data: { sold_at: new Date(quando) } });
  return id;
}

let A = null as unknown as Mundo;
let B = null as unknown as Mundo;

// ---------------------------------------------------------------------------
// O gabarito comum das listas
// ---------------------------------------------------------------------------

type Filtro = { rotulo: string; opts: Dado; params: Record<string, string>; total: number };
type Cfg = {
  nome: string;
  /** Ids do mais antigo ao mais novo, na ordem natural da lista (o `desc` é o inverso). */
  maisAntigoPrimeiro: string[];
  /** Chama a action com `opts` (já com `page`, `per_page`, `order`). */
  acao: (opts: Dado) => Promise<Dado>;
  /** Chama a rota com a query (já com `page`, `per_page`, `order`); `extraRota` junta o escopo (loja). */
  rota: (params: Record<string, string>) => Promise<Resp>;
  /** Onde a rota põe as linhas e o meta (padrão: `data` e `meta`). */
  linhasDaRota?: (r: Resp) => Dado[];
  metaDaRota?: (r: Resp) => Dado;
  semOrdem?: boolean;
  /** Spec (exceção): as entregas pendentes têm padrão `asc`, a mais antiga primeiro (a próxima a confirmar). */
  padraoAsc?: boolean;
  /** Lista composta (caixa): sem `page` vale o retorno de hoje, não a página 1 de 20. */
  limiteAntigoSemPagina?: boolean;
  limite?: boolean;
  filtros?: Filtro[];
  /** Total que o Dono de outro tenant lê (a mesma action, sem escopo de loja). */
  outroTenant: () => Promise<Dado>;
};

const idsDe = (linhas: Dado[]): string[] => linhas.map((x) => String(x.id));

async function gabarito(c: Cfg) {
  const velhos = c.maisAntigoPrimeiro;
  const n = velhos.length;
  const novos = [...velhos].reverse();
  const ultima = Math.ceil(n / 20);
  const tamUltima = n - 20 * (ultima - 1);
  check(`fixture: ${n} registros (mais de duas páginas de 20)`, n > 40, `${n}`);

  const pagina = async (page: number, per_page = 20, order?: string) =>
    c.acao({ page, per_page, ...(order ? { order } : {}) });
  const forma = (r: Dado) => r?.ok === true && Array.isArray(r.data?.linhas) && typeof r.data?.total === "number";

  console.log("  (a) 20 por página");
  const r1 = await pagina(1);
  const r2 = await pagina(2);
  const r3 = await pagina(3);
  check("a action devolve { linhas, total, page, per_page }", forma(r1) && r1.data.page === 1 && r1.data.per_page === 20, j(r1).slice(0, 300));
  const l = (r: Dado): Dado[] => (forma(r) ? r.data.linhas : []);
  check(`páginas de 20, 20 e ${tamUltima} linhas`, j([l(r1).length, l(r2).length, l(r3).length]) === j([20, 20, tamUltima]), j([l(r1).length, l(r2).length, l(r3).length]));
  check(`total ${n} nas três`, [r1, r2, r3].every((r) => r?.data?.total === n), j([r1?.data?.total, r2?.data?.total, r3?.data?.total]));
  check("page e per_page ecoados (2 e 3)", r2?.data?.page === 2 && r3?.data?.page === 3 && r3?.data?.per_page === 20);
  const todos = [...idsDe(l(r1)), ...idsDe(l(r2)), ...idsDe(l(r3))];
  check("as páginas cobrem todos os registros, sem repetir", new Set(todos).size === n && todos.length === n && velhos.every((id) => todos.includes(id)), `${new Set(todos).size} de ${todos.length}`);
  if (c.padraoAsc) check("padrão asc (exceção da spec): a concatenação é do mais antigo ao mais novo", j(todos) === j(velhos), j(todos.slice(0, 3)));
  else check("padrão desc: a concatenação é do mais novo ao mais antigo", j(todos) === j(novos), j(todos.slice(0, 3)));
  const semNada = await c.acao({});
  if (c.limiteAntigoSemPagina) {
    check("sem page: o corte antigo continua (todas as linhas até o limit padrão)", semNada?.ok === true && semNada.data.linhas.length === Math.min(n, 100), j(semNada).slice(0, 200));
  } else {
    check("sem page, per_page nem limit: página 1 de 20", forma(semNada) && semNada.data.linhas.length === 20 && semNada.data.page === 1 && semNada.data.per_page === 20 && semNada.data.total === n, j(semNada).slice(0, 200));
  }

  console.log("  (b) ordem crescente");
  if (c.semOrdem) console.log("  (sem `order` no contrato desta lista, pulado)");
  else {
    const a1 = await pagina(1, 20, "asc");
    const a2 = await pagina(2, 20, "asc");
    const a3 = await pagina(3, 20, "asc");
    check("order=asc: a concatenação é do mais antigo ao mais novo", j([...idsDe(l(a1)), ...idsDe(l(a2)), ...idsDe(l(a3))]) === j(velhos), j(idsDe(l(a1)).slice(0, 2)));
    check("order=asc: a página 1 começa no mais antigo", idsDe(l(a1))[0] === velhos[0]);
    const x = await c.acao({ page: 1, per_page: 20, order: "desc" });
    if (c.padraoAsc) check("order=desc explícito: começa no mais novo", idsDe(l(x))[0] === novos[0], j(idsDe(l(x)).slice(0, 2)));
    else check("order=desc explícito igual ao padrão", j(idsDe(l(x))) === j(idsDe(l(r1))));
  }

  console.log("  (c) além da última, tamanhos e recusa");
  const alem = await pagina(99);
  check(`página 99 devolve a última (página ${ultima}, ${tamUltima} linhas)`, forma(alem) && alem.data.page === ultima && alem.data.linhas.length === tamUltima && j(idsDe(alem.data.linhas)) === j(idsDe(l(r3))), j(alem).slice(0, 200));
  const p40 = await pagina(2, 40);
  check(`per_page=40, página 2: ${n - 40} linhas`, forma(p40) && p40.data.linhas.length === n - 40 && p40.data.per_page === 40 && p40.data.page === 2, j(p40).slice(0, 200));
  const p100 = await pagina(1, 100);
  check(`per_page=100: ${n} linhas numa página`, forma(p100) && p100.data.linhas.length === n && p100.data.per_page === 100, j(p100).slice(0, 200));
  const p80 = await pagina(1, 80);
  check(`per_page=80: ${n} linhas`, forma(p80) && p80.data.linhas.length === n, j(p80).slice(0, 200));
  const p30 = await pagina(1, 30);
  check("action com per_page=30: recusa 422 em per_page", p30?.ok === false && p30.status === 422 && /per_page/.test(String(p30.field)), j(p30).slice(0, 200));

  console.log("  (d) pela rota");
  const linhasR = c.linhasDaRota ?? ((r: Resp) => (Array.isArray(r.corpo?.data) ? r.corpo.data : []));
  const metaR = c.metaDaRota ?? ((r: Resp) => r.corpo?.meta ?? {});
  const q1 = await c.rota({ page: "1", per_page: "20" });
  const q3 = await c.rota({ page: "3", per_page: "20" });
  check("a rota responde 200", q1.status === 200, resumo(q1));
  check("data traz 20 linhas e meta { total, page, per_page }", linhasR(q1).length === 20 && metaR(q1).total === n && metaR(q1).page === 1 && metaR(q1).per_page === 20, resumo(q1));
  check(`página 3 pela rota: ${tamUltima} linhas e page 3`, linhasR(q3).length === tamUltima && metaR(q3).page === 3, resumo(q3));
  check("as linhas da rota são as mesmas da action", j(idsDe(linhasR(q1))) === j(idsDe(l(r1))));
  if (!c.semOrdem) {
    const qa = await c.rota({ page: "1", per_page: "20", order: "asc" });
    check("rota com order=asc começa no mais antigo", idsDe(linhasR(qa))[0] === velhos[0], resumo(qa));
  }
  const qAlem = await c.rota({ page: "99", per_page: "20" });
  check("rota com page=99 devolve a última", qAlem.status === 200 && metaR(qAlem).page === ultima, resumo(qAlem));
  const q30 = await c.rota({ per_page: "30" });
  check("rota com per_page=30: 422 em per_page", q30.status === 422 && /per_page/.test(String(q30.corpo?.error?.field)), resumo(q30));

  if (c.limite) {
    console.log("  (e) limit sem page continua como antes");
    const lim = await c.acao({ limit: 7 });
    check("limit=7 sem page: 7 linhas", lim?.ok === true && Array.isArray(lim.data?.linhas) && lim.data.linhas.length === 7, j(lim).slice(0, 200));
    const limR = await c.rota({ limit: "7" });
    check("rota com limit=7 sem page: 7 linhas", limR.status === 200 && linhasR(limR).length === 7, resumo(limR));
  }

  if (c.filtros?.length) {
    console.log("  (f) filtro com o total certo");
    for (const f of c.filtros) {
      const pagina1 = await c.acao({ ...f.opts, page: 1, per_page: 20 });
      check(`${f.rotulo}: total ${f.total} e ${Math.min(20, f.total)} linhas na página 1`, forma(pagina1) && pagina1.data.total === f.total && pagina1.data.linhas.length === Math.min(20, f.total), j(pagina1).slice(0, 220));
      const rf = await c.rota({ ...f.params, page: "1", per_page: "20" });
      check(`${f.rotulo}: a rota tem meta.total ${f.total}`, rf.status === 200 && metaR(rf).total === f.total, resumo(rf));
      if (f.total > 20) {
        const pagina2 = await c.acao({ ...f.opts, page: 2, per_page: 20 });
        const esperadas = Math.min(20, f.total - 20);
        check(`${f.rotulo}: página 2 com ${esperadas} linhas`, forma(pagina2) && pagina2.data.linhas.length === esperadas, j(pagina2).slice(0, 200));
      }
    }
  }

  console.log("  (g) outro tenant");
  const o = await c.outroTenant();
  check("o Dono de B lê total 0 e nenhuma linha", o?.ok === true && o.data?.total === 0 && Array.isArray(o.data?.linhas) && o.data.linhas.length === 0, j(o).slice(0, 200));
}

// ---------------------------------------------------------------------------
// Seção 1: vendas
// ---------------------------------------------------------------------------

async function secao1() {
  secaoAtual = "1";
  console.log("1. Vendas: 45 vendas pela rota (listarVendasAction, GET emporio/sales)");
  const V = await import("@/lib/actions/emporio-vendas");
  const L = await novaLoja(A, "Vendas");
  const cliA = await novoCliente(A, "M125 CliVA");
  const cliB = await novoCliente(A, "M125 CliVB");
  const P = await novoProd(A, "M125 ProdV", 10, [L]);
  const ids: string[] = [];
  for (let k = 0; k < 45; k += 1) {
    const quando = new Date(AGORA - (45 - k) * 3_600_000).toISOString();
    ids.push(await vender(A, L, k >= 38 ? cliB.id : cliA.id, [{ p: P, qty: 1 }], quando));
  }
  await gabarito({
    nome: "vendas",
    maisAntigoPrimeiro: ids,
    acao: (o) => V.listarVendasAction(A.db, A.owner, { establishment_id: L.id, ...o }),
    rota: (p) => chamar(A.tok.owner, R.sales, `emporio/sales?${qs({ establishment_id: L.id, ...p })}`),
    limite: true,
    filtros: [
      { rotulo: "customer_id do cliente B", opts: { customer_id: cliB.id }, params: { customer_id: cliB.id }, total: 7 },
      { rotulo: "status=concluida", opts: { status: "concluida" }, params: { status: "concluida" }, total: 45 },
      { rotulo: "status=cancelada", opts: { status: "cancelada" }, params: { status: "cancelada" }, total: 0 },
    ],
    outroTenant: () => V.listarVendasAction(B.db, B.owner, { page: 1, per_page: 20 }),
  });
}

// ---------------------------------------------------------------------------
// Seção 2: compras
// ---------------------------------------------------------------------------

async function secao2() {
  secaoAtual = "2";
  console.log("\n2. Compras: 45 compras (listarComprasAction, GET emporio/purchases)");
  const C = await import("@/lib/actions/emporio-compras");
  const prisma = await prismaCru();
  const L = await novaLoja(A, "Compras");
  const forn = await prisma.emporioSupplier.create({ data: { tenant_id: A.tenantId, kind: "externo", name: `M125 Fornecedor ${stamp}`, person_kind: "pj" } });
  const ids: string[] = [];
  for (let k = 0; k < 45; k += 1) {
    const c = await prisma.emporioPurchase.create({
      data: {
        tenant_id: A.tenantId, establishment_id: L.id, operation_key: chave("compra"),
        purchased_at: new Date(AGORA - (45 - k) * 3_600_000), ...(k < 7 ? { supplier_id: forn.id } : {}),
      },
    });
    ids.push(c.id as string);
  }
  const base = (o: Dado): Promise<Dado> => C.listarComprasAction(A.db, A.owner, { establishment_id: L.id, ...o });
  // o filtro de situação vem depois do gabarito: 5 canceladas e 3 recebidas, entre as 45
  const marcar = async () => {
    await prisma.emporioPurchase.updateMany({ where: { id: { in: ids.slice(10, 15) } }, data: { canceled_at: new Date(), canceled_reason: "teste M125" } });
    await prisma.emporioPurchase.updateMany({ where: { id: { in: ids.slice(20, 23) } }, data: { received_at: new Date() } });
  };
  await gabarito({
    nome: "compras",
    maisAntigoPrimeiro: ids,
    acao: base,
    rota: (p) => chamar(A.tok.owner, R.purchases, `emporio/purchases?${qs({ establishment_id: L.id, ...p })}`),
    limite: true,
    filtros: [{ rotulo: "supplier_id", opts: { supplier_id: forn.id }, params: { supplier_id: forn.id }, total: 7 }],
    outroTenant: () => C.listarComprasAction(B.db, B.owner, { page: 1, per_page: 20 }),
  });
  await marcar();
  console.log("  (h) situação depois de marcar 5 canceladas e 3 recebidas");
  const l = (r: Dado) => r?.data?.total;
  check("status=cancelada: total 5", l(await base({ status: "cancelada", page: 1, per_page: 20 })) === 5);
  check("status=recebida: total 3", l(await base({ status: "recebida", page: 1, per_page: 20 })) === 3);
  const pend = await base({ status: "pendente", page: 1, per_page: 20 });
  check("status=pendente: total 37 e 20 linhas na página 1", l(pend) === 37 && pend?.data?.linhas?.length === 20, j(pend).slice(0, 200));
  const rc = await chamar(A.tok.owner, R.purchases, `emporio/purchases?${qs({ establishment_id: L.id, status: "cancelada", page: "1", per_page: "20" })}`);
  check("rota com status=cancelada: meta.total 5", rc.status === 200 && rc.corpo?.meta?.total === 5, resumo(rc));
  check("sem filtro o total continua 45", l(await base({ page: 1, per_page: 20 })) === 45);
}

// ---------------------------------------------------------------------------
// Seção 3: transferências
// ---------------------------------------------------------------------------

async function secao3() {
  secaoAtual = "3";
  console.log("\n3. Transferências: 45 transferências (listarTransferenciasAction, GET emporio/transfers)");
  const T = await import("@/lib/actions/emporio-transferencias");
  const prisma = await prismaCru();
  const L1 = await novaLoja(A, "TransA");
  const L2 = await novaLoja(A, "TransB");
  const L3 = await novaLoja(A, "TransC");
  const ids: string[] = [];
  for (let k = 0; k < 45; k += 1) {
    const t = await prisma.stockTransfer.create({
      data: {
        tenant_id: A.tenantId, origin_establishment_id: k < 3 ? L3.id : L1.id, destination_establishment_id: L2.id,
        operation_key: chave("transf"), sent_at: new Date(AGORA - (45 - k) * 3_600_000),
      },
    });
    ids.push(t.id as string);
  }
  const base = (o: Dado): Promise<Dado> => T.listarTransferenciasAction(A.db, A.owner, { establishment_id: L2.id, ...o });
  await gabarito({
    nome: "transferências",
    maisAntigoPrimeiro: ids,
    acao: base,
    rota: (p) => chamar(A.tok.owner, R.transfers, `emporio/transfers?${qs({ establishment_id: L2.id, ...p })}`),
    limite: true,
    filtros: [{ rotulo: "loja de origem L3 (OU destino)", opts: { establishment_id: L3.id }, params: { establishment_id: L3.id }, total: 3 }],
    outroTenant: () => T.listarTransferenciasAction(B.db, B.owner, { page: 1, per_page: 20 }),
  });
  await prisma.stockTransfer.updateMany({ where: { id: { in: ids.slice(10, 15) } }, data: { status: "cancelada", canceled_at: new Date(), canceled_reason: "teste M125" } });
  console.log("  (h) status depois de cancelar 5");
  const canc = await base({ status: "cancelada", page: 1, per_page: 20 });
  check("status=cancelada: total 5", canc?.data?.total === 5, j(canc).slice(0, 200));
  const tr = await base({ status: "em_transito", page: 1, per_page: 20 });
  check("status=em_transito: total 40 e 20 linhas", tr?.data?.total === 40 && tr?.data?.linhas?.length === 20, j(tr).slice(0, 200));
  const rc = await chamar(A.tok.owner, R.transfers, `emporio/transfers?${qs({ establishment_id: L2.id, status: "cancelada", page: "1", per_page: "20" })}`);
  check("rota com status=cancelada: meta.total 5", rc.status === 200 && rc.corpo?.meta?.total === 5, resumo(rc));
}

// ---------------------------------------------------------------------------
// Seção 4: produções
// ---------------------------------------------------------------------------

async function secao4() {
  secaoAtual = "4";
  console.log("\n4. Produções: 45 produções (listarProducoesAction, GET emporio/production)");
  const P = await import("@/lib/actions/emporio-producao");
  const prisma = await prismaCru();
  const L = await novaLoja(A, "Producao");
  const p1 = await novoProd(A, "M125 ProdP1", 10, [L]);
  const p2 = await novoProd(A, "M125 ProdP2", 10, [L]);
  const ids: string[] = [];
  for (let k = 0; k < 45; k += 1) {
    const e = await prisma.productionEntry.create({
      data: {
        tenant_id: A.tenantId, establishment_id: L.id, emporio_product_id: k < 4 ? p2.id : p1.id, operation_key: chave("prod"),
        produced_qty: 1, composition_snapshot: [], created_at: new Date(AGORA - (45 - k) * 3_600_000),
      },
    });
    ids.push(e.id as string);
  }
  const base = (o: Dado): Promise<Dado> => P.listarProducoesAction(A.db, A.owner, { establishment_id: L.id, ...o });
  await gabarito({
    nome: "produções",
    maisAntigoPrimeiro: ids,
    acao: base,
    rota: (p) => chamar(A.tok.owner, R.production, `emporio/production?${qs({ establishment_id: L.id, ...p })}`),
    limite: true,
    filtros: [{ rotulo: "emporio_product_id do produto P2", opts: { emporio_product_id: p2.id }, params: { emporio_product_id: p2.id }, total: 4 }],
    outroTenant: () => P.listarProducoesAction(B.db, B.owner, { page: 1, per_page: 20 }),
  });
  await prisma.productionEntry.updateMany({ where: { id: { in: ids.slice(10, 15) } }, data: { canceled_at: new Date(), canceled_reason: "teste M125" } });
  console.log("  (h) status depois de cancelar 5");
  const canc = await base({ status: "cancelada", page: 1, per_page: 20 });
  check("status=cancelada: total 5", canc?.data?.total === 5, j(canc).slice(0, 200));
  const at = await base({ status: "ativa", page: 1, per_page: 20 });
  check("status=ativa: total 40 e 20 linhas", at?.data?.total === 40 && at?.data?.linhas?.length === 20, j(at).slice(0, 200));
}

// ---------------------------------------------------------------------------
// Seção 5: antecipações
// ---------------------------------------------------------------------------

async function secao5() {
  secaoAtual = "5";
  console.log("\n5. Antecipações: 45 operações (listarAntecipacoesAction, GET emporio/card-anticipations)");
  const An = await import("@/lib/actions/emporio-antecipacao");
  const prisma = await prismaCru();
  const conta = await prisma.bankAccount.create({ data: { tenant_id: A.tenantId, name: `M125 Conta ${stamp}` } });
  const base0 = somaDias(HOJE, -60);
  const dia = (k: number) => somaDias(base0, k);
  const ids: string[] = [];
  for (let k = 0; k < 45; k += 1) {
    const a = await prisma.cardAnticipation.create({
      data: {
        tenant_id: A.tenantId, bank_account_id: conta.id, operated_on: new Date(`${dia(k)}T00:00:00Z`), kind: "pontual",
        gross_amount: 100, expected_net: 98, received_net: 98, fee_amount: 2,
      },
    });
    ids.push(a.id as string);
  }
  await gabarito({
    nome: "antecipações",
    maisAntigoPrimeiro: ids,
    acao: (o) => An.listarAntecipacoesAction(A.db, A.owner, o),
    rota: (p) => chamar(A.tok.owner, R.anticipations, `emporio/card-anticipations?${qs(p)}`),
    filtros: [
      {
        rotulo: "de e ate (5 dias, os dois extremos)",
        opts: { de: new Date(`${dia(40)}T00:00:00Z`), ate: new Date(`${dia(44)}T00:00:00Z`) },
        params: { de: dia(40), ate: dia(44) },
        total: 5,
      },
    ],
    outroTenant: () => An.listarAntecipacoesAction(B.db, B.owner, { page: 1, per_page: 20 }),
  });
}

// ---------------------------------------------------------------------------
// Seção 6: entregas
// ---------------------------------------------------------------------------

async function secao6() {
  secaoAtual = "6";
  console.log("\n6. Entregas do caixa: 45 sangrias pendentes (listarEntregasAction, GET emporio/cash/handovers)");
  const Tu = await import("@/lib/actions/emporio-turno");
  const prisma = await prismaCru();
  const L = await novaLoja(A, "Entregas");
  const sessao = await prisma.cashSession.findFirst({ where: { open_register_id: L.reg }, select: { id: true } });
  if (!sessao) throw new Error("a loja de entregas não tem turno aberto");
  const ids: string[] = [];
  for (let k = 0; k < 45; k += 1) {
    const h = await prisma.cashHandover.create({
      data: {
        tenant_id: A.tenantId, establishment_id: L.id, cash_register_id: L.reg, cash_session_id: sessao.id, kind: "sangria",
        amount: 10, operation_key: chave("entrega"), created_by_user_id: A.owner.id, created_at: new Date(AGORA - (45 - k) * 3_600_000),
      },
    });
    ids.push(h.id as string);
  }
  const base = (o: Dado): Promise<Dado> => Tu.listarEntregasAction(A.db, A.owner, { establishment_id: L.id, ...o });
  await gabarito({
    nome: "entregas",
    maisAntigoPrimeiro: ids,
    padraoAsc: true,
    acao: base,
    rota: (p) => chamar(A.tok.owner, R.handovers, `emporio/cash/handovers?${qs({ establishment_id: L.id, ...p })}`),
    outroTenant: () => Tu.listarEntregasAction(B.db, B.owner, { page: 1, per_page: 20 }),
  });
  await prisma.cashHandover.updateMany({
    where: { id: { in: ids.slice(0, 5) } },
    data: { confirmed_at: new Date(), confirmed_by_user_id: A.owner.id, received_amount: 10, difference: 0 },
  });
  console.log("  (h) status depois de confirmar 5");
  const conf = await base({ status: "confirmed", page: 1, per_page: 20 });
  check("status=confirmed: total 5", conf?.data?.total === 5, j(conf).slice(0, 200));
  const pend = await base({ status: "pending", page: 1, per_page: 20 });
  check("status=pending: total 40 e 20 linhas", pend?.data?.total === 40 && pend?.data?.linhas?.length === 20, j(pend).slice(0, 200));
  const padrao = await base({ page: 1, per_page: 20 });
  check("sem status continua valendo pending (total 40)", padrao?.data?.total === 40, j(padrao).slice(0, 200));
  const rc = await chamar(A.tok.owner, R.handovers, `emporio/cash/handovers?${qs({ establishment_id: L.id, status: "confirmed", page: "1", per_page: "20" })}`);
  check("rota com status=confirmed: meta.total 5", rc.status === 200 && rc.corpo?.meta?.total === 5, resumo(rc));
  const ruim = await base({ status: "outro", page: 1, per_page: 20 });
  check("status inválido continua 422 em status", ruim?.ok === false && ruim.status === 422 && ruim.field === "status", j(ruim).slice(0, 200));
}

// ---------------------------------------------------------------------------
// Seção 7: conferências
// ---------------------------------------------------------------------------

async function secao7() {
  secaoAtual = "7";
  console.log("\n7. Conferências do caixa: 45 contagens (listarConferenciasAction, GET emporio/cash/counts)");
  const Cx = await import("@/lib/actions/emporio-caixa");
  const prisma = await prismaCru();
  const L = await novaLoja(A, "Conferencias");
  const L2 = await novaLoja(A, "ConferenciasB");
  for (let k = 0; k < 45; k += 1) {
    await prisma.cashCount.create({
      data: {
        tenant_id: A.tenantId, establishment_id: L.id, expected: 10, counted: 10, difference: 0, kind: "livre",
        counted_at: new Date(AGORA - (45 - k) * 3_600_000), created_at: new Date(AGORA - (45 - k) * 3_600_000),
      },
    });
  }
  const oraculo = async (lojaId: string): Promise<string[]> =>
    (await prisma.cashCount.findMany({ where: { establishment_id: lojaId }, orderBy: [{ counted_at: "asc" }, { created_at: "asc" }], select: { id: true } })).map((x: Dado) => x.id as string);
  const ids = await oraculo(L.id);
  const ids2 = await oraculo(L2.id);
  await gabarito({
    nome: "conferências",
    maisAntigoPrimeiro: ids,
    acao: (o) => Cx.listarConferenciasAction(A.db, A.owner, { establishment_id: L.id, ...o }),
    rota: (p) => chamar(A.tok.owner, R.counts, `emporio/cash/counts?${qs({ establishment_id: L.id, ...p })}`),
    limite: true,
    filtros: [{ rotulo: "establishment_id da outra loja", opts: { establishment_id: L2.id }, params: { establishment_id: L2.id }, total: ids2.length }],
    outroTenant: () => Cx.listarConferenciasAction(B.db, B.owner, { page: 1, per_page: 20 }),
  });
}

// ---------------------------------------------------------------------------
// Seção 8: movimentos do caixa
// ---------------------------------------------------------------------------

async function secao8() {
  secaoAtual = "8";
  console.log("\n8. Movimentos do caixa: 45 movimentos (lerCaixaAction com mov_page, GET emporio/cash)");
  const Cx = await import("@/lib/actions/emporio-caixa");
  const prisma = await prismaCru();
  const L = await novaLoja(A, "Movimentos");
  for (let k = 0; k < 45; k += 1) {
    await prisma.cashMovement.create({
      data: {
        tenant_id: A.tenantId, establishment_id: L.id, direction: "entrada", amount: 1, origin: "implantacao",
        occurred_at: new Date(AGORA - (45 - k) * 3_600_000 - 10 * DIA), cash_register_id: L.reg,
      },
    });
  }
  const ids: string[] = (await prisma.cashMovement.findMany({ where: { establishment_id: L.id }, orderBy: [{ occurred_at: "asc" }, { created_at: "asc" }], select: { id: true } })).map((x: Dado) => x.id as string);

  // adapta o retorno composto ao formato `{ linhas, total, page, per_page }` do gabarito
  const adaptar = (r: Dado): Dado =>
    r?.ok === true
      ? { ok: true, data: { linhas: r.data?.movements ?? [], total: r.data?.movimentos_total, page: r.data?.movimentos_page, per_page: r.data?.movimentos_per_page } }
      : r;
  const paraMov = (o: Dado): Dado => {
    const { page, per_page, limit, ...resto } = o;
    return { ...resto, ...(page !== undefined ? { mov_page: page } : {}), ...(per_page !== undefined ? { mov_per_page: per_page } : {}), ...(limit !== undefined ? { limit } : {}) };
  };
  const paraMovRota = (p: Record<string, string>): Record<string, string> => {
    const { page, per_page, ...resto } = p;
    return { ...resto, ...(page !== undefined ? { mov_page: page } : {}), ...(per_page !== undefined ? { mov_per_page: per_page } : {}) };
  };
  await gabarito({
    nome: "movimentos",
    maisAntigoPrimeiro: ids,
    semOrdem: true,
    limiteAntigoSemPagina: true,
    acao: async (o) => adaptar(await Cx.lerCaixaAction(A.db, A.owner, { establishment_id: L.id, ...paraMov(o) })),
    rota: (p) => chamar(A.tok.owner, R.cash, `emporio/cash?${qs({ establishment_id: L.id, ...paraMovRota(p) })}`),
    linhasDaRota: (r) => (Array.isArray(r.corpo?.data?.movements) ? r.corpo.data.movements : []),
    metaDaRota: (r) => {
      const d = r.corpo?.data ?? {};
      return { total: d.movimentos_total, page: d.movimentos_page, per_page: d.movimentos_per_page };
    },
    limite: true,
    outroTenant: async () => adaptar(await Cx.lerCaixaAction(B.db, B.owner, { mov_page: 1, mov_per_page: 20 })),
  });

  console.log("  (h) o resto da leitura composta não mexe com a página");
  const p1 = await Cx.lerCaixaAction(A.db, A.owner, { establishment_id: L.id, mov_page: 1, mov_per_page: 20 });
  const p2 = await Cx.lerCaixaAction(A.db, A.owner, { establishment_id: L.id, mov_page: 2, mov_per_page: 20 });
  check("os saldos das lojas são os mesmos em qualquer página", p1.ok && p2.ok && j(p1.data.drawers) === j(p2.data.drawers));
  const sem = await Cx.lerCaixaAction(A.db, A.owner, { establishment_id: L.id });
  check("sem mov_page o retorno antigo segue com drawers e movements", sem.ok && Array.isArray(sem.data.drawers) && Array.isArray(sem.data.movements) && sem.data.movements.length > 0, j(sem).slice(0, 160));
  const rota2 = await chamar(A.tok.owner, R.cash, `emporio/cash?${qs({ establishment_id: L.id, mov_per_page: "30" })}`);
  check("rota com mov_per_page=30: 422", rota2.status === 422 && /per_page/.test(String(rota2.corpo?.error?.field)), resumo(rota2));
}

// ---------------------------------------------------------------------------
// Seção 9: pedidos de pagamento
// ---------------------------------------------------------------------------

async function secao9() {
  secaoAtual = "9";
  console.log("\n9. Pedidos de pagamento pendentes: 45 (listarPedidosDePagamentoAction, GET emporio/finance/payment-requests)");
  // Achado do juiz (18/11): os pendentes cortavam em 200 em silêncio. Agora paginam, do mais antigo (a fila de quem aprova).
  const Ap = await import("@/lib/actions/emporio-aprovacoes");
  const prisma = await prismaCru();
  const L = await novaLoja(A, "Pedidos");
  await prisma.emporioPaymentRequest.createMany({
    data: Array.from({ length: 45 }, (_, k) => ({
      tenant_id: A.tenantId, requested_by_user_id: A.owner.id, entry_ids: ["x"], total: 1, status: "pendente",
      establishment_id: L.id, created_at: new Date(AGORA - (45 - k) * 3_600_000),
    })),
  });
  // O banco é o oráculo da ordem (outra seção pode ter deixado pendente nesta conta).
  const pendentes = await prisma.emporioPaymentRequest.findMany({
    where: { tenant_id: A.tenantId, status: "pendente" },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  await gabarito({
    nome: "pedidos pendentes",
    maisAntigoPrimeiro: pendentes.map((p: Dado) => String(p.id)),
    padraoAsc: true,
    acao: (o: Dado) => Ap.listarPedidosDePagamentoAction(A.db, A.owner, { status: "pendente", ...o }),
    rota: (p) => chamar(A.tok.owner, R.paymentRequests, `emporio/finance/payment-requests?${qs({ status: "pendente", ...p })}`),
    outroTenant: () => Ap.listarPedidosDePagamentoAction(B.db, B.owner, { status: "pendente", page: 1, per_page: 20 }),
  });
  const r: Dado = await Ap.listarPedidosDePagamentoAction(A.db, A.owner, { page: 1, per_page: 20 } as Dado);
  check("a action devolve { linhas, total, page, per_page }", r?.ok === true && Array.isArray(r.data?.linhas) && typeof r.data?.total === "number" && r.data.page === 1 && r.data.per_page === 20, j(r).slice(0, 220));
  const ruim: Dado = await Ap.listarPedidosDePagamentoAction(A.db, A.owner, { page: 1, per_page: 30 } as Dado);
  check("per_page=30: 422 em per_page", ruim?.ok === false && ruim.status === 422 && ruim.field === "per_page", j(ruim).slice(0, 200));
  const vazio: Dado = await Ap.listarPedidosDePagamentoAction(B.db, B.owner, { page: 1, per_page: 20 } as Dado);
  check("outro tenant: total 0", vazio?.ok === true && vazio.data?.total === 0, j(vazio).slice(0, 200));
}

// ---------------------------------------------------------------------------
// Seção 10: curva ABC e podeVerLucroAction
// ---------------------------------------------------------------------------

const PERIODO = { from: somaDias(HOJE, -3), to: HOJE };
type Item = { name: string; amount: number; share_pct: number; cumulative_pct: number; classe: string };
function curva(tok: string, lojaId: string, kind = "products") {
  const q = new URLSearchParams({ from: PERIODO.from, to: PERIODO.to, kind, measure: "revenue", establishment_id: lojaId });
  return chamar(tok, R.abc, `emporio/reports/abc?${q.toString()}`);
}
const itensDe = (r: Resp): Item[] => (Array.isArray(dados(r)?.itens) ? dados(r).itens : []);
const classesDe = (r: Resp): { classe: string; count: number; share_pct: number }[] => (Array.isArray(dados(r)?.classes) ? dados(r).classes : []);
const centavos = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x * 100, 0));

async function secao10() {
  secaoAtual = "10";
  console.log("\n10. Curva ABC fecha em 100,00 e o seletor de lucro decidido no servidor");
  const cli = await novoCliente(A, "M125 CliCurva");

  console.log("  (a) três itens iguais: 33,34 + 33,33 + 33,33");
  const L = await novaLoja(A, "Curva3");
  const tres: Prod[] = [];
  for (let k = 0; k < 3; k += 1) tres.push(await novoProd(A, `M125 Igual${k}`, 10, [L]));
  await vender(A, L, cli.id, tres.map((p) => ({ p, qty: 1 })));
  const r = await curva(A.tok.owner, L.id);
  const it = itensDe(r);
  check("a rota responde 200 com 3 itens", r.status === 200 && it.length === 3, resumo(r));
  check("os share_pct dos itens somam exatamente 100,00", centavos(it.map((i) => i.share_pct)) === 10000, j(it.map((i) => i.share_pct)));
  check("os valores são 33,34, 33,33 e 33,33 (o maior resto recebe o centavo)", j(it.map((i) => i.share_pct).sort((a, b) => b - a)) === j([33.34, 33.33, 33.33]), j(it.map((i) => i.share_pct)));
  check("o acumulado do último item é 100,00", perto(it[2]?.cumulative_pct, 100, 0.0001), j(it.map((i) => i.cumulative_pct)));
  check("o acumulado é a soma dos share_pct arredondados", it.length === 3 && perto(it[1].cumulative_pct, it[0].share_pct + it[1].share_pct, 0.0001), j(it.map((i) => [i.share_pct, i.cumulative_pct])));
  check("as classes somam exatamente 100,00", centavos(classesDe(r).map((c) => c.share_pct)) === 10000, j(classesDe(r)));

  console.log("  (b) sete itens iguais: 14,29 x 7 daria 100,03; as classes também fecham");
  const L7 = await novaLoja(A, "Curva7");
  const sete: Prod[] = [];
  for (let k = 0; k < 7; k += 1) sete.push(await novoProd(A, `M125 Sete${k}`, 10, [L7]));
  await vender(A, L7, cli.id, sete.map((p) => ({ p, qty: 1 })));
  const r7 = await curva(A.tok.owner, L7.id);
  const i7 = itensDe(r7);
  check("7 itens", i7.length === 7, resumo(r7));
  check("os share_pct dos 7 itens somam exatamente 100,00", centavos(i7.map((i) => i.share_pct)) === 10000, j(i7.map((i) => i.share_pct)));
  check("cada share_pct é 14,28 ou 14,29", i7.every((i) => perto(i.share_pct, 14.28, 0.0001) || perto(i.share_pct, 14.29, 0.0001)), j(i7.map((i) => i.share_pct)));
  check("as classes dos 7 somam exatamente 100,00", centavos(classesDe(r7).map((c) => c.share_pct)) === 10000, j(classesDe(r7)));
  check("a classe continua pelos inteiros: seis em A e um em B", j(i7.map((i) => i.classe)) === j(["A", "A", "A", "A", "A", "A", "B"]), j(i7.map((i) => i.classe)));
  check("o acumulado do último é 100,00", perto(i7[6]?.cumulative_pct, 100, 0.0001), j(i7.map((i) => i.cumulative_pct)));

  console.log("  (c) clientes: a curva de clientes também fecha");
  const rc = await curva(A.tok.owner, L7.id, "customers");
  check("um cliente só: share_pct 100,00", rc.status === 200 && centavos(itensDe(rc).map((i) => i.share_pct)) === 10000, resumo(rc));

  console.log("  (d) 50, 30, 10, 6 e 4 continua A, A, B, B, C");
  const L5 = await novaLoja(A, "Curva5");
  const cinco: Prod[] = [];
  for (const v of [50, 30, 10, 6, 4]) cinco.push(await novoProd(A, `M125 Cinco${v}`, v, [L5]));
  await vender(A, L5, cli.id, cinco.map((p) => ({ p, qty: 1 })));
  const r5 = await curva(A.tok.owner, L5.id);
  const i5 = itensDe(r5);
  check("classes A, A, B, B, C", j(i5.map((i) => i.classe)) === j(["A", "A", "B", "B", "C"]), j(i5.map((i) => i.classe)));
  check("share_pct 50, 30, 10, 6 e 4", i5.length === 5 && [50, 30, 10, 6, 4].every((v, k) => perto(i5[k].share_pct, v, 0.0001)), j(i5.map((i) => i.share_pct)));
  check("acumulado 50, 80, 90, 96, 100", i5.length === 5 && [50, 80, 90, 96, 100].every((v, k) => perto(i5[k].cumulative_pct, v, 0.0001)), j(i5.map((i) => i.cumulative_pct)));
  check("classes A 80, B 16 e C 4", j(classesDe(r5).map((c) => [c.classe, c.share_pct])) === j([["A", 80], ["B", 16], ["C", 4]]), j(classesDe(r5)));

  console.log("  (e) podeVerLucroAction por papel");
  const Rel = (await import("@/lib/actions/emporio-relatorios")) as Dado;
  const prisma = await prismaCru();
  const bcrypt = (await import("bcryptjs")).default;
  const hash = await bcrypt.hash(SENHA, 4);
  const mk = async (suf: string, role: "OWNER" | "ADMIN" | "OPERADOR", extra: Dado): Promise<Ator> => {
    const u = await prisma.user.create({
      data: { tenant_id: A.tenantId, name: `M125 ${suf}`, email: `m125-papel-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...extra },
    });
    return { id: u.id as string, role: role as "OWNER" | "OPERADOR" };
  };
  const gerente = await mk("gerente", "ADMIN", { emporio_role: "gerente_geral" });
  const financeiro = await mk("financ", "OPERADOR", { emporio_role: "financeiro", emporio_only: true });
  const caixa = await mk("caixa", "OPERADOR", { emporio_role: "caixa" });
  const pode = async (a: Ator): Promise<unknown> => (typeof Rel.podeVerLucroAction === "function" ? Rel.podeVerLucroAction(A.db, a) : "função ausente");
  check("Dono: verdadeiro", (await pode(A.owner)) === true);
  check("Gerente geral: verdadeiro", (await pode(gerente)) === true);
  check("Gestor da loja: verdadeiro", (await pode(A.gestor)) === true);
  check("Financeiro: verdadeiro", (await pode(financeiro)) === true);
  check("Vendedor: falso", (await pode(A.vend)) === false);
  check("Caixa: falso", (await pode(caixa)) === false);
  const rv = await curva(A.tok.vend, L.id);
  check("coerente com a rota: o Vendedor continua recebendo 403", rv.status === 403, resumo(rv));
}

// ---------------------------------------------------------------------------

async function limpar(id: string) {
  const prisma = await prismaCru();
  const por = { where: { tenant_id: id } };
  await prisma.emporioSale.updateMany({ ...por, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } }).catch(() => undefined);
  await prisma.emporioQuote.updateMany({ ...por, data: { sale_id: null, based_on_quote_id: null } }).catch(() => undefined);
  for (const m of ["emporioPaymentRequest", "cashMovement", "cashCount", "cashHandover", "cardAnticipation", "productionEntry", "stockTransfer"]) {
    await prisma[m].deleteMany(por).catch((e: unknown) => console.log(`  (teardown ${m}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
  }
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
    await rodar("7", secao7);
    await rodar("8", secao8);
    await rodar("9", secao9);
    await rodar("10", secao10);
  } finally {
    for (const id of tenantIds.reverse()) await limpar(id);
    await prisma.$disconnect();
  }
  const total = Object.values(contagem).reduce((s, c) => s + c.ok + c.falhas, 0);
  console.log(`\nChecagens: ${total}`);
  for (const [s, c] of Object.entries(contagem)) console.log(`  seção ${s}: ${c.ok} ok, ${c.falhas} falha(s)`);
  console.log(falhas === 0 ? "\n✅ M125 (Módulo 39, Empório): paginação das listas e curva ABC passou." : `\n❌ M125 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
