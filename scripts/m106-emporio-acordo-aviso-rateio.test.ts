import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M106: Módulo 39 (Meu Empório): desfazer acordo (Q275), aviso de pedido de pagamento
 * também por email (Q276) e recalcular o mês do rateio (Q277).
 * Roda: `npm run test:m106`
 *
 * Escrita da spec (docs/superpowers/specs/2026-11-09-emporio-acordo-aviso-rateio-design.md) e dos
 * blocos Interfaces e Step 1 das Tasks 1 a 3, sem ler a implementação. As actions novas
 * (`desfazerAcordoAction`, `recalcularMesDaDespesaFixaAction`) entram por `import()` com o
 * especificador em variável e acesso tolerante: ausência vira `ACTION_AUSENTE`, nunca erro de sintaxe.
 *
 * Seções: 1 desfazer acordo, 2 aviso de pedido por email, 3 recalcular o mês, 4 isolamento.
 *
 * O que os briefs calavam e esta suíte ASSUME:
 * - `sendEmail` (src/lib/email-send.ts) grava SEMPRE uma linha em EmailLog, sucesso ou falha. Sem credencial
 *   de Gmail em dev o envio falha e o log sai com status `failed`: a suíte lê o EmailLog e aceita sent ou failed.
 *   Se a máquina tiver credencial real, os emails (para `@teste.local`) são tentados de verdade e quicam.
 * - o tipo `emporio_pedido_pagamento` ainda pode não existir no enum do Prisma: o filtro é por `related_id`
 *   no banco e por `type` em memória, para a consulta não estourar no HEAD;
 * - "uma falha de um envio não impede os outros" não é provável sem interceptar o canal: a suíte prova que o
 *   pedido nasce 201 com todos os emails falhando e que ainda assim os DOIS registros existem;
 * - o aviso por email pode sair depois da resposta: a suíte espera até 6 s pelos registros;
 * - a nota de "recalculado" na entrada cancelada é lida por regex /recalcul/i sobre o JSON da entrada
 *   (o texto exato da NOTA_RECALCULADO não consta do contrato);
 * - `parts[].amount` está em reais; os valores finais são conferidos também pelas entradas no banco;
 * - ocorrências antigas podem ou não continuar como linha em FixedExpenseOccurrence: as canceladas são
 *   conferidas pelas entradas capturadas antes de recalcular;
 * - "pagar uma ocorrência" é feito por Prisma (entrada `paid`), que é o que `MES_FECHADO` olha;
 * - `can_undo` e `undone_at` voltam na view de GET agreements (`montarAcordos`), como o brief diz.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dado = any;
type Ator = { id: string; role: "OWNER" | "ADMIN" | "OPERADOR"; email: string };
type RA = { ok: true; data: Dado } | { ok: false; code: string; message: string; status: number; field?: string };
type Acao = (...args: unknown[]) => Promise<RA>;

const j = (x: unknown) => JSON.stringify(x);
const n = (x: unknown) => Number(x);
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;
const recusa = (r: RA | undefined, code: string, field?: string, status?: number) =>
  !!r && !r.ok && r.code === code && (field === undefined || r.field === field || (r.field ?? "").startsWith(`${field}.`)) && (status === undefined || r.status === status);

const tenantIds: string[] = [];
const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);
const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, k: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + k * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const emDias = (k: number) => somaDias(hojeStr, k);
const diaDe = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const mesCorrente = hojeStr.slice(0, 7);
const somaMes = (ym: string, k: number) => {
  const [a, m] = ym.split("-").map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};
const civil = (ym: string) => ({ ano: Number(ym.slice(0, 4)), mes: Number(ym.slice(5, 7)) });
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

console.log("🧾 M106: Módulo 39 (Meu Empório): desfazer acordo, aviso por email e recalcular o mês do rateio\n");

/** Pega uma função exportada por um módulo que pode ainda não existir (especificador em variável). */
async function acao(especificador: string, nome: string): Promise<Acao> {
  try {
    const mod = (await import(especificador)) as Record<string, unknown>;
    if (typeof mod[nome] === "function") return mod[nome] as Acao;
  } catch {
    // módulo ausente: cai na recusa abaixo
  }
  return async () => ({ ok: false, code: "ACTION_AUSENTE", message: `${nome} não existe`, status: 0 });
}
const ESP_ACORDOS = "@/lib/actions/emporio-acordos";
const ESP_DESPESAS = "@/lib/actions/emporio-despesas";

type Mundo = {
  rotulo: string;
  tenantId: string;
  db: Dado;
  owner: Ator; // sem telefone
  fin: Ator; // financeiro, solicita o pedido
  gg: Ator; // gerente geral com telefone
  ggInativo: Ator; // gerente geral desativado, com telefone
  gestor: Ator;
  tok: Record<"owner" | "fin", string>;
  L1: string;
  L2: string;
  reg: string;
  conta: string;
  prodId: string;
  presId: string;
};
let M: { A: Mundo; B: Mundo } | null = null;

