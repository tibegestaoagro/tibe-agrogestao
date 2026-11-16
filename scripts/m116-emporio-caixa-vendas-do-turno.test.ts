import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M116: Módulo 39 (Meu Empório), vendas do turno no cartão do caixa (Q325).
 * Roda: `npm run test:m116`
 *
 * O caixa aberto mostra o que as vendas concluídas do turno receberam por forma, separado do
 * saldo da gaveta (que segue só dinheiro). Cancelada sai; outra loja e outro tenant não somam.
 * Montagem copiada da m114 (tenants, lojas, turnos, rotas por Request).
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
console.log("🧾 M116: Módulo 39 (Meu Empório), vendas do turno no caixa (Q325)\n");

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
    data: { name: `M116 ${rotulo} ${stamp}`, document: `M116${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR" | "VISUALIZADOR", extra: Dado = {}) => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M116 ${suf}`, email: `m116-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id as string, role, email: u.email as string };
  };
  const owner = await mk("own", "OWNER");
  const caixa = await mk("caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const vendedor = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: [] });
  const caixaL2 = await mk("caixal2", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const semFuncao = await mk("semf", "VISUALIZADOR");

  const db = prismaForTenant(t.id) as Dado;
  const nomeL1 = `M116 ${rotulo} Loja 1`;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: nomeL1 });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M116 ${rotulo} Loja 2` });
  if (!l1.ok || !l2.ok) throw new Error(`loja: ${j(l1)} ${j(l2)}`);
  const L1 = l1.data.id as string;
  const L2 = l2.data.id as string;
  await vincularTodas(prisma as Dado, t.id, [caixa.id, vendedor.id], [L1]);
  await vincularTodas(prisma as Dado, t.id, [caixaL2.id], [L2]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M116 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M116 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
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
const erro = (r: Resp, status: number, field?: string, code?: string) =>
  r.status === status && (field === undefined || r.corpo?.error?.field === field) && (code === undefined || r.corpo?.error?.code === code);
const recusada = (r: Resp) => r.status >= 400 && r.status < 500;
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
const chave = (p: string) => `m116-${p}-${stamp}-${(seq += 1)}`;
const idDe = (r: Resp) => String(r.corpo?.data?.id ?? "");

async function cliente(w: Mundo, nome: string) {
  const { prisma } = await import("@/lib/prisma");
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: nome } as Dado })) as Dado;
}
const itens = (w: Mundo, quantity: number) => [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity }];
const pix = (amount: number, bank_account_id?: string) => ({ kind: "pix", amount, ...(bank_account_id ? { bank_account_id } : {}) });

type Loja = "L1" | "L2";
const vender = (w: Mundo, loja: Loja, cli: Dado, quantity: number, payments: Dado[], tok?: string) =>
  chamar(tok ?? w.tok.owner, R.sales, "POST", "emporio/sales", {
    operation_key: chave("venda"),
    establishment_id: w[loja],
    cash_register_id: loja === "L1" ? w.reg1 : w.reg2,
    customer_id: cli.id,
    items: itens(w, quantity),
    payments,
  });
const lerPix = (tok: string, lojaId: string) => chamar(tok, R.pixContas, "GET", `emporio/establishments/${lojaId}/pix-accounts`, undefined, lojaId);
const pagamentosDe = (r: Resp): Dado[] => (Array.isArray(r.corpo?.data?.payments) ? r.corpo.data.payments : []);

