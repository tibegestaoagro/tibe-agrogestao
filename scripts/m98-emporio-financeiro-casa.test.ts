import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M98: Módulo 39 (Meu Empório), financeiro das lojas, entrega 1: a casa do financeiro.
 * Roda: `npm run test:m98`
 *
 * Escrita da spec e do plano (2026-11-07), sem ler a implementação.
 *
 * Seção 1: o papel Financeiro na matriz (`pode`, `exigirUma`, páginas, destino).
 * Seção 2: a equipe cadastra o Financeiro sem loja; função inválida.
 * Seção 3: a conta da compra se paga dentro do Empório (lacuna 2.26) e a compra à vista diz de onde saiu o dinheiro.
 * Seção 4: o Empório fora do `/financeiro` do Tibé (recusa ENTRY_DO_EMPORIO e filtro de área).
 * Seção 5: a casa (today, receivables, statement, recebimento por Pix, permissões).
 * Seção 6: isolamento entre tenants.
 *
 * Fixtures: actions e Prisma direto onde a rota não existe (cheque e cartão nascem de venda, pela
 * `venderAction`; fornecedor e cliente por Prisma). O que está sob prova passa sempre pela ROTA.
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

console.log("🧾 M98: Módulo 39 (Meu Empório), financeiro das lojas, entrega 1: a casa do financeiro\n");

const tenantIds: string[] = [];
const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const diaDe = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;
const n = (x: unknown) => Number(x);
const msgDe = (x: unknown): string | undefined => (x as { message?: string }).message;

// ---------------------------------------------------------------------------
// Seção 1 (pura): a matriz do papel Financeiro
// ---------------------------------------------------------------------------

async function secao1Pura() {
  console.log("Seção 1: o papel Financeiro na matriz (sem banco)");
  const P = await import("@/lib/emporio/papel");
  type Ctx = Parameters<typeof P.pode>[0];
  const ctx = (papel: Ctx["papel"], lojas: string[] | null = null, chaves: string[] = []): Ctx => ({
    papel, lojas: lojas ? new Set(lojas) : null, chaves: new Set(chaves), soDaLoja: papel !== "dono",
  });
  const fin = ctx("financeiro");

  console.log("  a matriz de `pode` para financeiro");
  check("financeiro passa em `dinheiro`", P.pode(fin, "dinheiro") === true);
  check("financeiro passa em `fora_do_caixa` (lê tudo)", P.pode(fin, "fora_do_caixa") === true);
  check("financeiro NÃO passa em `conta`", P.pode(fin, "conta") === false);
  check("financeiro NÃO passa em `gestor_da_loja`", P.pode(fin, "gestor_da_loja") === false);
  check("financeiro NÃO passa em `vendedor_da_loja`", P.pode(fin, "vendedor_da_loja") === false);
  check("financeiro NÃO passa em `fatura_na_loja`", P.pode(fin, "fatura_na_loja") === false);
  check("financeiro NÃO passa em `chave:lancar_compra`", P.pode(fin, "chave:lancar_compra") === false);
  check("financeiro NÃO passa em nenhuma chave, nem com a loja informada", P.pode(fin, "chave:contagem", "qualquer") === false && P.pode(fin, "chave:cadastrar_produto") === false);

  console.log("  `dinheiro` soma, não substitui");
  check("dono e gerente geral passam em `dinheiro`", P.pode(ctx("dono"), "dinheiro") && P.pode(ctx("gerente_geral"), "dinheiro"));
  check("gestor, vendedor (com todas as chaves) e caixa NÃO passam em `dinheiro`",
    !P.pode(ctx("gestor", ["L"]), "dinheiro") && !P.pode(ctx("vendedor", ["L"], ["lancar_compra"]), "dinheiro") && !P.pode(ctx("caixa", ["L"]), "dinheiro"));
  check("o gestor continua passando em `gestor_da_loja` na loja dele", P.pode(ctx("gestor", ["L"]), "gestor_da_loja", "L") === true);

  console.log("  a recusa de `dinheiro`");
  const r = P.recusaDe("dinheiro") as Dado;
  check("recusaDe('dinheiro'): FORBIDDEN 403 com a frase da spec",
    r.ok === false && r.code === "FORBIDDEN" && r.status === 403 && r.message === "Só o financeiro, o gerente geral e o dono podem fazer isso.", j(r));
  check("recusaDe('dinheiro', oQue) usa o oQue",
    msgDe(P.recusaDe("dinheiro", "pagar contas")) === "Só o financeiro, o gerente geral e o dono podem pagar contas.");

  console.log("  páginas e destino");
  const Pg = await import("@/lib/emporio/paginas");
  const vend = ctx("vendedor", ["L"], ["lancar_compra"]);
  check("financeiro vê /emporio/financeiro", Pg.veAPagina(fin, "/emporio/financeiro") === true);
  check("vendedor NÃO vê /emporio/financeiro", Pg.veAPagina(vend, "/emporio/financeiro") === false);
  check("gestor NÃO vê /emporio/financeiro", Pg.veAPagina(ctx("gestor", ["L"]), "/emporio/financeiro") === false);
  check("dono vê /emporio/financeiro", Pg.veAPagina(ctx("dono"), "/emporio/financeiro") === true);
  check("financeiro vê Clientes (a ficha abre para ele) e Despesas", Pg.veAPagina(fin, "/emporio/clientes") && Pg.veAPagina(fin, "/emporio/despesas"));
  check("financeiro NÃO vê Vender nem Equipe", !Pg.veAPagina(fin, "/emporio/vender") && !Pg.veAPagina(fin, "/emporio/equipe"));
  check("o Financeiro aparece no menu só para quem passa em `dinheiro`",
    Pg.paginasVisiveis(fin).some((p) => p.href === "/emporio/financeiro") && !Pg.paginasVisiveis(vend).some((p) => p.href === "/emporio/financeiro"));

  const S = (await import("@/lib/emporio/paginas-do-so-da-loja")) as Dado;
  check("destinoDoSoDaLoja(financeiro) é /emporio/financeiro", typeof S.destinoDoSoDaLoja === "function" && S.destinoDoSoDaLoja(fin) === "/emporio/financeiro");
  check("destinoDoSoDaLoja(vendedor) segue DESTINO_DO_SO_DA_LOJA", typeof S.destinoDoSoDaLoja === "function" && S.destinoDoSoDaLoja(vend) === S.DESTINO_DO_SO_DA_LOJA);
}

// ---------------------------------------------------------------------------
// Montagem (banco): um tenant do Empório completo
// ---------------------------------------------------------------------------

async function comBanco(fn: () => Promise<void>) {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  await fn();
}

type Usuario = { id: string; role: "OWNER" | "OPERADOR"; email: string };
type Mundo = {
  rotulo: string;
  tenantId: string;
  db: Dado;
  owner: Usuario;
  gestor: Usuario; // gestor da L1
  gestor2: Usuario; // gestor só da L2
  vend: Usuario; // vendedor com a chave lancar_compra, na L1
  caixa: Usuario;
  fin: Usuario; // financeiro, sem loja
  tok: Record<"owner" | "gestor" | "gestor2" | "vend" | "caixa" | "fin", string>;
  L1: string;
  L2: string;
  conta: string;
  prodId: string;
  presId: string;
  caixa1L1: string;
  fornecedor: string;
};

let M: { A: Mundo; B: Mundo } | null = null;

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, papelFinanceiro, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const Cx = await import("@/lib/actions/emporio-caixa");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M98 ${rotulo} ${stamp}`, document: `M98${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M98 ${suf}`, email: `m98-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const papelFin = papelFinanceiro();
  const owner = await mk("own", "OWNER");
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const gestor2 = await mk("gest2", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vend = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: ["lancar_compra"] });
  const caixa = await mk("caixa", "OPERADOR", { emporio_role: "caixa", emporio_keys: [] });
  const fin = await mk("fin", "OPERADOR", papelFin);

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M98 ${rotulo} Loja 1`});
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M98 ${rotulo} Loja 2`});
  if (!l1.ok || !l2.ok) throw new Error(`lojas: ${j([l1, l2])}`);
  const L1 = l1.data.id as string;
  const L2 = l2.data.id as string;
  await vincularTodas(prisma, t.id, [gestor.id, vend.id, caixa.id], [L1]);
  await vincularTodas(prisma, t.id, [gestor2.id], [L2]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M98 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M98 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  for (const L of [L1, L2]) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
  }
  const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L1, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
  if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);

  // Dinheiro de partida: a conta (1000), a gaveta e a gerência da L1 (200 e 50), a gaveta da L2 (100, SEM turno).
  const cc = await Cx.criarContaAction(db, owner, { name: `M98 Conta ${rotulo} ${stamp}`, bank: "Banco M98" });
  if (!cc.ok) throw new Error(`conta: ${j(cc)}`);
  const conta = cc.data.id as string;
  const saldoBase = rotulo === "A" ? 1000 : 500;
  for (const input of [
    { bank_account_id: conta, amount: saldoBase },
    ...(rotulo === "A" ? [{ establishment_id: L1, amount: 200 }, { manager_establishment_id: L1, amount: 50 }, { establishment_id: L2, amount: 100 }] : []),
  ]) {
    const s = await Cx.saldoInicialCaixaAction(db, owner, input);
    if (!s.ok) throw new Error(`saldo inicial ${j(input)}: ${j(s)}`);
  }
  const caixa1L1 = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))?.id as string;
  if (rotulo === "A") await abrirTurnoDeTeste(db, owner, L1); // a L2 fica de turno fechado de propósito

  const fornecedor = (await prisma.emporioSupplier.create({ data: { tenant_id: t.id, kind: "externo", name: `M98 Fornecedor ${rotulo}` } as Dado })).id;

  const tok = {} as Mundo["tok"];
  const pares: [keyof Mundo["tok"], Usuario][] = [["owner", owner], ["gestor", gestor], ["gestor2", gestor2], ["vend", vend], ["caixa", caixa], ["fin", fin]];
  for (const [k, u] of pares) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { rotulo, tenantId: t.id, db, owner, gestor, gestor2, vend, caixa, fin, tok, L1, L2, conta, prodId: prod.data.id, presId: pres.data.id, caixa1L1, fornecedor };
}