async function comBanco(fn: () => Promise<void>) {
  (globalThis as unknown as { AsyncLocalStorage: unknown }).AsyncLocalStorage = (await import("node:async_hooks")).AsyncLocalStorage;
  await fn();
}

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
    data: { name: `M106 ${rotulo} ${stamp}`, document: `M106${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  const PADRAO = { fiado_due_days: 30, fiado_block_after_days: 365, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null };
  await (prisma as Dado).emporioSettings.upsert({ where: { tenant_id: t.id }, create: { tenant_id: t.id, ...PADRAO }, update: PADRAO });

  const mk = async (suf: string, role: "OWNER" | "ADMIN" | "OPERADOR", extra: Dado = {}): Promise<Ator> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M106 ${suf}`, email: `m106-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const fone = (k: number) => `5511${rotulo === "A" ? "9" : "8"}${stamp.replace(/\D/g, "").padEnd(6, "1").slice(0, 6)}${k}`.slice(0, 13);
  const owner = await mk("own", "OWNER");
  const fin = await mk("fin", "OPERADOR", papelFinanceiro());
  const gg = await mk("gg", "ADMIN", { phone: fone(1) });
  const ggInativo = await mk("ggoff", "ADMIN", { phone: fone(2), active: false });
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [], phone: fone(3) });

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M106 ${rotulo} Loja 1` });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M106 ${rotulo} Loja 2` });
  if (!l1.ok || !l2.ok) throw new Error(`lojas: ${j([l1, l2])}`);
  const L1 = l1.data.id as string;
  const L2 = l2.data.id as string;
  await vincularTodas(prisma, t.id, [gestor.id], [L1]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M106 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M106 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L1, presentation_id: pres.data.id, price: 10 });
  if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
  const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L1, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
  if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
  const c1 = await Cx.criarContaAction(db, owner, { name: `M106 Conta ${rotulo} ${stamp}`, bank: "Banco M106" });
  if (!c1.ok) throw new Error(`conta: ${j(c1)}`);
  const conta = c1.data.id as string;
  for (const input of [{ bank_account_id: conta, amount: 5000 }, { establishment_id: L1, amount: 200 }]) {
    const s = await Cx.saldoInicialCaixaAction(db, owner, input);
    if (!s.ok) throw new Error(`saldo inicial ${j(input)}: ${j(s)}`);
  }
  await abrirTurnoDeTeste(db, owner, L1);
  const reg = (await db.cashRegister.findFirst({ where: { establishment_id: L1, number: 1 } }))?.id as string;

  const tok = {} as Mundo["tok"];
  for (const [k, u] of [["owner", owner], ["fin", fin]] as [keyof Mundo["tok"], Ator][]) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { rotulo, tenantId: t.id, db, owner, fin, gg, ggInativo, gestor, tok, L1, L2, reg, conta, prodId: prod.data.id, presId: pres.data.id };
}

const R = {
  agreements: () => import("@/app/api/v1/emporio/customers/[id]/agreements/route"),
  credit: () => import("@/app/api/v1/emporio/customers/[id]/credit/route"),
  saleCancel: () => import("@/app/api/v1/emporio/sales/[id]/cancel/route"),
  receive: () => import("@/app/api/v1/emporio/receivables/receive/route"),
  payablesPay: () => import("@/app/api/v1/emporio/payables/pay/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST", url: string, corpo?: unknown, id?: string): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
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
  const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
  return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
}
const ok2xx = (r: Resp) => r.status >= 200 && r.status < 300;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 3).join(" | ") : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m106-${p}-${stamp}-${(seq += 1)}`;

async function cliente(w: Mundo, nome: string) {
  const { prisma } = await import("@/lib/prisma");
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: `M106 ${nome}` } as Dado })) as Dado;
}

/** Fiado de `valor` reais (preço 10 o quilo), vencendo daqui a `venc` dias. */
async function fiado(w: Mundo, cli: Dado, valor: number, venc: number): Promise<{ vendaId: string; entry: Dado }> {
  const V = await import("@/lib/actions/emporio-vendas");
  const r = await V.venderAction(w.db, w.owner, {
    operation_key: chave("venda"), establishment_id: w.L1, cash_register_id: w.reg, customer_id: cli.id,
    items: [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: valor / 10 }],
    payments: [{ kind: "fiado", amount: valor, due_date: meioDia(emDias(venc)) }],
  } as Dado);
  if (!r.ok) throw new Error(`venda de preparação: ${j(r)}`);
  const vendaId = (r.data as Dado).id as string;
  const entry = ((await w.db.financialEntry.findFirst({ where: { related_module: "emporio", related_id: vendaId, entry_type: "income" } }))
    ?? (await w.db.financialEntry.findFirst({ where: { emporio_customer_id: cli.id, entry_type: "income" }, orderBy: { created_at: "desc" } }))) as Dado;
  return { vendaId, entry };
}

