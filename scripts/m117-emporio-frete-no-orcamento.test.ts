import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M117: Módulo 39 (Meu Empório), frete no orçamento (Q326).
 * Roda: `npm run test:m117`
 *
 * Salvar com frete (negativo recusa), a visão e o impresso somando o frete, editar (ausente mantém,
 * 0 zera, Histórico), a partir deste (copia), faturar (herda sem o campo; 0 explícito não herda) e
 * isolamento. Montagem copiada da m116.
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
console.log("🧾 M117: Módulo 39 (Meu Empório), frete no orçamento (Q326)\n");

const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const tenantIds: string[] = [];

type Ator = { id: string; role: "OWNER" | "OPERADOR" | "VISUALIZADOR" };
type Mundo = {
  tenantId: string;
  db: Dado;
  owner: Ator;
  tok: { owner: string; caixa: string; vendedor: string; caixaL2: string; semFuncao: string };
  L1: string;
  L2: string;
  nomeL1: string;
  reg1: string;
  reg2: string;
  prodId: string;
  presId: string;
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
    data: { name: `M117 ${rotulo} ${stamp}`, document: `M117${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR" | "VISUALIZADOR", extra: Dado = {}) => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M117 ${suf}`, email: `m117-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id as string, role, email: u.email as string };
  };
  const owner = await mk("own", "OWNER");
  const caixa = await mk("caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const vendedor = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: [] });
  const caixaL2 = await mk("caixal2", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const semFuncao = await mk("semf", "VISUALIZADOR");

  const db = prismaForTenant(t.id) as Dado;
  const nomeL1 = `M117 ${rotulo} Loja 1`;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: nomeL1 });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M117 ${rotulo} Loja 2` });
  if (!l1.ok || !l2.ok) throw new Error(`loja: ${j(l1)} ${j(l2)}`);
  const L1 = l1.data.id as string;
  const L2 = l2.data.id as string;
  await vincularTodas(prisma as Dado, t.id, [caixa.id, vendedor.id], [L1]);
  await vincularTodas(prisma as Dado, t.id, [caixaL2.id], [L2]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M117 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M117 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  for (const loja of [L1, L2]) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: loja, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: loja, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  }
  await abrirTurnoDeTeste(db, owner, L1);
  await abrirTurnoDeTeste(db, owner, L2);
  const reg1 = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))?.id as string;
  const reg2 = (await db.cashRegister.findFirst({ where: { establishment_id: L2, number: 1 } }))?.id as string;

  const token = async (u: { email: string }) =>
    String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  const tok = { owner: await token(owner), caixa: await token(caixa), vendedor: await token(vendedor), caixaL2: await token(caixaL2), semFuncao: await token(semFuncao) };
  return { tenantId: t.id, db, owner, tok, L1, L2, nomeL1, reg1, reg2, prodId: prod.data.id as string, presId: pres.data.id as string };
}