// Rotas (import literal, para o bundler do tsx resolver os colchetes)
const R = {
  team: () => import("@/app/api/v1/emporio/team/route"),
  purchases: () => import("@/app/api/v1/emporio/purchases/route"),
  purchaseCancel: () => import("@/app/api/v1/emporio/purchases/[id]/cancel/route"),
  payables: () => import("@/app/api/v1/emporio/payables/route"),
  payablesPay: () => import("@/app/api/v1/emporio/payables/pay/route"),
  payableDue: () => import("@/app/api/v1/emporio/payables/[id]/due-date/route"),
  payableCancel: () => import("@/app/api/v1/emporio/payables/[id]/cancel/route"),
  today: () => import("@/app/api/v1/emporio/finance/today/route"),
  receivables: () => import("@/app/api/v1/emporio/finance/receivables/route"),
  statement: () => import("@/app/api/v1/emporio/finance/statement/route"),
  receive: () => import("@/app/api/v1/emporio/receivables/receive/route"),
  bankAccounts: () => import("@/app/api/v1/emporio/bank-accounts/route"),
  pix: () => import("@/app/api/v1/emporio/establishments/[id]/pix-account/route"),
  customers: () => import("@/app/api/v1/emporio/customers/route"),
  customer: () => import("@/app/api/v1/emporio/customers/[id]/route"),
  entries: () => import("@/app/api/v1/financial-entries/route"),
  entryPay: () => import("@/app/api/v1/financial-entries/[id]/pay/route"),
  entryPayments: () => import("@/app/api/v1/financial-entries/[id]/payments/route"),
  entryPaymentDel: () => import("@/app/api/v1/financial-entries/[id]/payments/[paymentId]/route"),
  entryPostpone: () => import("@/app/api/v1/financial-entries/[id]/postpone/route"),
  entryCancel: () => import("@/app/api/v1/financial-entries/[id]/cancel/route"),
  dre: () => import("@/app/api/v1/financial/dre/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, corpo?: unknown, id?: string | Record<string, string>): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  let m: Dado;
  try {
    m = await rota();
  } catch (e) {
    // rota ainda não existe (a implementação está pendente): reprova só as afirmações dela, não a seção inteira
    return { status: 0, corpo: { import_error: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve(typeof id === "string" ? { id } : id) }));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}
const erro = (r: Resp, status: number, code?: string, field?: string) =>
  r.status === status && (code === undefined || r.corpo?.error?.code === code) && (field === undefined || r.corpo?.error?.field === field);

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m98-${p}-${stamp}-${(seq += 1)}`;

/** Compra pela rota. `payment` padrão: a prazo, vencendo em `vence` (YYYY-MM-DD). */
function comprar(w: Mundo, tok: string, corpo: Dado = {}, loja?: string): Promise<Resp> {
  return chamar(tok, R.purchases, "POST", "emporio/purchases", {
    operation_key: chave("compra"),
    establishment_id: loja ?? w.L1,
    purchased_at: new Date().toISOString(),
    received: false,
    items: [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: 1, item_total: 100 }],
    payment: { kind: "a_prazo", due_date: `${somaDias(hojeStr, -1)}T12:00:00Z` },
    ...corpo,
  });
}
const entradaDaCompra = async (w: Mundo, compraId: string) =>
  (await w.db.financialEntry.findFirst({ where: { related_module: "emporio", related_id: compraId, entry_type: "expense" } })) as Dado;
const listaPagar = async (tok: string, qs = "status=pending&limit=500") => {
  const r = await chamar(tok, R.payables, "GET", `emporio/payables?${qs}`);
  const d = r.corpo?.data;
  return { r, itens: (Array.isArray(d) ? d : (d?.items ?? [])) as Dado[] };
};
const saldoContaDb = async (w: Mundo, conta: string) => {
  const ms = (await w.db.cashMovement.findMany({ where: { bank_account_id: conta } })) as Dado[];
  const ps = (await w.db.cardReceivable.findMany({ where: { bank_account_id: conta, canceled_at: null } })) as Dado[];
  return ms.reduce((s, m) => s + (m.direction === "entrada" ? n(m.amount) : -n(m.amount)), 0)
    + ps.filter((p) => diaDe(p.expected_on) <= hojeStr).reduce((s, p) => s + n(p.net_amount), 0);
};

// ---------------------------------------------------------------------------
// Seção 1 (banco): exigirUma e o contexto carregado
// ---------------------------------------------------------------------------

async function secao1Banco() {
  console.log("\nSeção 1 (banco): exigirUma e o contexto do financeiro carregado");
  const { A } = M!;
  const P = await import("@/lib/emporio/papel");
  const ctxFin = await P.papelDoEmporio(A.db, A.fin);
  check("o contexto do financeiro: papel, todas as lojas (nulo), sem chaves, soDaLoja",
    ctxFin.papel === "financeiro" && ctxFin.lojas === null && ctxFin.chaves.size === 0 && ctxFin.soDaLoja === true, j({ ...ctxFin, lojas: ctxFin.lojas, chaves: [...ctxFin.chaves] }));
  const user = (await A.db.user.findFirst({ where: { id: A.fin.id } })) as Dado;
  check("o usuário Financeiro nasceu emporio_only", user?.emporio_only === true && user?.emporio_role === "financeiro");

  const acoes = ["gestor_da_loja", "dinheiro"] as const;
  check("exigirUma: nulo quando uma passa (financeiro, `dinheiro`)", (await P.exigirUma(A.db, A.fin, [...acoes])) === null);
  check("exigirUma: nulo quando a outra passa (gestor da loja, `gestor_da_loja`)", (await P.exigirUma(A.db, A.gestor, [...acoes])) === null);
  check("exigirUma: nulo para o dono", (await P.exigirUma(A.db, A.owner, [...acoes])) === null);
  const neg = (await P.exigirUma(A.db, A.vend, [...acoes])) as Dado;
  check("exigirUma: nenhuma passa (vendedor) recusa FORBIDDEN 403", neg && neg.ok === false && neg.code === "FORBIDDEN" && neg.status === 403, j(neg));
  check("exigirUma: a recusa é a da PRIMEIRA ação da lista", neg?.message === msgDe(P.recusaDe("gestor_da_loja")) && neg?.message !== msgDe(P.recusaDe("dinheiro")), j(neg));
  const neg2 = (await P.exigirUma(A.db, A.vend, ["dinheiro", "gestor_da_loja"])) as Dado;
  check("exigirUma: invertida a lista, vira a recusa de `dinheiro`", neg2?.message === msgDe(P.recusaDe("dinheiro")), j(neg2));
  const neg3 = (await P.exigirUma(A.db, A.vend, [...acoes], "pagar contas")) as Dado;
  check("exigirUma com oQue: a frase leva o oQue", typeof neg3?.message === "string" && neg3.message.includes("pagar contas"), j(neg3));
  check("exigirUma: o financeiro NÃO passa só por `gestor_da_loja`", (await P.exigirUma(A.db, A.fin, ["gestor_da_loja"])) !== null);
}

// ---------------------------------------------------------------------------
// Seção 2: equipe
// ---------------------------------------------------------------------------

async function secao2() {
  console.log("\nSeção 2: a equipe cadastra o Financeiro");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");
  const email = `m98-novo-fin-${stamp}@teste.local`;
  const r = await chamar(A.tok.owner, R.team, "POST", "emporio/team", { name: "M98 Novo Financeiro", email, emporio_role: "financeiro" });
  check("cadastrar Financeiro SEM establishment_ids: 201", r.status === 201, `${r.status} ${j(r.corpo)}`);
  const u = await prisma.user.findFirst({ where: { email } });
  check("o usuário nasce com emporio_role financeiro, emporio_only e role OPERADOR",
    !!u && (u as Dado).emporio_role === "financeiro" && (u as Dado).emporio_only === true && u.role === "OPERADOR", j(u));
  const vinc = u ? await prisma.userEstablishment.count({ where: { user_id: u.id } }) : -1;
  check("o Financeiro não ganha vínculo de loja", vinc === 0, String(vinc));

  const rVend = await chamar(A.tok.owner, R.team, "POST", "emporio/team", { name: "M98 Vend sem loja", email: `m98-vsl-${stamp}@teste.local`, emporio_role: "vendedor" });
  check("o vendedor SEM loja continua recusado (a regra de lojas não afrouxou)", rVend.status === 422, `${rVend.status} ${j(rVend.corpo)}`);

  const rInv = await chamar(A.tok.owner, R.team, "POST", "emporio/team", { name: "M98 Inválido", email: `m98-inv-${stamp}@teste.local`, emporio_role: "contador" });
  check("função inválida: 422 emporio_role",
    erro(rInv, 422, "VALIDATION_ERROR", "emporio_role"), `${rInv.status} ${j(rInv.corpo)}`);
  check("função inválida: a frase lista o financeiro",
    rInv.corpo?.error?.message === "Escolha a função: gerente geral, financeiro, gestor, vendedor ou caixa.", String(rInv.corpo?.error?.message));

  const rGestor = await chamar(A.tok.gestor, R.team, "POST", "emporio/team", { name: "M98 Fin do gestor", email: `m98-fg-${stamp}@teste.local`, emporio_role: "financeiro" });
  check("o Gestor não cadastra Financeiro: 403 (Equipe é `conta`)", rGestor.status === 403, `${rGestor.status}`);
  const rFinEq = await chamar(A.tok.fin, R.team, "POST", "emporio/team", { name: "M98 Fin faz equipe", email: `m98-ff-${stamp}@teste.local`, emporio_role: "caixa", establishment_ids: [A.L1] });
  check("o Financeiro não mexe em equipe: 403", rFinEq.status === 403, `${rFinEq.status}`);
}

// ---------------------------------------------------------------------------
// Seção 3: a conta da compra e a compra à vista
// ---------------------------------------------------------------------------

async function secao3() {
  console.log("\nSeção 3: a conta da compra se paga dentro do Empório (2.26)");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");

  console.log("  a compra a prazo aparece nas contas a pagar");
  const c1 = await comprar(A, A.tok.gestor, { supplier_id: A.fornecedor });
  check("compra a prazo pelo Gestor: 201", c1.status === 201, `${c1.status} ${j(c1.corpo)}`);
  const compra1 = c1.corpo?.data?.id as string;
  const e1 = await entradaDaCompra(A, compra1);
  const l1 = await listaPagar(A.tok.fin);
  check("o Financeiro lê as contas a pagar: 200", l1.r.status === 200, `${l1.r.status} ${j(l1.r.corpo)}`);
  const v1 = l1.itens.find((x) => x.entry_id === e1?.id);
  check("a conta da compra aparece com origin 'compra'", v1?.origin === "compra", j(v1));
  check("a linha carrega purchase_id e supplier_name do fornecedor", v1?.purchase_id === compra1 && v1?.supplier_name === `M98 Fornecedor A`, j(v1));
  check("para a compra, name é o nome do fornecedor", v1?.name === "M98 Fornecedor A", j(v1));
  check("a conta mostra a loja da compra", v1?.establishment_id === A.L1, j(v1));
  const c1b = await comprar(A, A.tok.gestor, {});
  const e1b = await entradaDaCompra(A, c1b.corpo?.data?.id);
  const l1b = await listaPagar(A.tok.fin);
  check("compra sem fornecedor: name 'Compra sem fornecedor' e supplier_name nulo",
    (() => { const v = l1b.itens.find((x) => x.entry_id === e1b?.id); return v?.name === "Compra sem fornecedor" && v?.supplier_name === null; })(), j(l1b.itens.find((x) => x.entry_id === e1b?.id)));

  console.log("  pagar pela conta (o Financeiro)");
  const antes = await saldoContaDb(A, A.conta);
  const pagar = (tok: string, corpo: Dado) => chamar(tok, R.payablesPay, "POST", "emporio/payables/pay", corpo);
  const pgGav = await pagar(A.tok.fin, { entry_ids: [e1.id], from: { establishment_id: A.L1 } });
  check("Financeiro pagando da gaveta: 422 no campo from", erro(pgGav, 422, "VALIDATION_ERROR", "from"), `${pgGav.status} ${j(pgGav.corpo)}`);
  check("a recusa diz que o Financeiro paga pela conta bancária",
    pgGav.corpo?.error?.message === "O Financeiro paga pela conta bancária; o dinheiro da gaveta é com a loja.", String(pgGav.corpo?.error?.message));
  check("nada gravado na recusa: a conta segue pendente e sem pagamento",
    (await A.db.financialEntry.findFirst({ where: { id: e1.id } })).status === "pending" && (await A.db.financialPayment.count({ where: { entry_id: e1.id } })) === 0);

  const pg = await pagar(A.tok.fin, { entry_ids: [e1.id], from: { bank_account_id: A.conta } });
  check("Financeiro pagando pela conta: 201", pg.status === 201, `${pg.status} ${j(pg.corpo)}`);
  const ent1 = (await A.db.financialEntry.findFirst({ where: { id: e1.id } })) as Dado;
  check("a conta da compra fecha (status paid)", ent1.status === "paid", String(ent1.status));
  const fp = (await A.db.financialPayment.findMany({ where: { entry_id: e1.id } })) as Dado[];
  check("nasce UM FinancialPayment de 100", fp.length === 1 && perto(n(fp[0].amount), 100), j(fp));
  const mv = (fp[0] ? await A.db.cashMovement.findMany({ where: { financial_payment_id: fp[0].id } }) : []) as Dado[];
  check("nasce UM CashMovement de saída, de 100, na conta, sem gaveta e sem gerência",
    mv.length === 1 && mv[0].direction === "saida" && perto(n(mv[0].amount), 100) && mv[0].bank_account_id === A.conta && mv[0].establishment_id === null && mv[0].manager_establishment_id === null, j(mv));
  check("a origem do movimento é pagamento_despesa", mv[0]?.origin === "pagamento_despesa", String(mv[0]?.origin));
  check("o saldo da conta caiu 100 (soma das movimentações, nada gravado)", perto((await saldoContaDb(A, A.conta)), antes - 100), `${antes} -> ${await saldoContaDb(A, A.conta)}`);
  const hist = await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "despesa.pagar" } });
  check("o Histórico grava despesa.pagar", hist.length >= 1);
  const l2 = await listaPagar(A.tok.fin);
  check("a conta paga some das pendentes", !l2.itens.some((x) => x.entry_id === e1.id));

  console.log("  o gestor só da loja, conta da compra de OUTRA loja");
  const c2 = await comprar(A, A.tok.gestor, { supplier_id: A.fornecedor });
  const compra2 = c2.corpo?.data?.id as string;
  const e2 = await entradaDaCompra(A, compra2);
  const pgOutra = await pagar(A.tok.gestor2, { entry_ids: [e2.id], from: { bank_account_id: A.conta } });
  check("Gestor da L2 pagando a conta da compra da L1 pela conta: 404 Estabelecimento",
    pgOutra.status === 404 && /Estabelecimento/i.test(String(pgOutra.corpo?.error?.message)), `${pgOutra.status} ${j(pgOutra.corpo)}`);
  check("a conta da L1 seguiu pendente", (await A.db.financialEntry.findFirst({ where: { id: e2.id } })).status === "pending");
  const pgGest = await pagar(A.tok.gestor, { entry_ids: [e2.id], from: { bank_account_id: A.conta } });
  check("o Gestor da L1 paga a mesma conta pela conta: 201 (o que ele fazia, ele continua fazendo)", pgGest.status === 201, `${pgGest.status} ${j(pgGest.corpo)}`);
  const pgVend = await pagar(A.tok.vend, { entry_ids: [e2.id], from: { bank_account_id: A.conta } });
  check("o Vendedor com a chave não paga conta: 403", pgVend.status === 403, `${pgVend.status}`);

  console.log("  adiar e cancelar a conta");
  const c3 = await comprar(A, A.tok.gestor, { supplier_id: A.fornecedor });
  const e3 = await entradaDaCompra(A, c3.corpo?.data?.id);
  const novaData = `${somaDias(hojeStr, 10)}T12:00:00Z`;
  const adiar = (tok: string, id: string, corpo: Dado) => chamar(tok, R.payableDue, "PATCH", `emporio/payables/${id}/due-date`, corpo, id);
  const cancelar = (tok: string, id: string, corpo: Dado) => chamar(tok, R.payableCancel, "POST", `emporio/payables/${id}/cancel`, corpo, id);
  const rAd = await adiar(A.tok.fin, e3.id, { due_date: novaData });
  check("adiar o vencimento da conta pendente (Financeiro): 200", rAd.status === 200, `${rAd.status} ${j(rAd.corpo)}`);
  check("o vencimento mudou no banco", diaDe((await A.db.financialEntry.findFirst({ where: { id: e3.id } })).due_date) === somaDias(hojeStr, 10));
  check("o Histórico grava despesa.adiar", (await prisma.emporioAuditLog.count({ where: { tenant_id: A.tenantId, action: "despesa.adiar" } })) >= 1);
  const rAdPaga = await adiar(A.tok.fin, e1.id, { due_date: novaData });
  check("adiar conta já paga: 422 NOT_PENDING no due_date", erro(rAdPaga, 422, "NOT_PENDING", "due_date"), `${rAdPaga.status} ${j(rAdPaga.corpo)}`);
  const rAdLixo = await adiar(A.tok.fin, e3.id, { due_date: "lixo" });
  check("adiar com data inválida: 422 due_date", rAdLixo.status === 422 && rAdLixo.corpo?.error?.field === "due_date", `${rAdLixo.status} ${j(rAdLixo.corpo)}`);
  const rAdVend = await adiar(A.tok.vend, e3.id, { due_date: novaData });
  check("o Vendedor não adia conta: 403", rAdVend.status === 403, `${rAdVend.status}`);

  const rCaPaga = await cancelar(A.tok.fin, e1.id, { reason: "engano" });
  check("cancelar conta que já tem pagamento: 422 ENTRY_HAS_PAYMENTS",
    erro(rCaPaga, 422, "ENTRY_HAS_PAYMENTS") && rCaPaga.corpo?.error?.message === "Esta conta já tem pagamento registrado.", `${rCaPaga.status} ${j(rCaPaga.corpo)}`);
  const rCaSem = await cancelar(A.tok.fin, e3.id, {});
  check("cancelar sem motivo: 422 reason", rCaSem.status === 422 && rCaSem.corpo?.error?.field === "reason", `${rCaSem.status} ${j(rCaSem.corpo)}`);
  const rCa = await cancelar(A.tok.fin, e3.id, { reason: "lançada em duplicidade" });
  check("cancelar a conta pendente sem pagamento: 200", rCa.status === 200 || rCa.status === 201, `${rCa.status} ${j(rCa.corpo)}`);
  const ent3 = (await A.db.financialEntry.findFirst({ where: { id: e3.id } })) as Dado;
  check("a conta fica cancelled e o motivo vai para as notas", ent3.status === "cancelled" && String(ent3.notes ?? "").includes("lançada em duplicidade"), j(ent3));
  const compra3 = (await A.db.emporioPurchase.findFirst({ where: { id: c3.corpo?.data?.id } })) as Dado;
  check("cancelar a CONTA não cancela a compra", compra3?.canceled_at === null);
  check("o Histórico grava despesa.cancelar", (await prisma.emporioAuditLog.count({ where: { tenant_id: A.tenantId, action: "despesa.cancelar" } })) >= 1);
  const rCaVend = await cancelar(A.tok.vend, e2.id, { reason: "x" });
  check("o Vendedor não cancela conta: 403", rCaVend.status === 403, `${rCaVend.status}`);

  console.log("  compra cancelada some das contas a pagar");
  const c4 = await comprar(A, A.tok.gestor, { supplier_id: A.fornecedor });
  const compra4 = c4.corpo?.data?.id as string;
  const e4 = await entradaDaCompra(A, compra4);
  check("antes de cancelar a compra, a conta aparece pendente", (await listaPagar(A.tok.fin)).itens.some((x) => x.entry_id === e4.id));
  const rCc = await chamar(A.tok.gestor, R.purchaseCancel, "POST", `emporio/purchases/${compra4}/cancel`, { reason: "m98" }, compra4);
  check("cancelar a compra (sem pagamento): 200", rCc.status === 200 || rCc.status === 201, `${rCc.status} ${j(rCc.corpo)}`);
  check("depois, a conta da compra cancelada NÃO aparece nas pendentes", !(await listaPagar(A.tok.fin)).itens.some((x) => x.entry_id === e4.id));
  const pgCanc = await pagar(A.tok.fin, { entry_ids: [e4.id], from: { bank_account_id: A.conta } });
  check("e não se paga: recusa (não 201) e nenhum pagamento gravado",
    pgCanc.status >= 400 && (await A.db.financialPayment.count({ where: { entry_id: e4.id } })) === 0, `${pgCanc.status} ${j(pgCanc.corpo)}`);

  console.log("  compra à vista: de onde saiu o dinheiro");
  const itensAvista = (total: number) => [{ emporio_product_id: A.prodId, presentation_id: A.presId, quantity: 1, item_total: total }];
  const avista = (tok: string, total: number, paid_from?: Dado, loja?: string) =>
    comprar(A, tok, { items: itensAvista(total), payment: { kind: "a_vista", ...(paid_from === undefined ? {} : { paid_from }) } }, loja);
  const contagens = async () =>
    j([
      await prisma.emporioPurchase.count({ where: { tenant_id: A.tenantId } }),
      await prisma.financialEntry.count({ where: { tenant_id: A.tenantId } }),
      await prisma.financialPayment.count({ where: { tenant_id: A.tenantId } }),
      await prisma.cashMovement.count({ where: { tenant_id: A.tenantId } }),
    ]);

  const k0 = await contagens();
  const semLugar = await avista(A.tok.gestor, 20);
  check("à vista sem paid_from: 422 paid_from", erro(semLugar, 422, "VALIDATION_ERROR", "paid_from"), `${semLugar.status} ${j(semLugar.corpo)}`);
  check("a frase pede de onde saiu o dinheiro",
    semLugar.corpo?.error?.message === "Diga de onde saiu o dinheiro da compra: a gaveta da loja ou uma conta.", String(semLugar.corpo?.error?.message));
  const doisLugares = await avista(A.tok.gestor, 20, { establishment_id: A.L1, bank_account_id: A.conta });
  check("os dois lugares ao mesmo tempo: 422 paid_from", erro(doisLugares, 422, "VALIDATION_ERROR", "paid_from"), `${doisLugares.status} ${j(doisLugares.corpo)}`);
  const nenhum = await avista(A.tok.gestor, 20, {});
  check("paid_from vazio (nenhum lugar): 422 paid_from", erro(nenhum, 422, "VALIDATION_ERROR", "paid_from"), `${nenhum.status} ${j(nenhum.corpo)}`);
  const gavOutra = await avista(A.tok.gestor, 20, { establishment_id: A.L2 });
  check("gaveta de OUTRA loja que a da compra: 422 paid_from", erro(gavOutra, 422, "VALIDATION_ERROR", "paid_from"), `${gavOutra.status} ${j(gavOutra.corpo)}`);
  check("a frase: o dinheiro da gaveta sai da loja da compra", gavOutra.corpo?.error?.message === "O dinheiro da gaveta sai da loja da compra.", String(gavOutra.corpo?.error?.message));
  check("nenhuma dessas recusas gravou nada", (await contagens()) === k0);

  const k1 = await contagens();
  const fechado = await avista(A.tok.owner, 20, { establishment_id: A.L2 }, A.L2);
  check("à vista da gaveta com o turno FECHADO: CASH_CLOSED", fechado.status >= 400 && fechado.corpo?.error?.code === "CASH_CLOSED", `${fechado.status} ${j(fechado.corpo)}`);
  check("e NADA fica gravado (compra, conta, pagamento, movimento)", (await contagens()) === k1, `${k1} -> ${await contagens()}`);

  const venc = await avista(A.tok.gestor, 20, { bank_account_id: A.conta });
  void venc;
  const semSaldo = await avista(A.tok.gestor, 9_999_999, { bank_account_id: A.conta });
  check("à vista da conta sem saldo: 409 INSUFFICIENT_CASH", erro(semSaldo, 409, "INSUFFICIENT_CASH"), `${semSaldo.status} ${j(semSaldo.corpo)}`);
  const semSaldoGav = await avista(A.tok.gestor, 9_999_999, { establishment_id: A.L1 });
  check("à vista da gaveta sem saldo: 409 INSUFFICIENT_CASH", erro(semSaldoGav, 409, "INSUFFICIENT_CASH"), `${semSaldoGav.status} ${j(semSaldoGav.corpo)}`);

  const kV = await contagens();
  const vendConta = await avista(A.tok.vend, 20, { bank_account_id: A.conta });
  check("à vista pela CONTA, pelo Vendedor com a chave lancar_compra: 403", vendConta.status === 403, `${vendConta.status} ${j(vendConta.corpo)}`);
  check("o 403 não gravou nada", (await contagens()) === kV);
  const finCompra = await avista(A.tok.fin, 20, { bank_account_id: A.conta });
  check("o Financeiro não lança compra: 403", finCompra.status === 403, `${finCompra.status} ${j(finCompra.corpo)}`);

  const saldoAntesConta = await saldoContaDb(A, A.conta);
  const gestConta = await avista(A.tok.gestor, 20, { bank_account_id: A.conta });
  check("à vista pela conta, pelo Gestor: 201", gestConta.status === 201, `${gestConta.status} ${j(gestConta.corpo)}`);
  const mvC = (await A.db.cashMovement.findMany({ where: { origin: "pagamento_compra", bank_account_id: A.conta } })) as Dado[];
  check("nasce um CashMovement pagamento_compra de saída de 20 na conta (sem loja, sem gaveta)",
    mvC.length >= 1 && mvC.some((m) => m.direction === "saida" && perto(n(m.amount), 20) && m.establishment_id === null && m.financial_payment_id), j(mvC));
  check("o saldo da conta caiu 20", perto(await saldoContaDb(A, A.conta), saldoAntesConta - 20));

  const gavAntes = n((await A.db.cashMovement.findMany({ where: { establishment_id: A.L1 } }) as Dado[]).reduce((s, m) => s + (m.direction === "entrada" ? n(m.amount) : -n(m.amount)), 0));
  const gestGav = await avista(A.tok.gestor, 30, { establishment_id: A.L1 });
  check("à vista da gaveta da L1 com turno aberto, pelo Gestor: 201", gestGav.status === 201, `${gestGav.status} ${j(gestGav.corpo)}`);
  const mvG = (await A.db.cashMovement.findMany({ where: { origin: "pagamento_compra", establishment_id: A.L1 } })) as Dado[];
  check("nasce um CashMovement pagamento_compra de saída de 30 na gaveta da L1, no caixa do turno",
    mvG.length === 1 && mvG[0].direction === "saida" && perto(n(mvG[0].amount), 30) && !!mvG[0].cash_session_id && mvG[0].bank_account_id === null, j(mvG));
  const gavDepois = n((await A.db.cashMovement.findMany({ where: { establishment_id: A.L1 } }) as Dado[]).reduce((s, m) => s + (m.direction === "entrada" ? n(m.amount) : -n(m.amount)), 0));
  check("a gaveta caiu 30", perto(gavDepois, gavAntes - 30), `${gavAntes} -> ${gavDepois}`);
  const vendGav = await avista(A.tok.vend, 10, { establishment_id: A.L1 });
  check("o Vendedor com a chave paga da GAVETA da loja dele: 201", vendGav.status === 201, `${vendGav.status} ${j(vendGav.corpo)}`);
  const histCompra = await prisma.emporioAuditLog.findFirst({ where: { tenant_id: A.tenantId, action: "compra.criar", target_id: gestGav.corpo?.data?.id } });
  check("o compra.criar registra o lugar de onde saiu o dinheiro", !!histCompra && JSON.stringify(histCompra).length > 0 && /gaveta|caixa|dinheiro/i.test(JSON.stringify(histCompra)), j(histCompra));

  const prazoSemLugar = await comprar(A, A.tok.gestor, { supplier_id: A.fornecedor });
  check("compra a PRAZO segue sem paid_from: 201", prazoSemLugar.status === 201, `${prazoSemLugar.status}`);
  const entrada = await avista(A.tok.gestor, 50, undefined);
  void entrada;
  const parcelada = await comprar(A, A.tok.gestor, { items: itensAvista(100), payment: { kind: "parcelada", down_payment: 40, installments: [{ amount: 60, due_date: `${somaDias(hojeStr, 20)}T12:00:00Z` }] } });
  check("parcelada com entrada e sem paid_from: 422 paid_from", erro(parcelada, 422, "VALIDATION_ERROR", "paid_from"), `${parcelada.status} ${j(parcelada.corpo)}`);
  const parceladaOk = await comprar(A, A.tok.gestor, { items: itensAvista(100), payment: { kind: "parcelada", down_payment: 40, installments: [{ amount: 60, due_date: `${somaDias(hojeStr, 20)}T12:00:00Z` }], paid_from: { bank_account_id: A.conta } } });
  check("parcelada com entrada e paid_from da conta: 201", parceladaOk.status === 201, `${parceladaOk.status} ${j(parceladaOk.corpo)}`);
  const mvEnt = (await A.db.cashMovement.findMany({ where: { origin: "pagamento_compra", bank_account_id: A.conta } })) as Dado[];
  check("a entrada da parcelada saiu da conta (40)", mvEnt.some((m) => perto(n(m.amount), 40) && m.direction === "saida"), j(mvEnt));
}

// ---------------------------------------------------------------------------
// Seção 4: o Empório fora do /financeiro do Tibé
// ---------------------------------------------------------------------------

async function secao4() {
  console.log("\nSeção 4: o Empório fora do /financeiro do Tibé");
  const { A } = M!;
  const { scoped } = await import("@/lib/prisma");
  const MSG = "Esta conta é do Empório: pague, adie ou cancele em Meu Empório > Financeiro.";
  const c = await comprar(A, A.tok.gestor, { supplier_id: A.fornecedor });
  const compraId = c.corpo?.data?.id as string;
  const e = await entradaDaCompra(A, compraId);
  check("a conta da compra existe e pertence ao Empório (loja e módulo)", !!e && e.related_module === "emporio" && e.establishment_id === A.L1, j(e));
  const antes = j([await A.db.financialPayment.count({ where: { entry_id: e.id } }), (await A.db.financialEntry.findFirst({ where: { id: e.id } })).status, diaDe((await A.db.financialEntry.findFirst({ where: { id: e.id } })).due_date)]);

  const rPay = await chamar(A.tok.owner, R.entryPay, "PATCH", `financial-entries/${e.id}/pay`, {}, e.id);
  check("OWNER: PATCH financial-entries/:id/pay numa conta do Empório: 422 ENTRY_DO_EMPORIO", erro(rPay, 422, "ENTRY_DO_EMPORIO"), `${rPay.status} ${j(rPay.corpo)}`);
  check("a mensagem aponta para Meu Empório > Financeiro", rPay.corpo?.error?.message === MSG, String(rPay.corpo?.error?.message));
  const rPays = await chamar(A.tok.owner, R.entryPayments, "POST", `financial-entries/${e.id}/payments`, { amount: 10 }, e.id);
  check("OWNER: POST .../payments numa conta do Empório: 422 ENTRY_DO_EMPORIO", erro(rPays, 422, "ENTRY_DO_EMPORIO"), `${rPays.status} ${j(rPays.corpo)}`);
  const rPost = await chamar(A.tok.owner, R.entryPostpone, "PATCH", `financial-entries/${e.id}/postpone`, { due_date: new Date(Date.now() + 5 * DIA).toISOString() }, e.id);
  check("OWNER: PATCH .../postpone numa conta do Empório: 422 ENTRY_DO_EMPORIO", erro(rPost, 422, "ENTRY_DO_EMPORIO"), `${rPost.status} ${j(rPost.corpo)}`);
  const rCan = await chamar(A.tok.owner, R.entryCancel, "PATCH", `financial-entries/${e.id}/cancel`, {}, e.id);
  check("OWNER: PATCH .../cancel numa conta do Empório: 422 ENTRY_DO_EMPORIO", erro(rCan, 422, "ENTRY_DO_EMPORIO"), `${rCan.status} ${j(rCan.corpo)}`);
  const depois = j([await A.db.financialPayment.count({ where: { entry_id: e.id } }), (await A.db.financialEntry.findFirst({ where: { id: e.id } })).status, diaDe((await A.db.financialEntry.findFirst({ where: { id: e.id } })).due_date)]);
  check("as quatro recusas não mudaram nada (pagamento, status, vencimento)", antes === depois, `${antes} -> ${depois}`);

  // Desfazer pagamento também é mexer na conta do Empório: a recusa vale para o DELETE do pagamento.
  const empPaga = await A.db.financialEntry.create({
    data: scoped({ entry_type: "expense", category: "M98 conta paga do Empório", amount: 10, due_date: new Date(), paid_at: new Date(), status: "paid", related_module: "emporio", establishment_id: A.L1 }) as Dado,
  });
  const pgEmp = await A.db.financialPayment.create({ data: scoped({ entry_id: empPaga.id, amount: 10, paid_at: new Date(), method: "pix" }) as Dado });
  const rDel = await chamar(A.tok.owner, R.entryPaymentDel, "DELETE", `financial-entries/${empPaga.id}/payments/${pgEmp.id}`, undefined, { id: empPaga.id, paymentId: pgEmp.id });
  check("OWNER: DELETE .../payments/:paymentId de pagamento de conta do Empório: 422 ENTRY_DO_EMPORIO", erro(rDel, 422, "ENTRY_DO_EMPORIO"), `${rDel.status} ${j(rDel.corpo)}`);
  check("e o pagamento continua existindo (a conta segue paga)", (await A.db.financialPayment.count({ where: { id: pgEmp.id } })) === 1 && (await A.db.financialEntry.findFirst({ where: { id: empPaga.id } })).status === "paid");

  const rNada = await chamar(A.tok.owner, R.entryPay, "PATCH", "financial-entries/nao-existe/pay", {}, "nao-existe");
  check("entry inexistente segue 404 (a recusa vem DEPOIS do 404)", rNada.status === 404, `${rNada.status} ${j(rNada.corpo)}`);

  // Uma conta da fazenda (sem loja) continua se pagando pelo Tibé: a trava não pode ser larga demais.
  const fazenda = await A.db.financialEntry.create({
    data: scoped({ entry_type: "expense", category: "M98 conta da fazenda", amount: 10, due_date: new Date(), status: "pending", related_module: "geral" }) as Dado,
  });
  const rFaz = await chamar(A.tok.owner, R.entryPay, "PATCH", `financial-entries/${fazenda.id}/pay`, {}, fazenda.id);
  check("conta da fazenda (sem loja): o pagamento pelo Tibé segue 200", rFaz.status === 200, `${rFaz.status} ${j(rFaz.corpo)}`);

  console.log("  o filtro de área ignora o Empório");
  const per = `start=${encodeURIComponent(new Date(Date.now() - 60 * DIA).toISOString())}&end=${encodeURIComponent(new Date(Date.now() + 60 * DIA).toISOString())}`;
  const emporioIds = ((await A.db.financialEntry.findMany({ where: { OR: [{ establishment_id: { not: null } }, { related_module: "emporio" }] }, select: { id: true } })) as Dado[]).map((x) => x.id);
  check("(fixture) há contas do Empório no tenant para o filtro esconder", emporioIds.length >= 3, String(emporioIds.length));
  for (const area of ["emporio", "tudo", "fazenda", ""]) {
    const r = await chamar(A.tok.owner, R.entries, "GET", `financial-entries?${area ? `area=${area}&` : ""}${per}`);
    const itens = (r.corpo?.data ?? []) as Dado[];
    check(`GET financial-entries com area=${area || "(vazio)"}: 200 e NENHUMA conta do Empório`,
      r.status === 200 && itens.every((x) => !emporioIds.includes(x.id) && (x.establishment_id ?? null) === null) && itens.some((x) => x.id === fazenda.id), `${r.status} ${itens.length}`);
  }
  const dreEmp = (await chamar(A.tok.owner, R.dre, "GET", `financial/dre?area=emporio&${per}`)).corpo?.data;
  const dreFaz = (await chamar(A.tok.owner, R.dre, "GET", `financial/dre?area=fazenda&${per}`)).corpo?.data;
  const dreTudo = (await chamar(A.tok.owner, R.dre, "GET", `financial/dre?area=tudo&${per}`)).corpo?.data;
  check("DRE area=tudo é igual ao da fazenda (não soma o Empório)", j(dreTudo) === j(dreFaz) && !!dreTudo, j(dreTudo));
  check("DRE area=emporio também vira o da fazenda (a área é ignorada)", j(dreEmp) === j(dreFaz));
  check("o DRE enxerga a despesa de 10 da fazenda e só ela", perto(n(dreTudo?.total_expense ?? dreTudo?.total_expenses ?? NaN), 10) || perto(n(dreTudo?.total_result), -10), j(dreTudo));
  const rInv = await chamar(A.tok.owner, R.entries, "GET", `financial-entries?area=lixo&${per}`);
  check("area inválida continua aceita sem erro (contrato antigo, valor ignorado) ou segue 422 no campo area",
    rInv.status === 200 || (rInv.status === 422 && rInv.corpo?.error?.field === "area"), `${rInv.status}`);
}

// ---------------------------------------------------------------------------
// Seção 5: a casa
// ---------------------------------------------------------------------------

async function secao5() {
  console.log("\nSeção 5: a casa do financeiro (today, receivables, statement)");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");
  const V = await import("@/lib/actions/emporio-vendas");
  const Cx = await import("@/lib/actions/emporio-caixa");

  // Cenário: um cliente com fiado vencido, um cheque bom para hoje, um cartão com parcela para hoje, uma conta a pagar vencida.
  const cli = await prisma.emporioCustomer.create({ data: { tenant_id: A.tenantId, name: `M98 Cliente fiado ${stamp}` } });
  const turno = await A.db.cashSession.findFirst({ where: { open_register_id: A.caixa1L1 } });
  const regra = await Cx.definirRegraCartaoAction(A.db, A.owner, { establishment_id: A.L1, kind: "credito_vista", fee_pct: 2, days: 1, bank_account_id: A.conta });
  if (!regra.ok) throw new Error(`regra de cartão: ${j(regra)}`);
  const item = (qty: number) => [{ emporio_product_id: A.prodId, presentation_id: A.presId, quantity: qty }];
  const vender = async (qty: number, payments: Dado[], over: Dado = {}) => {
    const r = await V.venderAction(A.db, A.owner, {
      operation_key: chave("venda"), establishment_id: A.L1, cash_register_id: turno?.open_register_id ?? A.caixa1L1,
      customer_id: cli.id, items: item(qty), payments, ...over,
    } as Dado);
    if (!r.ok) throw new Error(`venda: ${j(r)}`);
    return r.data as Dado;
  };
  await vender(3, [{ kind: "fiado", amount: 30, due_date: meioDia(somaDias(hojeStr, -1)) }], { sold_at: new Date(Date.now() - 3 * DIA) });
  await vender(5, [{ kind: "cheque", amount: 50, check: { number: "9001", bank: "Banco M98", good_for: meioDia(hojeStr) } }]);
  await vender(10, [{ kind: "credito_vista", amount: 100 }], { sold_at: new Date(Date.now() - 1 * DIA) });
  const cV = await comprar(A, A.tok.gestor, { supplier_id: A.fornecedor, items: [{ emporio_product_id: A.prodId, presentation_id: A.presId, quantity: 1, item_total: 77 }] });
  const eV = await entradaDaCompra(A, cV.corpo?.data?.id);
  const cartao = (await A.db.cardReceivable.findFirst({ where: { bank_account_id: A.conta, canceled_at: null } })) as Dado;
  check("(fixture) a parcela de cartão vence hoje", !!cartao && diaDe(cartao.expected_on) === hojeStr, j(cartao));
  const cartaoNet = n(cartao?.net_amount);

  console.log("  Hoje");
  const hj = await chamar(A.tok.fin, R.today, "GET", "emporio/finance/today");
  const h = hj.corpo?.data as Dado;
  check("o Financeiro lê today: 200", hj.status === 200, `${hj.status} ${j(hj.corpo)}`);
  const pos = (h?.positions ?? []) as Dado[];
  const porKind = (k: string) => pos.filter((p) => p.kind === k);
  check("as posições trazem as três espécies de lugar: gaveta, gerência e conta",
    porKind("gaveta").length >= 1 && porKind("gerencia").length >= 1 && porKind("conta").length >= 1, j(pos.map((p) => p.kind)));
  check("há uma gaveta por loja ativa (L1 e L2)", [A.L1, A.L2].every((L) => porKind("gaveta").some((p) => p.establishment_id === L)), j(porKind("gaveta")));
  check("a conta bancária entra com establishment_id nulo", porKind("conta").every((p) => p.establishment_id === null));
  const gaveta1 = n((await A.db.cashMovement.findMany({ where: { establishment_id: A.L1 } }) as Dado[]).reduce((s, m) => s + (m.direction === "entrada" ? n(m.amount) : -n(m.amount)), 0));
  check("a gaveta da L1 bate com a soma das movimentações", perto(porKind("gaveta").find((p) => p.id === A.L1 || p.establishment_id === A.L1)?.balance, gaveta1), `${gaveta1} vs ${j(porKind("gaveta"))}`);
  const gerencia1 = porKind("gerencia").find((p) => p.establishment_id === A.L1);
  check("a gerência da L1 tem os 50 do saldo inicial", perto(gerencia1?.balance, 50), j(gerencia1));
  const contaDb = await saldoContaDb(A, A.conta);
  check("a conta bate com movimentos mais cartões vencidos até hoje (inclui a parcela de hoje)", perto(porKind("conta").find((p) => p.id === A.conta)?.balance, contaDb), `${contaDb} vs ${j(porKind("conta"))}`);
  check("total_balance é a soma das posições", perto(h?.total_balance, pos.reduce((s, p) => s + n(p.balance), 0)), `${h?.total_balance}`);

  const pd = h?.payables_due;
  check("payables_due lista a conta vencida da compra", Array.isArray(pd?.items) && pd.items.some((x: Dado) => x.entry_id === eV?.id), j(pd?.items?.map((x: Dado) => x.entry_id)));
  check("payables_due: count e total batem com os itens", pd?.count === pd?.items?.length && perto(pd?.total, (pd?.items ?? []).reduce((s: number, x: Dado) => s + n(x.open_amount), 0)), j({ c: pd?.count, t: pd?.total }));
  check("payables_due só traz pendentes com vencimento até hoje",
    (pd?.items ?? []).every((x: Dado) => x.status === "pending" && String(x.due_date).slice(0, 10) <= hojeStr), j(pd?.items?.map((x: Dado) => [x.status, x.due_date])));
  const rd = h?.receivables_due;
  check("receivables_due.fiado: 1 cliente e 30 vencidos", rd?.fiado?.count === 1 && perto(rd?.fiado?.total, 30), j(rd?.fiado));
  check("receivables_due.checks: 1 cheque de 50 bom para hoje", rd?.checks?.count === 1 && perto(rd?.checks?.total, 50), j(rd?.checks));
  check("receivables_due.cards: 1 parcela, o líquido que vence hoje", rd?.cards?.count === 1 && perto(rd?.cards?.total, cartaoNet), j({ c: rd?.cards, esperado: cartaoNet }));
  check("overdue_fiado: 1 cliente e 30", h?.overdue_fiado?.customers === 1 && perto(h?.overdue_fiado?.total, 30), j(h?.overdue_fiado));

  const filtro = await chamar(A.tok.fin, R.today, "GET", `emporio/finance/today?establishment_id=${A.L2}`);
  const pf = (filtro.corpo?.data?.positions ?? []) as Dado[];
  check("filtro por loja: 200", filtro.status === 200, `${filtro.status} ${j(filtro.corpo)}`);
  check("filtro por loja L2: some a gaveta da L1, fica a da L2",
    !pf.some((p) => p.kind === "gaveta" && p.establishment_id === A.L1) && pf.some((p) => p.kind === "gaveta" && p.establishment_id === A.L2), j(pf));
  check("filtro por loja: a conta (de todas) continua", pf.some((p) => p.kind === "conta" && p.id === A.conta));
  check("filtro por loja: some a gerência da L1", !pf.some((p) => p.kind === "gerencia" && p.establishment_id === A.L1));

  console.log("  A receber");
  const rc = await chamar(A.tok.fin, R.receivables, "GET", "emporio/finance/receivables");
  const rcd = rc.corpo?.data as Dado;
  check("o Financeiro lê receivables: 200 com fiado, checks e cards", rc.status === 200 && Array.isArray(rcd?.fiado) && Array.isArray(rcd?.checks) && Array.isArray(rcd?.cards), `${rc.status} ${j(rc.corpo)}`);
  check("fiado por cliente: o cliente do cenário aparece", rcd?.fiado?.some((f: Dado) => f.customer_id === cli.id), j(rcd?.fiado));
  check("cheques em carteira: o de 50", rcd?.checks?.length === 1 && perto(n(rcd.checks[0].amount), 50), j(rcd?.checks));
  const cd = rcd?.cards?.[0];
  check("cartões a receber: a parcela com os campos do contrato",
    rcd?.cards?.length === 1 && cd?.installment === 1 && cd?.installments === 1 && cd?.bank_account_id === A.conta && cd?.establishment_id === A.L1
    && perto(n(cd?.gross_amount), 100) && perto(n(cd?.net_amount), cartaoNet) && typeof cd?.expected_on === "string" && typeof cd?.bank_account_name === "string" && typeof cd?.establishment_name === "string", j(cd));
  check("received é verdadeiro quando expected_on <= hoje", cd?.received === true, j(cd));
  const rcL2 = await chamar(A.tok.fin, R.receivables, "GET", `emporio/finance/receivables?establishment_id=${A.L2}`);
  check("receivables filtrado pela L2 não traz o cheque nem o cartão da L1", rcL2.status === 200 && rcL2.corpo?.data?.checks?.length === 0 && rcL2.corpo?.data?.cards?.length === 0, j(rcL2.corpo));

  console.log("  receber o fiado: por Pix sim, em dinheiro não");
  const receber = (tok: string, corpo: Dado) =>
    chamar(tok, R.receive, "POST", "emporio/receivables/receive", { operation_key: chave("rec"), customer_id: cli.id, establishment_id: A.L1, amount: 10, ...corpo });
  const saldoAntes = await saldoContaDb(A, A.conta);
  const movAntes = await A.db.cashMovement.count();
  const rDin = await receber(A.tok.fin, { kind: "dinheiro" });
  check("Financeiro recebendo em DINHEIRO: 422 no campo kind", erro(rDin, 422, "VALIDATION_ERROR", "kind"), `${rDin.status} ${j(rDin.corpo)}`);
  check("a frase manda o dinheiro para o caixa da loja", rDin.corpo?.error?.message === "O Financeiro recebe pela conta bancária; o dinheiro é no caixa da loja.", String(rDin.corpo?.error?.message));
  check("a recusa não gravou movimento", (await A.db.cashMovement.count()) === movAntes);
  const rPix = await receber(A.tok.fin, { kind: "pix", bank_account_id: A.conta });
  check("Financeiro recebendo por Pix na conta informada: 201", rPix.status === 201, `${rPix.status} ${j(rPix.corpo)}`);
  const mvPix = (await A.db.cashMovement.findMany({ where: { bank_account_id: A.conta, direction: "entrada", origin: "recebimento_fiado" } })) as Dado[];
  const mvPixAlt = mvPix.length ? mvPix : ((await A.db.cashMovement.findMany({ where: { bank_account_id: A.conta, direction: "entrada", amount: 10 } })) as Dado[]);
  check("nasce um CashMovement de entrada de 10 na conta", mvPixAlt.some((m) => perto(n(m.amount), 10)), j(mvPixAlt));
  check("o movimento não tem turno nem caixa (o Financeiro não está na loja)", mvPixAlt.every((m) => m.cash_session_id === null && m.cash_register_id === null), j(mvPixAlt));
  check("o saldo da conta subiu 10", perto(await saldoContaDb(A, A.conta), saldoAntes + 10));
  const pixLoja = await chamar(A.tok.fin, R.pix, "PUT", `emporio/establishments/${A.L1}/pix-account`, { bank_account_id: A.conta }, A.L1);
  check("Financeiro define a conta Pix da loja: 200", pixLoja.status === 200, `${pixLoja.status} ${j(pixLoja.corpo)}`);
  const rPixLoja = await receber(A.tok.fin, { kind: "pix" });
  check("Pix sem conta informada cai na conta Pix da loja: 201", rPixLoja.status === 201, `${rPixLoja.status} ${j(rPixLoja.corpo)}`);
  const gPix = await chamar(A.tok.gestor, R.pix, "PUT", `emporio/establishments/${A.L1}/pix-account`, { bank_account_id: A.conta }, A.L1);
  check("o Gestor continua definindo a conta Pix da loja dele: 200 (`dinheiro` soma)", gPix.status === 200, `${gPix.status} ${j(gPix.corpo)}`);
  const vPix = await chamar(A.tok.vend, R.pix, "PUT", `emporio/establishments/${A.L1}/pix-account`, { bank_account_id: A.conta }, A.L1);
  check("o Vendedor não define a conta Pix: 403", vPix.status === 403, `${vPix.status}`);
  const gDin = await receber(A.tok.owner, { kind: "dinheiro" });
  check("o Dono recebe em dinheiro no caixa da loja (turno aberto): 201", gDin.status === 201, `${gDin.status} ${j(gDin.corpo)}`);

  console.log("  Posição de caixa: o extrato da conta");
  const de = somaDias(hojeStr, -1);
  const ate = somaDias(hojeStr, 1);
  const ex = await chamar(A.tok.fin, R.statement, "GET", `emporio/finance/statement?bank_account_id=${A.conta}&de=${de}&ate=${ate}`);
  const x = ex.corpo?.data as Dado;
  check("o Financeiro lê o extrato: 200", ex.status === 200, `${ex.status} ${j(ex.corpo)}`);
  check("o extrato identifica a conta", x?.account?.id === A.conta && typeof x?.account?.name === "string", j(x?.account));
  const linhas = (x?.lines ?? []) as Dado[];
  check("o extrato lista o movimento de Pix recebido (kind movimento, entrada, 10)", linhas.some((l) => l.kind === "movimento" && l.direction === "entrada" && perto(n(l.amount), 10)), j(linhas));
  const lc = linhas.find((l) => l.kind === "cartao");
  check("o extrato lista a parcela de cartão como linha igual (kind cartao, entrada, líquido, origin cartao)",
    !!lc && lc.direction === "entrada" && perto(n(lc.amount), cartaoNet) && lc.origin === "cartao", j(lc));
  check("o extrato lista o saldo inicial e os pagamentos de compra da conta", linhas.some((l) => l.direction === "saida") && linhas.some((l) => perto(n(l.amount), 1000)), j(linhas.map((l) => [l.kind, l.direction, l.amount, l.origin])));
  check("as linhas vêm ordenadas por data", linhas.every((l, i) => i === 0 || String(linhas[i - 1].occurred_on) <= String(l.occurred_on)), j(linhas.map((l) => l.occurred_on)));
  const soma = linhas.reduce((s, l) => s + (l.direction === "entrada" ? n(l.amount) : -n(l.amount)), 0);
  check("closing_balance = opening_balance + entradas - saídas", perto(x?.closing_balance, n(x?.opening_balance) + soma), `${x?.opening_balance} + ${soma} vs ${x?.closing_balance}`);
  check("o período cobre toda a história da conta, então a abertura é zero", perto(x?.opening_balance, 0), String(x?.opening_balance));
  check("o saldo de fechamento bate com o saldo da conta em Hoje", perto(x?.closing_balance, await saldoContaDb(A, A.conta)), `${x?.closing_balance} vs ${await saldoContaDb(A, A.conta)}`);
  const exAmanha = await chamar(A.tok.fin, R.statement, "GET", `emporio/finance/statement?bank_account_id=${A.conta}&de=${somaDias(hojeStr, 1)}&ate=${somaDias(hojeStr, 2)}`);
  check("período sem linhas: a abertura vira o saldo de hoje e o fechamento é igual", exAmanha.status === 200 && (exAmanha.corpo?.data?.lines ?? []).length === 0
    && perto(exAmanha.corpo?.data?.opening_balance, await saldoContaDb(A, A.conta)) && perto(exAmanha.corpo?.data?.closing_balance, exAmanha.corpo?.data?.opening_balance), j(exAmanha.corpo));
  const exSem = await chamar(A.tok.fin, R.statement, "GET", `emporio/finance/statement?de=${de}&ate=${ate}`);
  check("extrato sem bank_account_id: 422", exSem.status === 422, `${exSem.status} ${j(exSem.corpo)}`);
  const exLongo = await chamar(A.tok.fin, R.statement, "GET", `emporio/finance/statement?bank_account_id=${A.conta}&de=${somaDias(hojeStr, -100)}&ate=${hojeStr}`);
  check("período de mais de 92 dias: 422 no campo ate", erro(exLongo, 422, undefined, "ate"), `${exLongo.status} ${j(exLongo.corpo)}`);
  const exGestor = await chamar(A.tok.gestor, R.statement, "GET", `emporio/finance/statement?bank_account_id=${A.conta}&de=${de}&ate=${ate}`);
  check("o Gestor também lê o extrato (`gestor_da_loja` ou `dinheiro`): 200", exGestor.status === 200, `${exGestor.status}`);
  const exVend = await chamar(A.tok.vend, R.statement, "GET", `emporio/finance/statement?bank_account_id=${A.conta}&de=${de}&ate=${ate}`);
  check("o Vendedor não lê o extrato: 403", exVend.status === 403, `${exVend.status}`);

  console.log("  quem NÃO entra na casa");
  for (const [quem, tok] of [["Vendedor", A.tok.vend], ["Caixa", A.tok.caixa], ["Gestor", A.tok.gestor]] as const) {
    const t1 = await chamar(tok, R.today, "GET", "emporio/finance/today");
    check(`${quem} em today: 403`, t1.status === 403, `${t1.status}`);
    const t2 = await chamar(tok, R.receivables, "GET", "emporio/finance/receivables");
    check(`${quem} em receivables: 403`, t2.status === 403, `${t2.status}`);
  }
  const tOwner = await chamar(A.tok.owner, R.today, "GET", "emporio/finance/today");
  check("o Dono lê today: 200", tOwner.status === 200, `${tOwner.status}`);

  console.log("  o Financeiro lê o que a spec manda e não escreve o que ela proíbe");
  const ficha = await chamar(A.tok.fin, R.customer, "GET", `emporio/customers/${cli.id}`, undefined, cli.id);
  check("Financeiro lê a ficha do cliente: 200", ficha.status === 200, `${ficha.status} ${j(ficha.corpo)}`);
  const novoCli = await chamar(A.tok.fin, R.customers, "POST", "emporio/customers", { name: "M98 Cliente do Financeiro", person_kind: "pf" });
  check("Financeiro NÃO cria cliente: 403", novoCli.status === 403, `${novoCli.status} ${j(novoCli.corpo)}`);
  const novaConta = await chamar(A.tok.fin, R.bankAccounts, "POST", "emporio/bank-accounts", { name: `M98 Conta do Financeiro ${stamp}`, bank: "Banco Z" });
  check("Financeiro cria conta bancária: 201", novaConta.status === 201, `${novaConta.status} ${j(novaConta.corpo)}`);
  const fichaVend = await chamar(A.tok.vend, R.customer, "GET", `emporio/customers/${cli.id}`, undefined, cli.id);
  check("a ficha segue aberta ao Vendedor da loja: 200 (`dinheiro` soma)", fichaVend.status === 200, `${fichaVend.status}`);
}

// ---------------------------------------------------------------------------
// Seção 6: isolamento
// ---------------------------------------------------------------------------

async function secao6() {
  console.log("\nSeção 6: o Financeiro de um tenant não vê nada do outro");
  const { A, B } = M!;
  // O tenant B tem a sua própria conta, o seu saldo e uma conta a pagar vencida.
  const cb = await comprar(B, B.tok.owner, { supplier_id: B.fornecedor });
  check("(fixture) o tenant B lançou uma compra a prazo", cb.status === 201, `${cb.status} ${j(cb.corpo)}`);
  const eB = await entradaDaCompra(B, cb.corpo?.data?.id);

  const idsA = [A.conta, A.L1, A.L2, A.fornecedor, A.fin.id];
  const eA = ((await A.db.financialEntry.findMany({ where: { related_module: "emporio" }, select: { id: true } })) as Dado[]).map((x) => x.id);
  const naoTem = (corpo: unknown, ids: string[]) => ids.every((id) => !j(corpo).includes(id));

  const tB = await chamar(B.tok.fin, R.today, "GET", "emporio/finance/today");
  check("B em today: 200", tB.status === 200, `${tB.status}`);
  check("today de B não carrega nenhum id do tenant A (conta, lojas, contas a pagar)", tB.status === 200 && naoTem(tB.corpo, [...idsA, ...eA]), j(tB.corpo).slice(0, 300));
  check("today de B só soma o que é de B (a conta de 500)", perto(tB.corpo?.data?.total_balance, 500 + 0), String(tB.corpo?.data?.total_balance));
  check("today de B traz a conta a pagar de B", tB.corpo?.data?.payables_due?.items?.some((x: Dado) => x.entry_id === eB?.id), j(tB.corpo?.data?.payables_due));
  check("today de B: nada a receber, nenhum fiado vencido (o cheque e o cartão são de A)",
    tB.corpo?.data?.receivables_due?.fiado?.count === 0 && tB.corpo?.data?.receivables_due?.checks?.count === 0 && tB.corpo?.data?.receivables_due?.cards?.count === 0 && tB.corpo?.data?.overdue_fiado?.customers === 0,
    j(tB.corpo?.data?.receivables_due));
  const tA = await chamar(A.tok.fin, R.today, "GET", "emporio/finance/today");
  check("today de A não carrega nenhum id do tenant B", tA.status === 200 && naoTem(tA.corpo, [B.conta, B.L1, B.L2, B.fornecedor, ...(eB ? [eB.id] : [])]));

  const rB = await chamar(B.tok.fin, R.receivables, "GET", "emporio/finance/receivables");
  check("receivables de B: 200 e vazio nas três listas (o fiado, o cheque e o cartão são de A)",
    rB.status === 200 && rB.corpo?.data?.fiado?.length === 0 && rB.corpo?.data?.checks?.length === 0 && rB.corpo?.data?.cards?.length === 0, j(rB.corpo));

  const sB = await chamar(B.tok.fin, R.statement, "GET", `emporio/finance/statement?bank_account_id=${A.conta}&de=${somaDias(hojeStr, -1)}&ate=${somaDias(hojeStr, 1)}`);
  check("statement da conta do tenant A pelo Financeiro de B: 404 e nenhum dado", sB.status === 404 && (sB.corpo?.data ?? null) === null, `${sB.status} ${j(sB.corpo)}`);
  const sBpro = await chamar(B.tok.fin, R.statement, "GET", `emporio/finance/statement?bank_account_id=${B.conta}&de=${somaDias(hojeStr, -1)}&ate=${somaDias(hojeStr, 1)}`);
  check("statement da conta de B pelo Financeiro de B: 200 e sem rastro de A", sBpro.status === 200 && naoTem(sBpro.corpo, idsA), `${sBpro.status}`);

  const fL = await chamar(B.tok.fin, R.today, "GET", `emporio/finance/today?establishment_id=${A.L1}`);
  check("today com a loja de A pelo Financeiro de B: não devolve 200 com dado de A", fL.status !== 0 && (fL.status !== 200 || naoTem(fL.corpo, idsA)), `${fL.status}`);

  const pB = await listaPagar(B.tok.fin);
  check("payables de B: 200 e só as contas de B", pB.r.status === 200 && pB.itens.length >= 1 && pB.itens.every((x) => x.entry_id !== undefined && !eA.includes(x.entry_id)) && pB.itens.some((x) => x.entry_id === eB?.id), `${pB.r.status} ${pB.itens.length}`);
  const pA = await listaPagar(A.tok.fin);
  check("payables de A não traz a conta de B", !pA.itens.some((x) => x.entry_id === eB?.id));

  const pagaDeB = await chamar(B.tok.fin, R.payablesPay, "POST", "emporio/payables/pay", { entry_ids: [eA[0]], from: { bank_account_id: B.conta } });
  check("o Financeiro de B pagando uma conta do tenant A: recusa (não 201)", pagaDeB.status >= 400, `${pagaDeB.status} ${j(pagaDeB.corpo)}`);
  const pagaConta = await chamar(B.tok.fin, R.payablesPay, "POST", "emporio/payables/pay", { entry_ids: [eB.id], from: { bank_account_id: A.conta } });
  check("o Financeiro de B pagando de uma conta bancária do tenant A: recusa (não 201)", pagaConta.status >= 400, `${pagaConta.status} ${j(pagaConta.corpo)}`);
  const adia = await chamar(B.tok.fin, R.payableDue, "PATCH", `emporio/payables/${eA[0]}/due-date`, { due_date: `${somaDias(hojeStr, 5)}T12:00:00Z` }, eA[0]);
  check("adiar conta de A pelo Financeiro de B: 404", adia.status === 404, `${adia.status}`);
  const cancela = await chamar(B.tok.fin, R.payableCancel, "POST", `emporio/payables/${eA[0]}/cancel`, { reason: "x" }, eA[0]);
  check("cancelar conta de A pelo Financeiro de B: 404", cancela.status === 404, `${cancela.status}`);
}

// ---------------------------------------------------------------------------

async function limpar() {
  if (tenantIds.length === 0) return;
  const { prisma } = await import("@/lib/prisma");
  for (const id of tenantIds) {
    await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
  }
  const modelos = [
    "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "cardReceivable", "cardFeeRule", "emporioSalePayment", "emporioSaleReturnItem",
    "stockMovement", "emporioSaleItem", "emporioSaleReturn", "emporioCheck", "emporioQuoteItem", "emporioQuote", "emporioSale", "emporioPurchaseItem",
    "emporioPurchase", "emporioCustomer", "emporioSupplier", "cashHandover", "cashSession", "cashRegister", "fixedExpenseOccurrence", "fixedExpenseSplit",
    "fixedExpenseTemplate", "emporioCounter", "emporioSettings", "financialPayment", "financialEntry", "userEstablishment", "establishment", "bankAccount",
    "contact", "user", "tenantProfile", "tenantFeature",
  ];
  for (const id of tenantIds) {
    for (const m of modelos) {
      try {
        await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: id } });
      } catch {
        // modelo ausente nesta versão do schema: segue
      }
    }
    await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
  }
  const sobrou = await prisma.tenant.count({ where: { id: { in: tenantIds } } });
  check("a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
}

async function main() {
  try {
    await rodar("1 pura", secao1Pura);
    await comBanco(async () => {
      await rodar("montagem", async () => {
        M = { A: await montar("A"), B: await montar("B") };
      });
      if (!M) {
        check("a montagem dos dois tenants terminou (sem ela as seções 1b a 6 não rodam)", false);
        return;
      }
      await rodar("1 banco", secao1Banco);
      await rodar("2", secao2);
      await rodar("3", secao3);
      await rodar("4", secao4);
      await rodar("5", secao5);
      await rodar("6", secao6);
    });
  } finally {
    await limpar();
  }
  console.log(falhas === 0 ? "\n✅ M98 verde" : `\n❌ M98: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