function partes(totalCent: number, q: number, primeira: number, passo = 30) {
  const base = Math.floor(totalCent / q);
  const resto = totalCent - base * q;
  return Array.from({ length: q }, (_, i) => ({ due_date: emDias(primeira + i * passo), amount: (base + (i === 0 ? resto : 0)) / 100 }));
}
const acordar = (w: Mundo, cli: Dado, ids: string[], parcelas: Dado[]) =>
  chamar(w.tok.owner, R.agreements, "POST", `emporio/customers/${cli.id}/agreements`, { entry_ids: ids, installments: parcelas }, cli.id);
const listar = async (w: Mundo, cli: Dado) => ((await chamar(w.tok.owner, R.agreements, "GET", `emporio/customers/${cli.id}/agreements`, undefined, cli.id)).corpo?.data ?? []) as Dado[];
const devido = async (w: Mundo, cli: Dado) => ((await chamar(w.tok.owner, R.credit, "GET", `emporio/customers/${cli.id}/credit`, undefined, cli.id)).corpo?.data as Dado)?.owed_total;
const receber = (w: Mundo, cli: Dado, valor: number) =>
  chamar(w.tok.fin, R.receive, "POST", "emporio/receivables/receive", {
    operation_key: chave("rec"), customer_id: cli.id, establishment_id: w.L1, amount: valor, kind: "pix", bank_account_id: w.conta,
  });

const X = { acordoA: "", clienteA: "", tplA: "", entradasAcordoA: [] as string[], pedidoA: "", tplAtivas: [] as string[] };