const R = {
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  replace: () => import("@/app/api/v1/emporio/sales/[id]/replace/route"),
  pixContas: () => import("@/app/api/v1/emporio/establishments/[id]/pix-accounts/route"),
  contas: () => import("@/app/api/v1/emporio/bank-accounts/route"),
  receive: () => import("@/app/api/v1/emporio/receivables/receive/route"),
  relatorio: () => import("@/app/api/v1/emporio/reports/sales/route"),
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
const erroA = (r: Dado, status: number, field: string, code = "VALIDATION_ERROR") =>
  r?.ok === false && r.status === status && r.field === field && r.code === code;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m117-${p}-${stamp}-${(seq += 1)}`;
const idDe = (r: Resp) => String(r.corpo?.data?.id ?? "");

async function cliente(w: Mundo, nome: string) {
  const { prisma } = await import("@/lib/prisma");
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: nome, person_kind: "pf", phone: "11999990000" } as Dado })) as Dado;
}
const itens = (w: Mundo, quantity: number) => [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity }];

async function main() {
  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    const A = await montar("A");
    const B = await montar("B");
    const Orc = (await import("@/lib/actions/emporio-orcamentos")) as Dado;
    const Imp = (await import("@/lib/actions/emporio-impressao")) as Dado;
    const CA = await cliente(A, "M117 Cliente A");
    const CB = await cliente(B, "M117 Cliente B");
    const salvar = (w: Mundo, cli: Dado, extra: Dado) =>
      Orc.salvarOrcamentoAction(w.db, w.owner, { operation_key: chave("orc"), establishment_id: w.L1, customer_id: cli.id, items: itens(w, 5), ...extra });
    const editar = (w: Mundo, id: string, cli: Dado, extra: Dado) =>
      Orc.editarOrcamentoAction(w.db, w.owner, id, { customer_id: cli.id, items: itens(w, 5), ...extra });

    let orcId = "";
    await rodar("salvar e ver", async () => {
      console.log("1. Salvar o orçamento com frete (Q326)");
      const neg = await salvar(A, CA, { freight_amount: -1 });
      check("frete negativo: 422 em freight_amount", erroA(neg, 422, "freight_amount"), j(neg));
      const r = await salvar(A, CA, { freight_amount: 12.5 });
      check("orçamento com frete 12,50: ok", r.ok === true, j(r));
      orcId = r.data?.id ?? "";
      check("a visão traz freight_amount 12,5", r.data?.freight_amount === 12.5, j(r.data?.freight_amount));
      check("net_amount segue só os itens (50)", r.data?.net_amount === 50, j(r.data?.net_amount));
      check("total_amount soma o frete (62,5)", r.data?.total_amount === 62.5, j(r.data?.total_amount));
      const sem = await salvar(A, CA, {});
      check("sem frete: freight_amount 0 e total igual aos itens", sem.ok === true && sem.data?.freight_amount === 0 && sem.data?.total_amount === 50, j(sem.data));
    });

    await rodar("impresso", async () => {
      console.log("\n2. O impresso do orçamento");
      const p = await Imp.lerImpressoDoOrcamentoAction(A.db, A.owner, orcId);
      check("o papel traz frete 12,5", p.ok === true && p.data?.frete === 12.5, j(p.data?.frete));
      check("o total do papel soma o frete (62,5)", p.data?.total === 62.5, j(p.data?.total));
    });

    await rodar("editar", async () => {
      console.log("\n3. Editar o orçamento");
      const mantem = await editar(A, orcId, CA, { notes: "sem mexer no frete" });
      check("editar sem freight_amount mantém o frete (12,5)", mantem.ok === true && mantem.data?.freight_amount === 12.5, j(mantem.data?.freight_amount));
      const muda = await editar(A, orcId, CA, { freight_amount: 20 });
      check("editar com frete 20: grava 20 e total 70", muda.ok === true && muda.data?.freight_amount === 20 && muda.data?.total_amount === 70, j(muda.data));
      const hist = await P.emporioAuditLog.findFirst({ where: { tenant_id: A.tenantId, action: "orcamento.editar" }, orderBy: { created_at: "desc" } });
      check("o Histórico da edição cita o frete de 12,50 para 20,00", String(hist?.summary ?? "").includes("frete de R$ 12,50 para R$ 20,00"), String(hist?.summary));
      const zera = await editar(A, orcId, CA, { freight_amount: 0 });
      check("editar com frete 0 zera", zera.ok === true && zera.data?.freight_amount === 0, j(zera.data?.freight_amount));
      await editar(A, orcId, CA, { freight_amount: 20 });
    });

    await rodar("a partir deste", async () => {
      console.log("\n4. Novo orçamento a partir deste");
      const copia = await salvar(A, CA, { based_on_quote_id: orcId });
      check("sem freight_amount, copia o frete da origem (20)", copia.ok === true && copia.data?.freight_amount === 20, j(copia.data?.freight_amount));
      const outro = await salvar(A, CA, { based_on_quote_id: orcId, freight_amount: 5 });
      check("com freight_amount, vale o do corpo (5)", outro.ok === true && outro.data?.freight_amount === 5, j(outro.data?.freight_amount));
    });

    await rodar("faturar", async () => {
      console.log("\n5. Faturar o orçamento");
      const v = await chamar(A.tok.owner, R.sales, "POST", "emporio/sales", {
        operation_key: chave("venda"), establishment_id: A.L1, cash_register_id: A.reg1, customer_id: CA.id,
        quote_id: orcId, items: itens(A, 5), payments: [{ kind: "dinheiro", amount: 70 }],
      });
      check("faturar sem freight_amount no corpo: 201", v.status === 201, `${v.status} ${j(v.corpo?.error)}`);
      check("a venda herda o frete do orçamento (20)", v.corpo?.data?.freight_amount === 20, j(v.corpo?.data?.freight_amount));
      check("e o total da venda é 70", v.corpo?.data?.total_amount === 70, j(v.corpo?.data?.total_amount));
      const conta = await P.financialEntry.findFirst({ where: { tenant_id: A.tenantId, related_id: idDe(v), category: "Frete de entrega" } });
      check("nasce a conta a pagar do frete de entrega", Number(conta?.amount) === 20, j(conta?.amount));

      const o2 = await salvar(A, CA, { freight_amount: 8 });
      const v2 = await chamar(A.tok.owner, R.sales, "POST", "emporio/sales", {
        operation_key: chave("venda"), establishment_id: A.L1, cash_register_id: A.reg1, customer_id: CA.id,
        quote_id: o2.data?.id, items: itens(A, 5), freight_amount: 0, payments: [{ kind: "dinheiro", amount: 50 }],
      });
      check("faturar com freight_amount 0 explícito: a venda sai sem frete", v2.status === 201 && v2.corpo?.data?.freight_amount === 0, `${v2.status} ${j(v2.corpo?.data?.freight_amount ?? v2.corpo?.error)}`);
    });

    await rodar("isolamento", async () => {
      console.log("\n6. Isolamento");
      const r = await salvar(B, CB, { freight_amount: 3 });
      check("o B salva o próprio orçamento com frete", r.ok === true && r.data?.freight_amount === 3, j(r));
      const lerDoA = await Orc.lerOrcamentoAction(B.db, B.owner, orcId);
      check("o B não lê o orçamento do A", lerDoA.ok === false, j(lerDoA));
      const editDoA = await Orc.editarOrcamentoAction(B.db, B.owner, orcId, { customer_id: CB.id, items: itens(B, 1), freight_amount: 999 });
      check("o B não edita o frete do orçamento do A", editDoA.ok === false, j(editDoA));
    });
  } finally {
    for (const id of tenantIds.reverse()) {
      await P_limpar(id);
    }
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\n✅ M117 (Módulo 39, Empório): frete no orçamento passou." : `\n❌ M117 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
  process.exit(falhas === 0 ? 0 : 1);
}

async function P_limpar(id: string) {
  const { prisma } = await import("@/lib/prisma");
  const P = prisma as Dado;
  await P.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null, replaces_sale_id: null } }).catch(() => undefined);
  await P.emporioQuote.updateMany({ where: { tenant_id: id }, data: { sale_id: null, based_on_quote_id: null } }).catch(() => undefined);
  await prisma.tenant.delete({ where: { id } }).catch((e: unknown) => console.log(`  (teardown ${id}: ${e instanceof Error ? e.message.slice(0, 100) : e})`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
