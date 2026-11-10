import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M109: Módulo 39 (Meu Empório), editar, cancelar e refazer orçamento (Q285 a Q290).
 * Roda: `npm run test:m109`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-10-emporio-editar-e-cancelar-orcamento-design.md,
 * sem ler a implementação. Tudo passa pela ROTA (Request construído).
 *
 * Seção 1: editar um orçamento aberto (itens, número, validade, preço de hoje, histórico).
 * Seção 2: editar um vencido.
 * Seção 3: faturado e cancelado não se editam.
 * Seção 4: a edição repete as validações da criação.
 * Seção 5: cancelar (motivo, quem, definitivo, faturado não).
 * Seção 6: faturar o cancelado.
 * Seção 7: a lista por situação.
 * Seção 8: criar a partir de outro (based_on_quote_id, derived).
 * Seção 9: permissão (Q288).
 * Seção 10: isolamento entre tenants.
 *
 * Suposições de contrato que a spec não fechava (ver o relato): a rota de cancelar fica em
 * quotes/[id]/cancel/route; o parâmetro de lista é `situacao`; o Financeiro (emporio_only, sem
 * vendedor_da_loja) faz o papel de "quem não cria orçamento"; item da cotação aceita
 * { emporio_product_id, presentation_id, quantity }; o resumo do Histórico fica em `summary`.
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