// ---------------------------------------------------------------------------
// Seção 1: desfazer acordo (Q275)
// ---------------------------------------------------------------------------
async function secao1() {
  console.log("1. Desfazer acordo (Q275)");
  const { A, B } = M!;
  const { prisma } = await import("@/lib/prisma");
  const desfazer = await acao(ESP_ACORDOS, "desfazerAcordoAction");
  const parcelas = async (acordoId: string) => (await A.db.financialEntry.findMany({ where: { agreement_id: acordoId, category: "Acordo de fiado" }, orderBy: { due_date: "asc" } })) as Dado[];
  const acordoDb = async (id: string) => (await (prisma as Dado).emporioCreditAgreement.findUnique({ where: { id } })) as Dado;

  console.log("  (a) o caminho feliz: duas vendas (100 e 50) em 3 parcelas");
  const c1 = await cliente(A, "Desfaz base");
  const f1 = await fiado(A, c1, 100, 10);
  const f2 = await fiado(A, c1, 50, 20);
  const vencAntes = [diaDe(f1.entry.due_date), diaDe(f2.entry.due_date)];
  const r1 = await acordar(A, c1, [f1.entry.id, f2.entry.id], partes(15000, 3, 15));
  check("(fixture) o acordo de 150 em 3 parcelas: 201", r1.status === 201, `${r1.status} ${j(r1.corpo)}`);
  const ac = String(r1.corpo?.data?.id ?? "");
  const lisAntes = (await listar(A, c1)).find((x) => x.id === ac);
  check("a view do acordo ativo diz can_undo verdadeiro e undone_at nulo", lisAntes?.can_undo === true && (lisAntes?.undone_at ?? null) === null, j(lisAntes));
  const ps0 = await parcelas(ac);
  const ps0Ids = ps0.map((p) => p.id as string);
  check("(fixture) três parcelas pending", ps0.length === 3 && ps0.every((p) => p.status === "pending"), j(ps0.map((p) => p.status)));

  const d1 = await desfazer(A.db, A.owner, ac, { reason: "Cliente voltou atrás" });
  check("desfazer: ok", d1.ok === true, j(d1));
  const ps1 = (await A.db.financialEntry.findMany({ where: { id: { in: ps0Ids } } })) as Dado[];
  check("as 3 parcelas ficam cancelled", ps1.length === 3 && ps1.every((p) => p.status === "cancelled"), j(ps1.map((p) => p.status)));
  const os = (await A.db.financialEntry.findMany({ where: { id: { in: [f1.entry.id, f2.entry.id] } } })) as Dado[];
  check("as duas origens voltam a pending, com agreement_id nulo", os.length === 2 && os.every((o) => o.status === "pending" && o.agreement_id === null), j(os.map((o) => [o.status, o.agreement_id])));
  const f1d = os.find((o) => o.id === f1.entry.id);
  const f2d = os.find((o) => o.id === f2.entry.id);
  check("as origens têm o MESMO vencimento de antes", diaDe(f1d?.due_date) === vencAntes[0] && diaDe(f2d?.due_date) === vencAntes[1], j([diaDe(f1d?.due_date), diaDe(f2d?.due_date)]));
  check("o cliente deve 150 de novo", perto(n(await devido(A, c1)), 150), String(await devido(A, c1)));
  const dbAc = await acordoDb(ac);
  check("o acordo ganha undone_at, undone_by_user_id e undone_reason", !!dbAc?.undone_at && dbAc?.undone_by_user_id === A.owner.id && dbAc?.undone_reason === "Cliente voltou atrás", j(dbAc));
  const hist = (await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "fiado.acordo.desfazer" } })) as Dado[];
  check("o Histórico grava fiado.acordo.desfazer", hist.length === 1, j(hist.map((h) => [h.action, h.target_type])));
  const lisDepois = (await listar(A, c1)).find((x) => x.id === ac);
  check("a view do acordo desfeito traz undone_at e o motivo, e can_undo falso", !!lisDepois?.undone_at && lisDepois?.undone_reason === "Cliente voltou atrás" && lisDepois?.can_undo === false, j(lisDepois));

  console.log("  (b) desfazer de novo");
  const d2 = await desfazer(A.db, A.owner, ac, { reason: "de novo" });
  check("desfazer um acordo já desfeito: 409 ACORDO_DESFEITO", recusa(d2, "ACORDO_DESFEITO", undefined, 409), j(d2));
  check("a segunda tentativa não mexeu no motivo", (await acordoDb(ac))?.undone_reason === "Cliente voltou atrás");

  console.log("  (c) acordo com parcela paga em parte");
  const c2 = await cliente(A, "Desfaz com pagamento");
  const g1 = await fiado(A, c2, 80, 10);
  const r2 = await acordar(A, c2, [g1.entry.id], partes(8000, 2, 15));
  check("(fixture) acordo de 80 em 2 parcelas: 201", r2.status === 201, `${r2.status} ${j(r2.corpo)}`);
  const ac2 = String(r2.corpo?.data?.id ?? "");
  const rec = await receber(A, c2, 10);
  check("(fixture) receber 10 cai na parcela 1: 201", rec.status === 201, `${rec.status} ${j(rec.corpo)}`);
  const lis2 = (await listar(A, c2)).find((x) => x.id === ac2);
  check("a view diz can_undo falso quando há movimento", lis2?.can_undo === false, j(lis2));
  const d3 = await desfazer(A.db, A.owner, ac2, { reason: "tentativa" });
  check("desfazer: 409 ACORDO_COM_MOVIMENTO, com mensagem", recusa(d3, "ACORDO_COM_MOVIMENTO", undefined, 409) && !d3.ok && !!d3.message, j(d3));
  const ps2 = await parcelas(ac2);
  const og2 = (await A.db.financialEntry.findFirst({ where: { id: g1.entry.id } })) as Dado;
  check("nada muda: parcelas continuam (nenhuma cancelada), origem segue em acordo, sem undone_at",
    ps2.length === 2 && ps2.every((p) => p.status !== "cancelled") && og2?.status === "cancelled" && og2?.agreement_id === ac2 && !(await acordoDb(ac2))?.undone_at, j([ps2.map((p) => p.status), og2?.status, og2?.agreement_id]));

  console.log("  (d) origem com pagamento parcial antes do acordo");
  const c3 = await cliente(A, "Desfaz parcial");
  const h1 = await fiado(A, c3, 100, 10);
  const rec3 = await receber(A, c3, 30);
  check("(fixture) receber 30 do fiado de 100: 201", rec3.status === 201, `${rec3.status} ${j(rec3.corpo)}`);
  const r3 = await acordar(A, c3, [h1.entry.id], partes(7000, 2, 15));
  check("(fixture) acordo de 70 (o aberto): 201", r3.status === 201, `${r3.status} ${j(r3.corpo)}`);
  const ac3 = String(r3.corpo?.data?.id ?? "");

  console.log("  (e) motivo vazio");
  const dv = await desfazer(A.db, A.owner, ac3, { reason: "" });
  check("motivo vazio: VALIDATION_ERROR no campo reason", recusa(dv, "VALIDATION_ERROR", "reason"), j(dv));
  const dv2 = await desfazer(A.db, A.owner, ac3, { reason: "   " });
  check("motivo só com espaços: VALIDATION_ERROR no campo reason", recusa(dv2, "VALIDATION_ERROR", "reason"), j(dv2));
  check("a recusa por motivo não desfez nada", !(await acordoDb(ac3))?.undone_at);
  const d4 = await desfazer(A.db, A.owner, ac3, { reason: "Erro de digitação" });
  check("com motivo, desfazer: ok", d4.ok === true, j(d4));
  const h1d = (await A.db.financialEntry.findFirst({ where: { id: h1.entry.id } })) as Dado;
  check("a origem parcialmente paga volta pending, sem acordo, com valor 100", h1d?.status === "pending" && h1d?.agreement_id === null && perto(n(h1d?.amount), 100), j([h1d?.status, h1d?.agreement_id, h1d?.amount]));
  check("o cliente continua devendo 70 (o mesmo aberto de antes do acordo)", perto(n(await devido(A, c3)), 70), String(await devido(A, c3)));

  console.log("  (f) outro tenant e cancelar a venda depois");
  const c4 = await cliente(A, "Desfaz isolamento");
  const k1 = await fiado(A, c4, 60, 10);
  const r4 = await acordar(A, c4, [k1.entry.id], partes(6000, 2, 15));
  const ac4 = String(r4.corpo?.data?.id ?? "");
  X.acordoA = ac4;
  X.clienteA = c4.id;
  X.entradasAcordoA = (await parcelas(ac4)).map((p) => p.id as string);
  const dB = await desfazer(B.db, B.owner, ac4, { reason: "do outro tenant" });
  check("o dono do tenant B desfazer o acordo de A: NOT_FOUND", recusa(dB, "NOT_FOUND"), j(dB));
  check("A segue intacto (sem undone_at, parcelas pending)", !(await acordoDb(ac4))?.undone_at && (await parcelas(ac4)).every((p) => p.status === "pending"));
  const cancelAntes = await chamar(A.tok.owner, R.saleCancel, "POST", `emporio/sales/${k1.vendaId}/cancel`, { reason: "M106" }, k1.vendaId);
  check("(controle) com o acordo ativo, cancelar a venda: 409 VENDA_EM_ACORDO", cancelAntes.status === 409 && cancelAntes.corpo?.error?.code === "VENDA_EM_ACORDO", `${cancelAntes.status} ${j(cancelAntes.corpo)}`);
  const d5 = await desfazer(A.db, A.owner, ac4, { reason: "Vai cancelar a venda" });
  check("(fixture) desfazer o acordo de A: ok", d5.ok === true, j(d5));
  const cancelDepois = await chamar(A.tok.owner, R.saleCancel, "POST", `emporio/sales/${k1.vendaId}/cancel`, { reason: "M106" }, k1.vendaId);
  check("depois de desfeito, cancelar a venda original NÃO recusa por VENDA_EM_ACORDO", cancelDepois.corpo?.error?.code !== "VENDA_EM_ACORDO", `${cancelDepois.status} ${j(cancelDepois.corpo)}`);
  check("e o cancelamento passa: 2xx", ok2xx(cancelDepois), `${cancelDepois.status} ${j(cancelDepois.corpo)}`);
}