async function main() {
  const { prisma } = await import("@/lib/prisma");
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  const P = prisma as Dado;
  try {
    const A = await montar("A");
    const B = await montar("B");
    const Caixa = (await import("@/lib/actions/emporio-caixa")) as Dado;
    const Vendas = (await import("@/lib/actions/emporio-vendas")) as Dado;
    const CA = await cliente(A, "M116 Cliente A");
    const CB = await cliente(B, "M116 Cliente B");
    const conta = await Caixa.criarContaAction(A.db, A.owner, { name: `M116 PIX ${stamp}` });
    await Caixa.definirContaPixAction(A.db, A.owner, A.L1, { bank_account_id: conta.data?.id });

    const turnoDe = async (w: Mundo, caixaId: string): Promise<Dado> => {
      const r = await Caixa.lerCaixaAction(w.db, w.owner);
      const reg = (r.data?.drawers ?? []).flatMap((d: Dado) => d.registers).find((x: Dado) => x.id === caixaId);
      return reg?.turno_aberto ?? null;
    };

    await rodar("vendas do turno", async () => {
      console.log("1. Vendas do turno por forma no caixa aberto (Q325)");
      const vazio = await turnoDe(A, A.reg1);
      check("turno aberto sem venda: vendas vazias e total 0", Array.isArray(vazio?.vendas) && vazio.vendas.length === 0 && vazio.vendas_total === 0, j(vazio));

      const v1 = await vender(A, "L1", CA, 3, [{ kind: "dinheiro", amount: 30 }]);
      const v2 = await vender(A, "L1", CA, 5, [pix(50)]);
      const v3 = await vender(A, "L1", CA, 2, [{ kind: "fiado", amount: 20 }]);
      const v4 = await vender(A, "L1", CA, 4, [{ kind: "dinheiro", amount: 15 }, pix(25)]);
      check("as quatro vendas saem (201)", [v1, v2, v3, v4].every((v) => v.status === 201), [v1, v2, v3, v4].map((v) => `${v.status} ${j(v.corpo?.error ?? "")}`).join(" | "));

      const t = await turnoDe(A, A.reg1);
      const por = new Map((t?.vendas ?? []).map((x: Dado) => [x.forma, x.valor]));
      check("Dinheiro soma 45 (30 + 15)", por.get("Dinheiro") === 45, j(t?.vendas));
      check("PIX soma 75 (50 + 25), embora não esteja na gaveta", por.get("PIX") === 75, j(t?.vendas));
      check("Fiado soma 20", por.get("Fiado") === 20, j(t?.vendas));
      check("só as formas com valor aparecem, na ordem Dinheiro, PIX, Fiado", j((t?.vendas ?? []).map((x: Dado) => x.forma)) === j(["Dinheiro", "PIX", "Fiado"]), j(t?.vendas));
      check("total do turno 140", t?.vendas_total === 140, j(t));

      const caixa = await Caixa.lerCaixaAction(A.db, A.owner);
      const reg = (caixa.data?.drawers ?? []).flatMap((d: Dado) => d.registers).find((x: Dado) => x.id === A.reg1);
      check("o saldo da gaveta continua só o dinheiro (45, sem o PIX nem o fiado)", reg?.saldo === 45, j(reg));

      const cancelada = await Vendas.cancelarVendaAction(A.db, A.owner, idDe(v2), { reason: "teste M116", cash_register_id: A.reg1 });
      check("cancelar a venda de PIX 50: ok", cancelada.ok === true, j(cancelada));
      const t2 = await turnoDe(A, A.reg1);
      const por2 = new Map((t2?.vendas ?? []).map((x: Dado) => [x.forma, x.valor]));
      check("venda cancelada sai das vendas do turno: PIX 25, total 90", por2.get("PIX") === 25 && t2?.vendas_total === 90, j(t2));

      const outraLoja = await turnoDe(A, A.reg2);
      check("o turno da outra loja não recebe essas vendas (vazio)", outraLoja?.vendas_total === 0, j(outraLoja));
    });

    await rodar("isolamento", async () => {
      console.log("\n2. Isolamento entre tenants");
      const vb = await vender(B, "L1", CB, 1, [{ kind: "dinheiro", amount: 10 }]);
      check("venda no tenant B sai", vb.status === 201, `${vb.status}`);
      const tA = await turnoDe(A, A.reg1);
      check("as vendas do turno do A não somam a venda do B (segue 90)", tA?.vendas_total === 90, j(tA));
      const tB = await turnoDe(B, B.reg1);
      check("o turno do B soma só a dele (10)", tB?.vendas_total === 10, j(tB));
    });
  } finally {
    for (const id of tenantIds.reverse()) {
      await P_limpar(id);
    }
    await prisma.$disconnect();
  }

  console.log(falhas === 0 ? "\n✅ M116 (Módulo 39, Empório): vendas do turno no caixa passaram." : `\n❌ M116 (Módulo 39, Empório): ${falhas} afirmação(ões) falharam.`);
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