console.log("🧾 M109: Módulo 39 (Meu Empório), editar, cancelar e refazer orçamento (Q285 a Q290)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];
const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const diaDe = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const n = (x: unknown) => Number(x);
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && Math.abs(a - b) < tol;
const VALIDADE = 5;

type Usuario = { id: string; role: "OWNER" | "OPERADOR"; email: string };
type Mundo = {
  tenantId: string;
  db: Dado;
  owner: Usuario;
  tok: Record<"owner" | "fin" | "vend", string>;
  L1: string;
  reg: string;
  prodId: string;
  presId: string;
  prod2Id: string;
  pres2Id: string;
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
    data: { name: `M109 ${rotulo} ${stamp}`, document: `M109${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  await (prisma as Dado).emporioSettings.upsert({
    where: { tenant_id: t.id },
    create: { tenant_id: t.id, quote_validity_days: VALIDADE },
    update: { quote_validity_days: VALIDADE },
  });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M109 ${suf}`, email: `m109-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const fin = await mk("fin", "OPERADOR", { emporio_role: "financeiro", emporio_only: true, emporio_keys: [] });
  const vend = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: ["lancar_compra"] });

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M109 ${rotulo} Loja 1` });
  if (!l1.ok) throw new Error(`loja: ${j(l1)}`);
  const L1 = l1.data.id as string;
  await vincularTodas(prisma, t.id, [fin.id, vend.id], [L1]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M109 categoria ${rotulo}` }) });
  const produto = async (nome: string, preco: number) => {
    const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M109 ${nome} ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
    if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
    const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
    if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L1, presentation_id: pres.data.id, price: preco });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L1, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
    return { prodId: prod.data.id as string, presId: pres.data.id as string };
  };
  const p1 = await produto("Ração", 10);
  const p2 = await produto("Sal", 20);
  await abrirTurnoDeTeste(db, owner, L1);
  const reg = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))?.id as string;

  const tok = {} as Mundo["tok"];
  const pares: [keyof Mundo["tok"], Usuario][] = [["owner", owner], ["fin", fin], ["vend", vend]];
  for (const [k, u] of pares) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { tenantId: t.id, db, owner, tok, L1, reg, prodId: p1.prodId, presId: p1.presId, prod2Id: p2.prodId, pres2Id: p2.presId };
}

// Rotas (import literal, para o bundler do tsx resolver os colchetes)
const R = {
  quotes: () => import("@/app/api/v1/emporio/quotes/route"),
  quote: () => import("@/app/api/v1/emporio/quotes/[id]/route"),
  cancel: () => import("@/app/api/v1/emporio/quotes/[id]/cancel/route"),
  sales: () => import("@/app/api/v1/emporio/sales/route"),
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
  if (typeof m[metodo] !== "function") return { status: 0, corpo: { sem_metodo: metodo } };
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}
const erro = (r: Resp, status: number, field?: string, code?: string) =>
  r.status === status && (field === undefined || r.corpo?.error?.field === field) && (code === undefined || r.corpo?.error?.code === code);

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
let cpfSeq = 0;
const chave = (p: string) => `m109-${p}-${stamp}-${(seq += 1)}`;

async function cliente(w: Mundo, nome: string) {
  const { prisma } = await import("@/lib/prisma");
  const cpfs = ["39053344705", "52998224725", "11144477735", "86288366757", "16899535009"];
  const cpf = cpfs[(cpfSeq += 1) % cpfs.length];
  // O orçamento exige cliente completo (pessoa física ou jurídica, documento e telefone).
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: nome, person_kind: "pf", document: cpf, phone: "11999990000" } as Dado })) as Dado;
}
const itens = (w: Mundo, ...q: [("a" | "b"), number][]) =>
  q.map(([k, quantity]) => (k === "a" ? { emporio_product_id: w.prodId, presentation_id: w.presId, quantity } : { emporio_product_id: w.prod2Id, presentation_id: w.pres2Id, quantity }));
const criarOrc = (w: Mundo, cli: Dado, items: Dado[], extra: Dado = {}, tok?: string) =>
  chamar(tok ?? w.tok.owner, R.quotes, "POST", "emporio/quotes", { operation_key: chave("orc"), establishment_id: w.L1, customer_id: cli.id, items, ...extra });
const editar = (w: Mundo, id: string, cli: Dado, items: Dado[], extra: Dado = {}, tok?: string) =>
  chamar(tok ?? w.tok.owner, R.quote, "PATCH", `emporio/quotes/${id}`, { customer_id: cli.id, items, ...extra }, id);
const cancelar = (w: Mundo, id: string, corpo: unknown, tok?: string) =>
  chamar(tok ?? w.tok.owner, R.cancel, "POST", `emporio/quotes/${id}/cancel`, corpo, id);
const totalDe = async (id: string) => n((await (await import("@/lib/prisma")).prisma.emporioQuote.findUnique({ where: { id } }))?.net_amount);
const faturar = async (w: Mundo, cli: Dado, quoteId: string, qty: number) =>
  chamar(w.tok.owner, R.sales, "POST", "emporio/sales", {
    operation_key: chave("venda"), establishment_id: w.L1, cash_register_id: w.reg, customer_id: cli.id, quote_id: quoteId,
    items: [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: qty }], payments: [{ kind: "dinheiro", amount: await totalDe(quoteId) }],
  });
const ler = (w: Mundo, id: string, tok?: string) => chamar(tok ?? w.tok.owner, R.quote, "GET", `emporio/quotes/${id}`, undefined, id);
const idDe = (r: Resp) => String(r.corpo?.data?.id ?? "");
const lista = (r: Resp): Dado[] => (Array.isArray(r.corpo?.data) ? r.corpo.data : []);
const listar = (w: Mundo, qs = "") => chamar(w.tok.owner, R.quotes, "GET", `emporio/quotes${qs}`);
const vencerNoBanco = async (id: string) => {
  const { prisma } = await import("@/lib/prisma");
  await (prisma as Dado).emporioQuote.update({ where: { id }, data: { valid_until: meioDia(somaDias(hojeStr, -2)) } });
};

async function main() {
  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    const A = await montar("A");
    const B = await montar("B");
    const C1 = await cliente(A, "M109 Cliente 1");
    const C2 = await cliente(A, "M109 Cliente 2");
    const validadeNova = somaDias(hojeStr, VALIDADE);

    // -------------------------------------------------------------------- 1
    await rodar("editar aberto", async () => {
      console.log("1. Editar um orçamento aberto (Q285, Q290)");
      const r0 = await criarOrc(A, C1, itens(A, ["a", 2]));
      check("(fixture) orçamento criado: 201", r0.status === 201, `${r0.status} ${j(r0.corpo)}`);
      const id = idDe(r0);
      const numero = r0.corpo?.data?.number;
      // valida velha, para provar que a edição renova
      await P.emporioQuote.update({ where: { id }, data: { valid_until: meioDia(somaDias(hojeStr, 1)) } });
      // o preço do produto muda depois de criado
      const Cat = await import("@/lib/actions/emporio-catalogo");
      const pr = await Cat.definirPrecoAction(A.db, A.owner, { establishment_id: A.L1, presentation_id: A.presId, price: 12 });
      check("(fixture) preço do produto A passou a 12", pr.ok === true, j(pr));

      const r = await editar(A, id, C2, itens(A, ["a", 3], ["b", 1]), { notes: "editado" });
      check("PATCH: 200", r.status === 200, `${r.status} ${j(r.corpo)}`);
      check("devolve o mesmo id e o mesmo número", r.corpo?.data?.id === id && n(r.corpo?.data?.number) === n(numero), j(r.corpo?.data));
      const q = await P.emporioQuote.findUnique({ where: { id }, include: { items: true } });
      check("o número no banco não mudou", q?.number === n(numero));
      check("trocou o cliente e a observação", q?.customer_id === C2.id && q?.notes === "editado", j(q));
      check("a lista de itens foi trocada inteira: 2 itens, quantidades 3 e 1", q?.items?.length === 2
        && q.items.some((i: Dado) => n(i.quantity) === 3) && q.items.some((i: Dado) => n(i.quantity) === 1), j(q?.items));
      check("valid_until renovada: hoje + quote_validity_days", diaDe(q?.valid_until) === validadeNova, `${diaDe(q?.valid_until)} esperado ${validadeNova}`);
      const itemA = q?.items?.find((i: Dado) => i.emporio_product_id === A.prodId);
      check("suggested_price do item A passou ao preço de hoje (12)", perto(n(itemA?.suggested_price), 12), j(itemA));
      check("o total acompanha: 3 x 12 + 1 x 20 = 56", perto(n(q?.net_amount), 56), `${q?.net_amount}`);
      check("situação segue aberto", r.corpo?.data?.situacao === "aberto", j(r.corpo?.data?.situacao));
      const logs = (await P.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "orcamento.editar", target_id: id } })) as Dado[];
      check("Histórico: uma linha orcamento.editar", logs.length === 1, `${logs.length}`);
      const nov = await P.emporioQuote.count({ where: { tenant_id: A.tenantId } });
      check("a edição não criou orçamento novo", nov === 1, `${nov}`);
    });

    // -------------------------------------------------------------------- 2
    await rodar("editar vencido", async () => {
      console.log("\n2. Editar um orçamento vencido");
      const id = idDe(await criarOrc(A, C1, itens(A, ["a", 1])));
      await vencerNoBanco(id);
      const antes = await ler(A, id);
      check("(fixture) está vencido", antes.corpo?.data?.situacao === "vencido", j(antes.corpo?.data?.situacao));
      const r = await editar(A, id, C1, itens(A, ["a", 4]));
      check("PATCH no vencido: 200", r.status === 200, `${r.status} ${j(r.corpo)}`);
      check("volta a aberto", r.corpo?.data?.situacao === "aberto", j(r.corpo?.data?.situacao));
      const q = await P.emporioQuote.findUnique({ where: { id } });
      check("com validade nova (hoje + dias)", diaDe(q?.valid_until) === validadeNova, diaDe(q?.valid_until));
    });

    // -------------------------------------------------------------------- 3
    let idFaturado = "";
    let idCancelado = "";
    await rodar("faturado e cancelado", async () => {
      console.log("\n3. Faturado e cancelado não se editam");
      idFaturado = idDe(await criarOrc(A, C1, itens(A, ["a", 2])));
      const v = await faturar(A, C1, idFaturado, 2);
      check("(fixture) faturou: 201", v.status === 201, `${v.status} ${j(v.corpo)}`);
      const e1 = await editar(A, idFaturado, C1, itens(A, ["a", 5]));
      check("editar o faturado: 409 QUOTE_ALREADY_INVOICED", erro(e1, 409, undefined, "QUOTE_ALREADY_INVOICED"), `${e1.status} ${j(e1.corpo)}`);
      const q = await P.emporioQuote.findUnique({ where: { id: idFaturado }, include: { items: true } });
      check("o faturado ficou como estava (1 item, qtd 2)", q?.items?.length === 1 && n(q.items[0].quantity) === 2, j(q?.items));

      idCancelado = idDe(await criarOrc(A, C1, itens(A, ["a", 2])));
      const c = await cancelar(A, idCancelado, { reason: "Cliente desistiu" });
      check("(fixture) cancelou: 200", c.status === 200, `${c.status} ${j(c.corpo)}`);
      const e2 = await editar(A, idCancelado, C1, itens(A, ["a", 5]));
      check("editar o cancelado: 409 QUOTE_CANCELED", erro(e2, 409, undefined, "QUOTE_CANCELED"), `${e2.status} ${j(e2.corpo)}`);
    });

    // -------------------------------------------------------------------- 4
    await rodar("validações", async () => {
      console.log("\n4. A edição repete as validações da criação");
      const id = idDe(await criarOrc(A, C1, itens(A, ["a", 2])));
      const eVazio = await editar(A, id, C1, []);
      check("itens vazios: 422 no campo items", erro(eVazio, 422, "items"), `${eVazio.status} ${j(eVazio.corpo)}`);
      const eCli = await chamar(A.tok.owner, R.quote, "PATCH", `emporio/quotes/${id}`, { customer_id: "nao-existe", items: itens(A, ["a", 1]) }, id);
      check("cliente inexistente: recusa (4xx) no campo customer_id", eCli.status >= 400 && eCli.status < 500 && eCli.corpo?.error?.field === "customer_id", `${eCli.status} ${j(eCli.corpo)}`);
      const q = await P.emporioQuote.findUnique({ where: { id }, include: { items: true } });
      check("as recusas não mexeram no orçamento", q?.items?.length === 1 && n(q.items[0].quantity) === 2 && q.customer_id === C1.id, j(q?.items));
    });

    // -------------------------------------------------------------------- 5
    await rodar("cancelar", async () => {
      console.log("\n5. Cancelar (Q287, Q290)");
      const id = idDe(await criarOrc(A, C1, itens(A, ["a", 2])));
      const sem = await cancelar(A, id, {});
      check("sem reason: 422 no campo reason", erro(sem, 422, "reason"), `${sem.status} ${j(sem.corpo)}`);
      const branco = await cancelar(A, id, { reason: "   " });
      check("reason em branco: 422 no campo reason", erro(branco, 422, "reason"), `${branco.status} ${j(branco.corpo)}`);
      check("as recusas não cancelaram", (await P.emporioQuote.findUnique({ where: { id } }))?.canceled_at === null);
      const ok = await cancelar(A, id, { reason: "Preço mudou" });
      check("com reason: 200", ok.status === 200, `${ok.status} ${j(ok.corpo)}`);
      check("a resposta traz situacao cancelado e o motivo", ok.corpo?.data?.situacao === "cancelado" && ok.corpo?.data?.canceled_reason === "Preço mudou", j(ok.corpo?.data));
      const q = await P.emporioQuote.findUnique({ where: { id } });
      check("gravou canceled_at, canceled_reason e canceled_by_user_id", !!q?.canceled_at && q.canceled_reason === "Preço mudou" && q.canceled_by_user_id === A.owner.id, j(q));
      const g = await ler(A, id);
      check("o GET traz situacao cancelado e canceled_by { id, name }", g.corpo?.data?.situacao === "cancelado"
        && g.corpo?.data?.canceled_by?.id === A.owner.id && typeof g.corpo?.data?.canceled_by?.name === "string"
        && !!g.corpo?.data?.canceled_at, j(g.corpo?.data));
      const logs = (await P.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "orcamento.cancelar", target_id: id } })) as Dado[];
      check("Histórico: uma linha orcamento.cancelar com o motivo", logs.length === 1 && j(logs[0]).includes("Preço mudou"), j(logs));
      const de2 = await cancelar(A, id, { reason: "de novo" });
      check("cancelar de novo: 409", de2.status === 409, `${de2.status} ${j(de2.corpo)}`);
      const fat = await cancelar(A, idFaturado, { reason: "tentativa" });
      check("cancelar o faturado: 409 QUOTE_ALREADY_INVOICED", erro(fat, 409, undefined, "QUOTE_ALREADY_INVOICED"), `${fat.status} ${j(fat.corpo)}`);
      check("o faturado segue sem cancelamento", (await P.emporioQuote.findUnique({ where: { id: idFaturado } }))?.canceled_at === null);
    });

    // -------------------------------------------------------------------- 6
    await rodar("faturar cancelado", async () => {
      console.log("\n6. Faturar o orçamento cancelado");
      const vendas0 = await P.emporioSale.count({ where: { tenant_id: A.tenantId } });
      const r = await faturar(A, C1, idCancelado, 2);
      check("409 QUOTE_CANCELED no campo quote_id", erro(r, 409, "quote_id", "QUOTE_CANCELED"), `${r.status} ${j(r.corpo)}`);
      check("nenhuma venda nova", (await P.emporioSale.count({ where: { tenant_id: A.tenantId } })) === vendas0);
      check("o orçamento segue sem venda", (await P.emporioQuote.findUnique({ where: { id: idCancelado } }))?.sale_id === null);
    });

    // -------------------------------------------------------------------- 7
    await rodar("lista", async () => {
      console.log("\n7. A lista por situação");
      const idAb = idDe(await criarOrc(A, C1, itens(A, ["a", 1])));
      const cancelados = await listar(A, "?situacao=cancelado");
      check("situacao=cancelado: 200 e traz o cancelado", cancelados.status === 200 && lista(cancelados).some((x) => x.id === idCancelado), `${cancelados.status}`);
      check("situacao=cancelado traz só cancelados", lista(cancelados).every((x) => x.situacao === "cancelado"), j(lista(cancelados).map((x) => x.situacao)));
      const padrao = await listar(A);
      check("o padrão (acompanhamento) não traz o cancelado e traz o aberto", !lista(padrao).some((x) => x.id === idCancelado) && lista(padrao).some((x) => x.id === idAb));
      const ac = await listar(A, "?situacao=acompanhamento");
      check("acompanhamento explícito também não traz o cancelado", !lista(ac).some((x) => x.id === idCancelado));
      const todos = await listar(A, "?situacao=todos");
      check("todos traz o cancelado, o faturado e o aberto", [idCancelado, idFaturado, idAb].every((i) => lista(todos).some((x) => x.id === i)), `${lista(todos).length}`);
    });

    // -------------------------------------------------------------------- 8
    await rodar("a partir de outro", async () => {
      console.log("\n8. Novo orçamento a partir de outro (Q286)");
      const r = await criarOrc(A, C1, itens(A, ["a", 5], ["b", 2]), { based_on_quote_id: idFaturado });
      check("criar com based_on_quote_id de um faturado: 201", r.status === 201, `${r.status} ${j(r.corpo)}`);
      const novo = idDe(r);
      const orig = await P.emporioQuote.findUnique({ where: { id: idFaturado } });
      check("número novo (diferente do original)", n(r.corpo?.data?.number) !== orig?.number && !!r.corpo?.data?.number, `${r.corpo?.data?.number} x ${orig?.number}`);
      check("based_on aponta o original, com id e número", r.corpo?.data?.based_on?.id === idFaturado && n(r.corpo?.data?.based_on?.number) === orig?.number, j(r.corpo?.data?.based_on));
      const g = await ler(A, idFaturado);
      check("o GET do original lista o novo em derived", Array.isArray(g.corpo?.data?.derived) && g.corpo.data.derived.some((d: Dado) => d.id === novo && n(d.number) === n(r.corpo?.data?.number)), j(g.corpo?.data?.derived));
      check("o original segue faturado", g.corpo?.data?.situacao === "faturado" && !!orig?.sale_id, j(g.corpo?.data?.situacao));
      const log = (await P.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: { in: ["orcamento.criar", "orcamento.salvar"] }, target_id: novo } })) as Dado[];
      check("o resumo do Histórico da criação (orcamento.criar na m94, orcamento.salvar na spec) cita o número de origem", log.length === 1 && j(log[0]).includes(String(orig?.number)), j(log));
      const gc = await P.emporioQuote.findUnique({ where: { id: idCancelado } });
      const rc = await criarOrc(A, C1, itens(A, ["a", 1]), { based_on_quote_id: idCancelado });
      check("também vale a partir de um cancelado: 201", rc.status === 201 && n(rc.corpo?.data?.based_on?.number) === gc?.number, `${rc.status} ${j(rc.corpo)}`);
      const inex = await criarOrc(A, C1, itens(A, ["a", 1]), { based_on_quote_id: "nao-existe-xyz" });
      check("based_on_quote_id inexistente: 404 no campo based_on_quote_id", erro(inex, 404, "based_on_quote_id"), `${inex.status} ${j(inex.corpo)}`);
      const idB = idDe(await criarOrc(B, await cliente(B, "M109 Cliente B"), itens(B, ["a", 1])));
      const outro = await criarOrc(A, C1, itens(A, ["a", 1]), { based_on_quote_id: idB });
      check("based_on_quote_id de outro tenant: 404 no campo based_on_quote_id", erro(outro, 404, "based_on_quote_id"), `${outro.status} ${j(outro.corpo)}`);
    });

    // -------------------------------------------------------------------- 9
    await rodar("permissão", async () => {
      console.log("\n9. Permissão (Q288)");
      const id = idDe(await criarOrc(A, C1, itens(A, ["a", 2])));
      const eFin = await editar(A, id, C1, itens(A, ["a", 9]), {}, A.tok.fin);
      check("o Financeiro não edita: 403", eFin.status === 403, `${eFin.status} ${j(eFin.corpo)}`);
      const cFin = await cancelar(A, id, { reason: "x" }, A.tok.fin);
      check("o Financeiro não cancela: 403", cFin.status === 403, `${cFin.status} ${j(cFin.corpo)}`);
      const q = await P.emporioQuote.findUnique({ where: { id }, include: { items: true } });
      check("os 403 não mexeram no orçamento", q?.canceled_at === null && n(q.items[0].quantity) === 2);
      const eV = await editar(A, id, C1, itens(A, ["a", 6]), {}, A.tok.vend);
      check("o Vendedor da loja edita: 200", eV.status === 200, `${eV.status} ${j(eV.corpo)}`);
      const cV = await cancelar(A, id, { reason: "Vendedor cancelou" }, A.tok.vend);
      check("o Vendedor da loja cancela: 200", cV.status === 200, `${cV.status} ${j(cV.corpo)}`);
      const idV = idDe(await criarOrc(A, C1, itens(A, ["a", 1]), { based_on_quote_id: id }, A.tok.vend));
      check("o Vendedor cria a partir de outro", idV !== "");
    });

    // -------------------------------------------------------------------- 10
    await rodar("isolamento", async () => {
      console.log("\n10. Isolamento entre tenants");
      const id = idDe(await criarOrc(A, C1, itens(A, ["a", 2])));
      const cliB = await cliente(B, "M109 Cliente B2");
      const e = await editar(B, id, cliB, itens(B, ["a", 7]));
      check("o tenant B edita orçamento do A: 404", e.status === 404, `${e.status} ${j(e.corpo)}`);
      const c = await cancelar(B, id, { reason: "invasão" });
      check("o tenant B cancela orçamento do A: 404", c.status === 404, `${c.status} ${j(c.corpo)}`);
      const q = await P.emporioQuote.findUnique({ where: { id }, include: { items: true } });
      check("o orçamento do A ficou intacto", q?.canceled_at === null && n(q.items[0].quantity) === 2 && q.customer_id === C1.id);
    });
  } finally {
    for (const id of tenantIds.reverse()) {
      await P.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
      await P.emporioQuote.updateMany({ where: { tenant_id: id }, data: { sale_id: null, based_on_quote_id: null } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id } }).catch((e: unknown) => console.log(`  (teardown ${id}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
    }
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\n✅ M109 (Módulo 39, Empório): editar, cancelar e refazer orçamento passaram." : `\n❌ M109 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  // Como as outras suítes: a rota de token deixa o Redis aberto e o processo não encerra sozinho.
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