// ---------------------------------------------------------------------------
// Seção 2: aviso de pedido por email (Q276)
// ---------------------------------------------------------------------------
async function secao2() {
  console.log("\n2. Aviso de pedido de pagamento também por email (Q276)");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");
  const Dd = await import("@/lib/actions/emporio-despesas");
  await (prisma as Dado).emporioSettings.update({ where: { tenant_id: A.tenantId }, data: { payment_approval_limit: 100 } });
  const categoria = `M106 Despesa ${stamp}`;
  const cr = await Dd.criarDespesaFixaAction(A.db, A.owner, {
    name: categoria, category: categoria, amount: 150, due_day: 28, split_kind: "percentual",
    starts_on: meioDia(`${mesCorrente}-01`), splits: [{ establishment_id: A.L1, value: 100 }],
  } as Dado);
  if (!cr.ok) throw new Error(`despesa fixa: ${j(cr)}`);
  const e = (await A.db.financialEntry.findFirst({ where: { category: categoria, status: "pending" }, orderBy: { due_date: "asc" } })) as Dado;
  const pg = await chamar(A.tok.fin, R.payablesPay, "POST", "emporio/payables/pay", { entry_ids: [e.id], from: { bank_account_id: A.conta } });
  const pedido = pg.corpo?.data?.request as Dado;
  check("o Financeiro paga 150 acima do teto de 100: o pedido nasce, mesmo com o email sem credencial", ok2xx(pg) && pg.corpo?.data?.waiting_approval === true && !!pedido?.id, `${pg.status} ${j(pg.corpo)}`);
  X.pedidoA = String(pedido?.id ?? "");

  const lerLogs = async () =>
    ((await (prisma as Dado).emailLog.findMany({ where: { tenant_id: A.tenantId, related_id: X.pedidoA } })) as Dado[]).filter((l) => l.type === "emporio_pedido_pagamento");
  let logs = await lerLogs();
  for (let i = 0; i < 12 && logs.length < 2; i += 1) {
    await dormir(500);
    logs = await lerLogs();
  }
  check("o EmailLog tem DOIS registros emporio_pedido_pagamento com related_id do pedido", logs.length === 2, `${logs.length} ${j(logs.map((l) => [l.to_email, l.status]))}`);
  const paraQuem = new Set(logs.map((l) => String(l.to_email)));
  check("os destinatários são o Dono (sem telefone) e o Gerente geral (com telefone)", paraQuem.has(A.owner.email) && paraQuem.has(A.gg.email), j([...paraQuem]));
  check("quem pediu (Financeiro), o Gestor e o Gerente geral desativado NÃO recebem", !paraQuem.has(A.fin.email) && !paraQuem.has(A.gestor.email) && !paraQuem.has(A.ggInativo.email), j([...paraQuem]));
  check("cada tentativa ficou registrada como sent ou failed (o canal nunca lança)", logs.every((l) => l.status === "sent" || l.status === "failed"), j(logs.map((l) => l.status)));
  const pDb = (await (prisma as Dado).emporioPaymentRequest.findUnique({ where: { id: X.pedidoA } })) as Dado;
  check("o pedido segue pendente no banco (a falha do email não o derrubou)", pDb?.status === "pendente", j(pDb));
  check("a conta a pagar segue pending (nada foi pago)", ((await A.db.financialEntry.findFirst({ where: { id: e.id } })) as Dado)?.status === "pending");
}

// ---------------------------------------------------------------------------
// Seção 3: recalcular o mês (Q277)
// ---------------------------------------------------------------------------
async function secao3() {
  console.log("\n3. Recalcular o mês do rateio (Q277)");
  const { A, B } = M!;
  const { prisma } = await import("@/lib/prisma");
  const Dd = await import("@/lib/actions/emporio-despesas");
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const recalcular = await acao(ESP_DESPESAS, "recalcularMesDaDespesaFixaAction");
  const criar = (nome: string, extra: Dado) =>
    Dd.criarDespesaFixaAction(A.db, A.owner, { name: nome, category: nome, amount: 1000, due_day: 28, starts_on: meioDia(`${mesCorrente}-01`), ...extra } as Dado);
  const ocs = async (tpl: string) => (await A.db.fixedExpenseOccurrence.findMany({ where: { template_id: tpl }, orderBy: { period: "asc" } })) as Dado[];
  /** as entradas do mês corrente que NÃO estão canceladas, por loja */
  async function ativas(tpl: string): Promise<Record<string, { id: string; amount: number }>> {
    const out: Record<string, { id: string; amount: number }> = {};
    for (const o of await ocs(tpl)) {
      if (diaDe(o.period).slice(0, 7) !== mesCorrente) continue;
      const en = (await A.db.financialEntry.findFirst({ where: { id: o.financial_entry_id } })) as Dado;
      if (en && en.status !== "cancelled") out[o.establishment_id] = { id: en.id, amount: n(en.amount) };
    }
    return out;
  }
  const soma = (m: Record<string, { amount: number }>) => Object.values(m).reduce((s, x) => s + x.amount, 0);

  await prisma.establishment.update({ where: { id: A.L1 }, data: { employees_count: 3 } });
  await prisma.establishment.update({ where: { id: A.L2 }, data: { employees_count: 1 } });
  const nome1 = `M106 Rateio ${stamp}`;
  const t1 = await criar(nome1, { split_kind: "funcionarios" });
  if (!t1.ok) throw new Error(`modelo: ${j(t1)}`);
  const T1 = String((t1.data as Dado).id);
  X.tplA = T1;
  const a0 = await ativas(T1);
  check("(fixture) duas lojas no mês: 750 e 250", Object.keys(a0).length === 2 && perto(a0[A.L1]?.amount, 750) && perto(a0[A.L2]?.amount, 250), j(a0));
  const idsAntigos = Object.values(a0).map((x) => x.id);

  const l3 = await Cat.criarEstabelecimentoAction(A.db, A.owner, { name: `M106 A Loja 3 ${stamp}` });
  if (!l3.ok) throw new Error(`loja 3: ${j(l3)}`);
  const L3 = l3.data.id as string;
  await prisma.establishment.update({ where: { id: L3 }, data: { employees_count: 4 } });
  const aSem = await ativas(T1);
  check("(fixture) sem recalcular, o mês segue com as duas partes antigas", Object.keys(aSem).length === 2 && !aSem[L3], j(aSem));

  console.log("  (a) recalcular o mês corrente");
  const rc = await recalcular(A.db, A.owner, T1, { month: mesCorrente });
  check("recalcular: ok, com month e parts", rc.ok === true && (rc as Dado).data?.month === mesCorrente && Array.isArray((rc as Dado).data?.parts), j(rc));
  const partes3 = ((rc as Dado).data?.parts ?? []) as { establishment_id: string; amount: number }[];
  check("parts traz as três lojas somando o valor do modelo (1000)", partes3.length === 3 && perto(partes3.reduce((s, p) => s + n(p.amount), 0), 1000) && partes3.some((p) => p.establishment_id === L3), j(partes3));
  const a1 = await ativas(T1);
  check("três ocorrências ativas: L1 375, L2 125, L3 500, somando 1000", Object.keys(a1).length === 3 && perto(a1[A.L1]?.amount, 375) && perto(a1[A.L2]?.amount, 125) && perto(a1[L3]?.amount, 500) && perto(soma(a1), 1000), j(a1));
  const antigas = (await A.db.financialEntry.findMany({ where: { id: { in: idsAntigos } } })) as Dado[];
  check("as duas entradas antigas ficam cancelled, com a nota de recalculado", antigas.length === 2 && antigas.every((x) => x.status === "cancelled" && /recalcul/i.test(j(x))), j(antigas.map((x) => [x.status, x.notes ?? x.description ?? null])));
  const hist = (await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "despesa.fixa.recalcular" } })) as Dado[];
  check("o Histórico grava despesa.fixa.recalcular", hist.length === 1, String(hist.length));

  console.log("  (b) o gatilho de leitura não duplica");
  const totalOcs = (await ocs(T1)).length;
  const idsAtivas = Object.values(a1).map((x) => x.id).sort();
  try {
    await Dd.garantirOcorrenciasDoMes(A.db, A.owner, civil(mesCorrente));
  } catch (err) {
    check("garantirOcorrenciasDoMes roda sem lançar", false, String(err));
  }
  const a2 = await ativas(T1);
  check("depois de garantirOcorrenciasDoMes: as mesmas três ativas, mesmos valores", j(Object.values(a2).map((x) => x.id).sort()) === j(idsAtivas) && perto(soma(a2), 1000), j(a2));
  check("e nenhuma ocorrência nova nasceu", (await ocs(T1)).length === totalOcs, `${(await ocs(T1)).length} vs ${totalOcs}`);

  console.log("  (c) mês com conta paga");
  await A.db.financialEntry.update({ where: { id: a1[A.L2].id }, data: { status: "paid", paid_at: new Date() } });
  const ocsAntesPago = (await ocs(T1)).length;
  const fechado = await recalcular(A.db, A.owner, T1, { month: mesCorrente });
  check("recalcular com uma ocorrência paga: 409 MES_FECHADO", recusa(fechado, "MES_FECHADO", undefined, 409), j(fechado));
  const a3 = await ativas(T1);
  check("nada mudou: as mesmas três entradas, a paga continua paga", j(Object.values(a3).map((x) => x.id).sort()) === j(idsAtivas) && ((await A.db.financialEntry.findFirst({ where: { id: a1[A.L2].id } })) as Dado)?.status === "paid" && (await ocs(T1)).length === ocsAntesPago, j(a3));

  console.log("  (d) recusas de validação");
  const nome2 = `M106 Rateio dois ${stamp}`;
  const t2 = await criar(nome2, { split_kind: "funcionarios" });
  if (!t2.ok) throw new Error(`modelo 2: ${j(t2)}`);
  const T2 = String((t2.data as Dado).id);
  const ativasT2Antes = j(Object.values(await ativas(T2)).map((x) => x.id).sort());
  const passado = await recalcular(A.db, A.owner, T2, { month: somaMes(mesCorrente, -1) });
  check("mês passado: VALIDATION_ERROR no campo month", recusa(passado, "VALIDATION_ERROR", "month"), j(passado));
  const invalido = await recalcular(A.db, A.owner, T2, { month: "2026-13" });
  check("mês inválido (2026-13): VALIDATION_ERROR no campo month", recusa(invalido, "VALIDATION_ERROR", "month"), j(invalido));
  const lixo = await recalcular(A.db, A.owner, T2, { month: "novembro" });
  check("mês em texto livre: VALIDATION_ERROR no campo month", recusa(lixo, "VALIDATION_ERROR", "month"), j(lixo));
  check("as recusas não mexeram no modelo 2", j(Object.values(await ativas(T2)).map((x) => x.id).sort()) === ativasT2Antes);
  const t3 = await criar(`M106 Manual ${stamp}`, { amount: 500, split_kind: "percentual", splits: [{ establishment_id: A.L1, value: 60 }, { establishment_id: A.L2, value: 40 }] });
  if (!t3.ok) throw new Error(`modelo 3: ${j(t3)}`);
  const T3 = String((t3.data as Dado).id);
  const ocs3Antes = (await ocs(T3)).length;
  const manual = await recalcular(A.db, A.owner, T3, { month: mesCorrente });
  check("modelo manual (percentual): VALIDATION_ERROR no campo split_kind", recusa(manual, "VALIDATION_ERROR", "split_kind"), j(manual));
  check("o modelo manual segue com as mesmas 24 ocorrências", (await ocs(T3)).length === ocs3Antes);

  console.log("  (e) outro tenant");
  const aAntesB = j(Object.values(await ativas(T2)).map((x) => x.id).sort());
  const dB = await recalcular(B.db, B.owner, T2, { month: mesCorrente });
  check("o dono do tenant B recalcular o modelo de A: NOT_FOUND", recusa(dB, "NOT_FOUND"), j(dB));
  check("o modelo de A não mudou", j(Object.values(await ativas(T2)).map((x) => x.id).sort()) === aAntesB);
}

// ---------------------------------------------------------------------------
// Seção 4: isolamento
// ---------------------------------------------------------------------------
async function secao4() {
  console.log("\n4. Isolamento entre tenants");
  const { A, B } = M!;
  const { prisma } = await import("@/lib/prisma");
  const emailsB = (await (prisma as Dado).emailLog.findMany({ where: { tenant_id: B.tenantId, related_id: X.pedidoA } })) as Dado[];
  check("o EmailLog de B não tem nada do pedido de A", emailsB.length === 0, String(emailsB.length));
  const paraFora = ((await (prisma as Dado).emailLog.findMany({ where: { tenant_id: A.tenantId, related_id: X.pedidoA } })) as Dado[]).filter((l) => /@teste\.local$/.test(String(l.to_email)) && String(l.to_email).includes(`-B-`));
  check("nenhum email do pedido de A foi para usuário de B", paraFora.length === 0, j(paraFora.map((l) => l.to_email)));
  const bAcordos = await chamar(B.tok.owner, R.agreements, "GET", `emporio/customers/${X.clienteA}/agreements`, undefined, X.clienteA);
  check("B não lê os acordos do cliente de A (lista vazia ou recusa)", !(Array.isArray(bAcordos.corpo?.data) && bAcordos.corpo.data.length > 0), `${bAcordos.status} ${j(bAcordos.corpo).slice(0, 200)}`);
  const desfeitoA = (await (prisma as Dado).emporioCreditAgreement.findUnique({ where: { id: X.acordoA } })) as Dado;
  check("o acordo de A só foi desfeito pelo dono de A (undone_by é o Dono de A)", desfeitoA?.undone_by_user_id === A.owner.id, j(desfeitoA?.undone_by_user_id));
  check("o modelo de despesa de A não tem ocorrência em loja de B", (await A.db.fixedExpenseOccurrence.count({ where: { template_id: X.tplA, establishment_id: { in: [B.L1, B.L2] } } })) === 0);
}

// ---------------------------------------------------------------------------

async function limpar() {
  if (tenantIds.length === 0) return;
  const { prisma } = await import("@/lib/prisma");
  for (const id of tenantIds) {
    await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
  }
  const modelos = [
    "emailLog", "fixedExpenseOccurrence", "fixedExpenseSplit", "fixedExpenseTemplate", "variableExpenseRule",
    "emporioPaymentRequest", "emporioCreditRelease", "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "cardReceivable", "cardFeeRate", "cardAcquirer", "emporioSalePayment", "emporioSaleReturnItem",
    "stockMovement", "emporioSaleItem", "emporioSaleReturn", "emporioCheck", "emporioQuoteItem", "emporioQuote", "emporioSale", "emporioPurchaseItem",
    "emporioPurchase", "financialPayment", "financialEntry", "emporioCreditAgreement", "emporioCustomer", "emporioSupplier", "cashHandover", "cashSession", "cashRegister", "emporioCounter",
    "emporioSettings", "userEstablishment", "establishment", "bankAccount", "contact", "user", "tenantProfile", "tenantFeature",
  ];
  // duas passadas: o acordo e a entrada se referenciam, e a ordem de uma só pode deixar sobra
  for (let passada = 0; passada < 2; passada += 1) {
    for (const id of tenantIds) {
      for (const m of modelos) {
        try {
          await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: id } });
        } catch {
          // referência que a próxima passada resolve: segue
        }
      }
    }
  }
  for (const id of tenantIds) await prisma.tenant.delete({ where: { id } }).catch(() => undefined);
  const sobrou = await prisma.tenant.count({ where: { id: { in: tenantIds } } });
  check("a limpeza não deixou tenant para trás", sobrou === 0, String(sobrou));
}

async function main() {
  try {
    await comBanco(async () => {
      await rodar("montagem", async () => {
        M = { A: await montar("A"), B: await montar("B") };
      });
      if (!M) {
        check("a montagem dos tenants terminou (sem ela as seções não rodam)", false);
        return;
      }
      await rodar("1", secao1);
      await rodar("2", secao2);
      await rodar("3", secao3);
      await rodar("4", secao4);
    });
  } finally {
    await limpar();
  }
  console.log(falhas === 0 ? "\n✅ M106 verde" : `\n❌ M106: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
