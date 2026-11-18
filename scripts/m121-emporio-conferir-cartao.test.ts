import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M121: Módulo 39 (Meu Empório), conferir o cartão (frente B, Q349 a Q353).
 * Roda: `npm run test:m121`
 *
 * Escrita só da spec docs/superpowers/specs/2026-11-17-emporio-conferir-cartao-design.md e do bloco
 * Interfaces do plano, sem ler a implementação nova. O que está sob prova passa pela ROTA (Request
 * construído); as fixtures passam pelas actions já existentes e por Prisma (datas e valores exatos).
 * Rota que ainda não existe vira falha de checagem (status 0), nunca exceção que derruba a suíte.
 *
 * Seção 1: estadoDaParcela, pura, com datas fixas (sexta, sábado, dia útil, feriado).
 * Seção 2: os estados pela rota do A receber (relativos a hoje), cancelada fora, campos novos.
 * Seção 3: conferir uma parcela (menos, mais, zero, centavos): saldo, ajuste, Custo do cartão.
 * Seção 4: conferir o dia: reparte exato em centavos, recorte, conferida no meio, 409.
 * Seção 5: corrida: duas conferências simultâneas, só uma grava.
 * Seção 6: desfazer (uma, e parcela por parcela no lote).
 * Seção 7: antecipação pontual nasce conferida e desfaz junto.
 * Seção 8: venda cancelada, parcela cancelada fora.
 * Seção 9: Vencido do A receber e o Hoje do Financeiro.
 * Seção 10: o carimbo do extrato como conferência, e a linha do ajuste no extrato.
 * Seção 11: 403 para quem não tem `dinheiro`.
 * Seção 12: isolamento entre contas bancárias, adquirentes, lojas e tenants.
 * Seção 13: recusas 422 com field.
 * Seção 14: Conferir o dia de uma loja, conferidas dos últimos 7 dias no A receber e a migração Q353.
 *
 * Leituras adotadas onde a spec era ambígua (ver o relato):
 * - o limite da Atrasada é `proximoDiaUtil(effective_on + 1 dia)`: a parcela só fica Atrasada depois do
 *   primeiro dia útil ESTRITAMENTE posterior à data (sexta: terça; dia útil D: D+2 se D+1 for útil). O
 *   texto literal `proximoDiaUtil(effective_on)` devolveria o próprio dia útil e contradiz "dá a manhã
 *   seguinte" e o caso da sexta do plano;
 * - `cards_to_confirm` conta só "A conferir" (estados disjuntos), `cards_overdue` só as atrasadas;
 * - `adjustment` é com sinal (conferido menos previsto); zero vem como null ou 0;
 * - o Custo do cartão do Resultado é lido pela soma dos campos de `card_cost` (menos `card_sales` e
 *   `pct`), para não presumir o nome do campo novo do ajuste;
 * - parcela conferida pela antecipação não se desfaz pela rota de desfazer: 409 ou 422.
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

console.log("🧾 M121: Módulo 39 (Meu Empório), conferir o cartão: estados, conferência por parcela e por dia, ajuste e desfazer (Q349 a Q353)\n");

const tenantIds: string[] = [];
const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, k: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + k * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const dUTC = (dia: string) => new Date(`${dia}T00:00:00Z`);
const emDias = (k: number) => somaDias(hojeStr, k);
const n = (x: unknown) => Number(x);
const cent = (x: unknown) => Math.round(n(x) * 100);
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;
const mesAtual = hojeStr.slice(0, 7);
const dow = (dia: string) => ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][dUTC(dia).getUTCDay()];

type Estado = "prevista" | "a_conferir" | "atrasada" | "conferida";

/** A leitura de referência da spec (ver o cabeçalho): limite da Atrasada = próximo dia útil estritamente depois. */
let DU: { proximoDiaUtil: (d: Date) => Date } | null = null;
const limiteDaAtraso = (on: string) => DU!.proximoDiaUtil(dUTC(somaDias(on, 1))).toISOString().slice(0, 10);
const esperado = (on: string, hoje: string): Estado => (on > hoje ? "prevista" : hoje > limiteDaAtraso(on) ? "atrasada" : "a_conferir");

// ---------------------------------------------------------------------------
// Seção 1 (pura)
// ---------------------------------------------------------------------------

async function secao1Pura() {
  secaoAtual = "1";
  console.log("1. estadoDaParcela, pura, com datas fixas (sem banco)");
  DU = (await import("@/lib/emporio/dia-util")) as typeof DU;
  let M: Dado = null;
  try {
    M = await import("@/lib/actions/emporio-conferencia-cartao");
  } catch (e) {
    check("src/lib/actions/emporio-conferencia-cartao.ts existe e importa", false, e instanceof Error ? e.message.slice(0, 100) : String(e));
    return;
  }
  check("o módulo exporta estadoDaParcela", typeof M.estadoDaParcela === "function");
  if (typeof M.estadoDaParcela !== "function") return;
  const est = (on: string, hoje: string, conferida = false): string =>
    M.estadoDaParcela({ effective_on: dUTC(on), reconciled_at: conferida ? new Date(`${hoje}T15:00:00Z`) : null }, dUTC(hoje));
  // calendário de 2026-11: 06 sex, 07 sab, 08 dom, 09 seg, 10 ter, 11 qua, 18 qua, 19 qui, 20 sex (feriado), 23 seg
  check("calendário de referência: 06/11 sexta, 07 sábado, 20 feriado", dow("2026-11-06") === "sex" && dow("2026-11-07") === "sab" && !!DU && DU.proximoDiaUtil(dUTC("2026-11-20")).toISOString().slice(0, 10) === "2026-11-23");
  console.log("  (a) sexta 06/11");
  check("sexta, hoje quinta: prevista", est("2026-11-06", "2026-11-05") === "prevista", est("2026-11-06", "2026-11-05"));
  check("sexta, hoje a própria sexta: a_conferir", est("2026-11-06", "2026-11-06") === "a_conferir");
  check("sexta, hoje sábado: a_conferir", est("2026-11-06", "2026-11-07") === "a_conferir");
  check("sexta, hoje domingo: a_conferir", est("2026-11-06", "2026-11-08") === "a_conferir");
  check("sexta, hoje segunda: a_conferir (segunda ainda é a manhã seguinte)", est("2026-11-06", "2026-11-09") === "a_conferir", est("2026-11-06", "2026-11-09"));
  check("sexta, hoje terça: atrasada", est("2026-11-06", "2026-11-10") === "atrasada", est("2026-11-06", "2026-11-10"));
  console.log("  (b) sábado 07/11");
  check("sábado, hoje o próprio sábado: a_conferir", est("2026-11-07", "2026-11-07") === "a_conferir");
  check("sábado, hoje segunda: a_conferir", est("2026-11-07", "2026-11-09") === "a_conferir", est("2026-11-07", "2026-11-09"));
  check("sábado, hoje terça: atrasada", est("2026-11-07", "2026-11-10") === "atrasada", est("2026-11-07", "2026-11-10"));
  check("sábado, hoje sexta anterior: prevista", est("2026-11-07", "2026-11-06") === "prevista");
  console.log("  (c) dia útil, segunda 09/11");
  check("segunda, hoje a própria segunda: a_conferir", est("2026-11-09", "2026-11-09") === "a_conferir");
  check("segunda, hoje terça: a_conferir (ontem ainda dá tempo)", est("2026-11-09", "2026-11-10") === "a_conferir", est("2026-11-09", "2026-11-10"));
  check("segunda, hoje quarta: atrasada", est("2026-11-09", "2026-11-11") === "atrasada", est("2026-11-09", "2026-11-11"));
  console.log("  (d) feriado no caminho: quinta 19/11, com a sexta 20/11 feriado");
  check("quinta, hoje sexta (feriado): a_conferir", est("2026-11-19", "2026-11-20") === "a_conferir", est("2026-11-19", "2026-11-20"));
  check("quinta, hoje segunda 23/11: a_conferir (o próximo dia útil depois da quinta é a segunda)", est("2026-11-19", "2026-11-23") === "a_conferir", est("2026-11-19", "2026-11-23"));
  check("quinta, hoje terça 24/11: atrasada", est("2026-11-19", "2026-11-24") === "atrasada", est("2026-11-19", "2026-11-24"));
  console.log("  (e) conferida vence o resto");
  check("conferida com data velha: conferida", est("2026-10-01", "2026-11-17", true) === "conferida", est("2026-10-01", "2026-11-17", true));
  check("conferida com data de hoje: conferida", est("2026-11-17", "2026-11-17", true) === "conferida");
}

// ---------------------------------------------------------------------------
// Montagem (banco)
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
  fin: Usuario;
  tok: Record<"owner" | "fin" | "gestor" | "vend", string>;
  lojas: string[];
  reg: Record<string, string>;
  cliente: string;
  prodId: string;
  presId: string;
};

const PADRAO = { fiado_due_days: 30, fiado_block_after_days: 365, fiado_default_limit: null, fiado_collection_message: null, payment_approval_limit: null };

async function montar(rotulo: string): Promise<Mundo> {
  const { prisma, prismaForTenant, scoped } = await import("@/lib/prisma");
  const { papelDeFixture, papelFinanceiro, vincularTodas } = await import("./_emporio-papel");
  const { abrirTurnoDeTeste } = await import("./_emporio-turno");
  const bcrypt = (await import("bcryptjs")).default;
  const Cat = await import("@/lib/actions/emporio-catalogo");
  const Est = await import("@/lib/actions/emporio-estoque");
  const rotaTok = await import("@/app/api/v1/auth/token/route");
  const hash = await bcrypt.hash(SENHA, 4);

  const t = await prisma.tenant.create({
    data: { name: `M121 ${rotulo} ${stamp}`, document: `M121${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });
  await (prisma as Dado).emporioSettings.upsert({ where: { tenant_id: t.id }, create: { tenant_id: t.id, ...PADRAO }, update: PADRAO });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M121 ${suf}`, email: `m121-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vend = await mk("vend", "OPERADOR");
  const fin = await mk("fin", "OPERADOR", papelFinanceiro());

  const db = prismaForTenant(t.id) as Dado;
  const lojas: string[] = [];
  for (const nome of ["Loja 1", "Loja 2", "Loja 3"]) {
    const l = await Cat.criarEstabelecimentoAction(db, owner, { name: `M121 ${rotulo} ${nome}` });
    if (!l.ok) throw new Error(`loja: ${j(l)}`);
    lojas.push(l.data.id as string);
  }
  await vincularTodas(prisma, t.id, [gestor.id, vend.id], [lojas[0]]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M121 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M121 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  for (const L of lojas) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
    await abrirTurnoDeTeste(db, owner, L);
  }
  const reg: Record<string, string> = {};
  for (const L of lojas) reg[L] = (await db.cashRegister.findFirst({ where: { establishment_id: L, number: 1 } }))?.id as string;
  const cli = await (prisma as Dado).emporioCustomer.create({ data: { tenant_id: t.id, name: `M121 Cliente ${rotulo}` } });

  const tok = {} as Mundo["tok"];
  const pares: [keyof Mundo["tok"], Usuario][] = [["owner", owner], ["fin", fin], ["gestor", gestor], ["vend", vend]];
  for (const [k, u] of pares) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { rotulo, tenantId: t.id, db, owner, fin, tok, lojas, reg, cliente: cli.id as string, prodId: prod.data.id, presId: pres.data.id };
}

// Rotas (import literal, para o bundler do tsx resolver os colchetes). As novas ainda podem não existir.
const R = {
  receivables: () => import("@/app/api/v1/emporio/finance/receivables/route"),
  today: () => import("@/app/api/v1/emporio/finance/today/route"),
  statement: () => import("@/app/api/v1/emporio/finance/statement/route"),
  reconcile: () => import("@/app/api/v1/emporio/finance/statement/reconcile/route"),
  cancel: () => import("@/app/api/v1/emporio/sales/[id]/cancel/route"),
  confirm: () => import("@/app/api/v1/emporio/finance/card-receivables/[id]/confirm/route"),
  confirmDay: () => import("@/app/api/v1/emporio/finance/card-receivables/confirm-day/route"),
  unconfirm: () => import("@/app/api/v1/emporio/finance/card-receivables/[id]/unconfirm/route"),
};

type Resp = { status: number; corpo: Dado };
async function chamar(tok: string, rota: () => Promise<Dado>, metodo: "GET" | "POST" | "DELETE", url: string, corpo?: unknown, id?: string): Promise<Resp> {
  const { withBearer } = await import("./_escopo-de-requisicao");
  let m: Dado;
  try {
    m = await rota();
  } catch (e) {
    // rota ainda não existe: reprova só as afirmações dela, não a seção inteira
    return { status: 0, corpo: { import_error: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
  if (typeof m[metodo] !== "function") return { status: 0, corpo: { import_error: `a rota não exporta ${metodo}` } };
  const req = new Request(`http://localhost/api/v1/${url}`, {
    method: metodo,
    headers: { "content-type": "application/json" },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  try {
    const res = await withBearer(tok, (): Promise<Response> => m[metodo](req, id === undefined ? undefined : { params: Promise.resolve({ id }) }));
    return { status: res.status, corpo: (await res.json().catch(() => ({}))) as Dado };
  } catch (e) {
    return { status: 0, corpo: { throw: e instanceof Error ? e.message.slice(0, 120) : String(e) } };
  }
}
const ok2xx = (r: Resp) => r.status >= 200 && r.status < 300;
const recusou = (r: Resp, status: number, field?: string) => r.status === status && (field === undefined || r.corpo?.error?.field === field);
const dados = (r: Resp): Dado => r.corpo?.data;

async function rodar(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    check(`a seção "${nome}" quebrou`, false, e instanceof Error ? (e.stack ?? e.message).split("\n").slice(0, 12).join(" | ").slice(0, 900) : String(e));
  }
}

let seq = 0;
const chave = (p: string) => `m121-${p}-${stamp}-${(seq += 1)}`;

async function prismaCru(): Promise<Dado> {
  return (await import("@/lib/prisma")).prisma as Dado;
}

// --- fixtures ---

type Cen = { conta: string; aq: string[]; lojas: string[] };

/** Uma conta, duas adquirentes e a taxa de crédito à vista de cada uma em cada loja, tudo caindo na conta. */
async function cen(w: Mundo, nome: string, lojas: string[], nAq = 2): Promise<Cen> {
  const Cx = await import("@/lib/actions/emporio-caixa");
  const K = await import("@/lib/actions/emporio-cartoes");
  const c = await Cx.criarContaAction(w.db, w.owner, { name: `M121 ${nome} ${stamp}`, bank: "Banco M121" });
  if (!c.ok) throw new Error(`conta ${nome}: ${j(c)}`);
  const conta = c.data.id as string;
  const aq: string[] = [];
  for (let i = 0; i < nAq; i += 1) {
    const a = await K.criarAdquirenteAction(w.db, w.owner, { name: `M121 ${nome} adq${i} ${stamp}` });
    if (!a.ok) throw new Error(`adquirente ${nome}: ${j(a)}`);
    aq.push(a.data.id as string);
    for (const L of lojas) {
      const t = await K.criarTaxaAction(w.db, w.owner, {
        establishment_id: L, acquirer_id: a.data.id, brand: "qualquer", kind: "credito_vista", installments_from: 1, installments_to: 1,
        fee_pct: 2, days: 1, bank_account_id: conta, valid_from: meioDia("2020-01-01"),
      });
      if (!t.ok) throw new Error(`taxa ${nome}: ${j(t)}`);
    }
  }
  return { conta, aq, lojas };
}

type Parcela = { id: string; sale_id: string; loja: string };

/** Uma venda no cartão (crédito à vista, uma parcela) com o líquido e o dia da queda escolhidos. */
async function parcela(w: Mundo, c: Cen, o: { net: number; on: string; loja?: string; aq?: number; canceled?: boolean }): Promise<Parcela> {
  const P = await prismaCru();
  const V = await import("@/lib/actions/emporio-vendas");
  const loja = o.loja ?? c.lojas[0];
  const gross = Math.max(10, Math.ceil(o.net / 10) * 10);
  let r: Dado = null;
  // outras suítes rodam no mesmo banco: conflito de escrita da transação serializável é do ambiente, repete
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    try {
      r = await V.venderAction(w.db, w.owner, {
        operation_key: chave("venda"), establishment_id: loja, cash_register_id: w.reg[loja], customer_id: w.cliente,
        items: [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: gross / 10 }],
        payments: [{ kind: "credito_vista", amount: gross, acquirer_id: c.aq[o.aq ?? 0], brand: "visa_master" }],
      } as Dado);
      break;
    } catch (e) {
      if (tentativa === 4 || !/write conflict|deadlock/i.test(String(e))) throw e;
      await new Promise((res) => setTimeout(res, 300 * (tentativa + 1)));
    }
  }
  if (!r.ok) throw new Error(`venda de preparação: ${j(r)}`);
  const saleId = (r.data as Dado).id as string;
  const linhas = (await P.cardReceivable.findMany({ where: { sale_id: saleId } })) as Dado[];
  if (linhas.length !== 1) throw new Error(`esperava 1 parcela na venda ${saleId}, vieram ${linhas.length}`);
  await P.cardReceivable.update({
    where: { id: linhas[0].id },
    data: {
      expected_on: meioDia(o.on), effective_on: meioDia(o.on), net_amount: o.net, effective_net: o.net,
      fee_amount: Math.round((gross - o.net) * 100) / 100, ...(o.canceled ? { canceled_at: new Date() } : {}),
    },
  });
  return { id: linhas[0].id as string, sale_id: saleId, loja };
}

const lerParcela = async (id: string): Promise<Dado> => (await prismaCru()).cardReceivable.findUnique({ where: { id } });
const ajustesDe = async (ids: string[]): Promise<Dado[]> =>
  (await prismaCru()).cashMovement.findMany({ where: { card_receivable_id: { in: ids }, origin: "ajuste_cartao" }, orderBy: { created_at: "asc" } });
/** Ajuste com sinal, em centavos (entrada positiva, saída negativa). */
const sinalCent = (m: Dado) => (m.direction === "entrada" ? 1 : -1) * cent(m.amount);

async function saldo(w: Mundo, conta: string): Promise<number> {
  const Cx = await import("@/lib/actions/emporio-caixa");
  return (await Cx.saldosDasContas(w.db)).get(conta) ?? 0;
}

async function custoDoCartao(w: Mundo, loja: string): Promise<number> {
  const Res = await import("@/lib/actions/emporio-resultado");
  const r = (await Res.resultadoDaLojaAction(w.db, w.owner, { establishment_id: loja, month: mesAtual })) as Dado;
  if (!r.ok) throw new Error(`resultado: ${j(r)}`);
  const cc = (r.data.card_cost ?? {}) as Record<string, unknown>;
  return Object.entries(cc).filter(([k, v]) => k !== "card_sales" && k !== "pct" && typeof v === "number").reduce((s, [, v]) => s + cent(v), 0);
}

/** O resultado da loja no mês, em centavos (decisão da sessão principal: o ajuste também sai do resultado). */
async function resultadoDoMes(w: Mundo, loja: string): Promise<number> {
  const Res = await import("@/lib/actions/emporio-resultado");
  const r = (await Res.resultadoDaLojaAction(w.db, w.owner, { establishment_id: loja, month: mesAtual })) as Dado;
  if (!r.ok) throw new Error(`resultado: ${j(r)}`);
  return cent(r.data.result);
}

async function logs(w: Mundo): Promise<number> {
  return (await prismaCru()).emporioAuditLog.count({ where: { tenant_id: w.tenantId } });
}

const conf = (w: Mundo, tok: string, id: string, received_amount: unknown, extra: Dado = {}) =>
  chamar(tok, R.confirm, "POST", `emporio/finance/card-receivables/${id}/confirm`, { received_amount, ...extra }, id);
const confDia = (tok: string, c: { conta: string; aq: string }, on: string, received_total: unknown, extra: Dado = {}) =>
  chamar(tok, R.confirmDay, "POST", "emporio/finance/card-receivables/confirm-day", { bank_account_id: c.conta, acquirer_id: c.aq, effective_on: on, received_total, ...extra });
const desf = (tok: string, id: string, reason: unknown) =>
  chamar(tok, R.unconfirm, "POST", `emporio/finance/card-receivables/${id}/unconfirm`, reason === undefined ? {} : { reason }, id);
const aReceber = (tok: string, qs = "") => chamar(tok, R.receivables, "GET", `emporio/finance/receivables${qs}`);
const hojeFin = (tok: string) => chamar(tok, R.today, "GET", "emporio/finance/today");
const cartoesDe = (r: Resp): Dado[] => (Array.isArray(r.corpo?.data?.cards) ? r.corpo.data.cards : []);

let A = null as unknown as Mundo;
let B = null as unknown as Mundo;
const X: Record<string, Dado> = {};

// ---------------------------------------------------------------------------
// Seção 2: os estados pela rota
// ---------------------------------------------------------------------------

async function secao2() {
  secaoAtual = "2";
  console.log("\n2. Os estados pela rota do A receber (datas relativas a hoje, em Brasília)");
  const c = await cen(A, "estados", [A.lojas[0]]);
  const offsets = [2, 0, -1, -2, -3, -4, -5, -6, -7, -8, -9];
  const ps: Record<number, Parcela> = {};
  for (const k of offsets) ps[k] = await parcela(A, c, { net: 40, on: emDias(k) });
  const canc = await parcela(A, c, { net: 70, on: emDias(-9), canceled: true });
  const conferida = await parcela(A, c, { net: 60, on: emDias(-9) });
  const rc = await conf(A, A.tok.fin, conferida.id, 60);
  check("preparação: conferir uma parcela velha pela rota: 2xx", ok2xx(rc), `${rc.status} ${j(rc.corpo).slice(0, 200)}`);
  check("a resposta da conferência traz status conferida, confirmed_net e adjustment", dados(rc)?.status === "conferida" && perto(dados(rc)?.confirmed_net, 60) && "adjustment" in (dados(rc) ?? {}), j(dados(rc)));

  const r = await aReceber(A.tok.owner);
  check("o Dono lê o A receber: 200", r.status === 200, `${r.status} ${j(r.corpo).slice(0, 200)}`);
  const cards = cartoesDe(r);
  const por = (id: string) => cards.find((x) => x.id === id);
  console.log(`  (hoje é ${hojeStr}, ${dow(hojeStr)})`);
  for (const k of offsets) {
    const on = emDias(k);
    const esp = esperado(on, hojeStr);
    check(`effective_on ${on} (${dow(on)}, ${k >= 0 ? "+" : ""}${k}d): ${esp}`, por(ps[k].id)?.status === esp, `veio ${por(ps[k].id)?.status}`);
  }
  const todos = new Set(offsets.map((k) => esperado(emDias(k), hojeStr)));
  check("o cenário cobre os três estados abertos (prevista, a_conferir, atrasada)", todos.has("prevista") && todos.has("a_conferir") && todos.has("atrasada"), j([...todos]));
  check("a parcela cancelada não aparece na lista", por(canc.id) === undefined);
  const conferidaNaLista = por(conferida.id);
  check("a conferida, se listada, vem com status conferida e o valor conferido", conferidaNaLista === undefined || (conferidaNaLista.status === "conferida" && perto(n(conferidaNaLista.confirmed_net), 60)), j(conferidaNaLista));
  const amostra = por(ps[0].id);
  check("cada linha traz status, confirmed_net e adjustment (nulos antes da conferência)", !!amostra && "status" in amostra && "confirmed_net" in amostra && "adjustment" in amostra && amostra.confirmed_net === null && (amostra.adjustment ?? null) === null, j(amostra));
  check("a parcela atrasada tem 9 dias: sempre atrasada, qualquer que seja o dia da semana de hoje", por(ps[-9].id)?.status === "atrasada", j(por(ps[-9].id)));
  check("a parcela de hoje é sempre a_conferir", por(ps[0].id)?.status === "a_conferir", j(por(ps[0].id)));
}

// ---------------------------------------------------------------------------
// Seção 3: conferir uma
// ---------------------------------------------------------------------------

async function secao3() {
  secaoAtual = "3";
  console.log("\n3. Conferir uma parcela: para menos, para mais, zero, centavos");
  const c = await cen(A, "uma", [A.lojas[0]]);
  const L = A.lojas[0];
  const on = emDias(-3);

  console.log("  (a) caiu R$ 10,00 a menos (100,00 previstos, 90,00 caíram)");
  const p1 = await parcela(A, c, { net: 100, on });
  const s0 = await saldo(A, c.conta);
  const k0 = await custoDoCartao(A, L);
  const res0 = await resultadoDoMes(A, L);
  const l0 = await logs(A);
  const r1 = await conf(A, A.tok.fin, p1.id, 90, { notes: "caiu a menos" });
  check("2xx", ok2xx(r1), `${r1.status} ${j(r1.corpo).slice(0, 200)}`);
  const d1 = await lerParcela(p1.id);
  check("a parcela grava reconciled_at, reconciled_by_user_id (o Financeiro) e confirmed_net 90,00", !!d1.reconciled_at && d1.reconciled_by_user_id === A.fin.id && perto(n(d1.confirmed_net), 90), j(d1));
  check("o previsto (effective_net) não muda: 100,00", perto(n(d1.effective_net), 100), j(d1.effective_net));
  const a1 = await ajustesDe([p1.id]);
  check("nasce UM CashMovement ajuste_cartao ligado à parcela", a1.length === 1, j(a1));
  check("saída de R$ 10,00 na conta da parcela", a1.length === 1 && a1[0].direction === "saida" && cent(a1[0].amount) === 1000 && a1[0].bank_account_id === c.conta, j(a1));
  // O movimento de conta não leva loja (CHECK CashMovement_exactly_one_place): a loja vem da parcela ligada.
  check("o ajuste aponta para a parcela (e por ela, para a loja)", a1.length === 1 && a1[0].card_receivable_id === p1.id && d1.establishment_id === L, j({ cr: a1[0]?.card_receivable_id, loja: d1.establishment_id }));
  check("o saldo da conta cai exatamente 10,00 (1000 centavos)", (await saldo(A, c.conta)) - s0 === -1000, `${(await saldo(A, c.conta)) - s0}`);
  check("a resposta: status conferida, confirmed_net 90, adjustment -10 (conferido menos previsto)", dados(r1)?.status === "conferida" && perto(dados(r1)?.confirmed_net, 90) && perto(dados(r1)?.adjustment, -10), j(dados(r1)));
  check("o Custo do cartão do Resultado sobe 10,00", (await custoDoCartao(A, L)) - k0 === 1000, `${(await custoDoCartao(A, L)) - k0} centavos`);
  check("o resultado do mês cai 10,00 (o ajuste é dinheiro que não entrou)", (await resultadoDoMes(A, L)) - res0 === -1000, `${(await resultadoDoMes(A, L)) - res0} centavos`);
  check("a escrita foi para o Histórico", (await logs(A)) > l0, `${l0} -> ${await logs(A)}`);
  const r1b = await conf(A, A.tok.fin, p1.id, 95);
  check("conferir de novo a mesma parcela: 409 (conferida não se edita)", recusou(r1b, 409), `${r1b.status} ${j(r1b.corpo).slice(0, 160)}`);
  check("a recusa não mexe em nada: confirmed_net segue 90 e um só ajuste", perto(n((await lerParcela(p1.id)).confirmed_net), 90) && (await ajustesDe([p1.id])).length === 1);

  console.log("  (b) caiu R$ 5,00 a mais (100,00 previstos, 105,00 caíram)");
  const p2 = await parcela(A, c, { net: 100, on });
  const s2 = await saldo(A, c.conta);
  const k2 = await custoDoCartao(A, L);
  const r2 = await conf(A, A.tok.owner, p2.id, 105);
  check("2xx", ok2xx(r2), `${r2.status} ${j(r2.corpo).slice(0, 200)}`);
  const a2 = await ajustesDe([p2.id]);
  check("entrada de R$ 5,00 na conta da parcela", a2.length === 1 && a2[0].direction === "entrada" && cent(a2[0].amount) === 500 && a2[0].bank_account_id === c.conta, j(a2));
  check("o saldo da conta sobe exatamente 5,00", (await saldo(A, c.conta)) - s2 === 500, `${(await saldo(A, c.conta)) - s2}`);
  check("adjustment +5 e confirmed_net 105", perto(dados(r2)?.adjustment, 5) && perto(dados(r2)?.confirmed_net, 105), j(dados(r2)));
  check("o Custo do cartão do Resultado cai 5,00 (entrada reduz)", (await custoDoCartao(A, L)) - k2 === -500, `${(await custoDoCartao(A, L)) - k2} centavos`);

  console.log("  (c) caiu exatamente o previsto: sem ajuste");
  const p3 = await parcela(A, c, { net: 100, on });
  const s3 = await saldo(A, c.conta);
  const k3 = await custoDoCartao(A, L);
  const r3 = await conf(A, A.tok.fin, p3.id, 100);
  check("2xx", ok2xx(r3), `${r3.status} ${j(r3.corpo).slice(0, 200)}`);
  const d3 = await lerParcela(p3.id);
  check("conferida com confirmed_net 100,00 e reconciled_at", !!d3.reconciled_at && perto(n(d3.confirmed_net), 100), j(d3));
  check("nenhum CashMovement ajuste_cartao", ok2xx(r3) && (await ajustesDe([p3.id])).length === 0);
  check("o saldo não muda", ok2xx(r3) && (await saldo(A, c.conta)) === s3);
  check("adjustment é null ou 0", ok2xx(r3) && (dados(r3)?.adjustment === null || dados(r3)?.adjustment === 0 || dados(r3)?.adjustment === undefined), j(dados(r3)?.adjustment));
  check("o Custo do cartão não muda", ok2xx(r3) && (await custoDoCartao(A, L)) === k3);

  console.log("  (d) centavos exatos: 100,01 previstos, 99,98 caíram (menos 0,03)");
  const p4 = await parcela(A, c, { net: 100.01, on });
  const s4 = await saldo(A, c.conta);
  const r4 = await conf(A, A.tok.fin, p4.id, 99.98);
  check("2xx", ok2xx(r4), `${r4.status} ${j(r4.corpo).slice(0, 200)}`);
  const a4 = await ajustesDe([p4.id]);
  check("saída de exatamente 3 centavos", a4.length === 1 && a4[0].direction === "saida" && cent(a4[0].amount) === 3, j(a4));
  check("o saldo cai exatamente 3 centavos", (await saldo(A, c.conta)) - s4 === -3, `${(await saldo(A, c.conta)) - s4}`);
  check("a diferença acima de 10% não é recusada pelo servidor: 50,00 previstos, 10,00 caíram", ok2xx(await conf(A, A.tok.fin, (await parcela(A, c, { net: 50, on })).id, 10)));
}

// ---------------------------------------------------------------------------
// Seção 4: conferir o dia
// ---------------------------------------------------------------------------

async function secao4() {
  secaoAtual = "4";
  console.log("\n4. Conferir o dia: reparte em centavos, recorte, conferida no meio");
  const L1 = A.lojas[0];
  const L2 = A.lojas[1];

  console.log("  (a) a sobra de 1 centavo vai para a maior parcela: 33,33 + 33,33 + 33,34, caíram 99,99");
  const c = await cen(A, "dia", [L1, L2]);
  const outra = await cen(A, "dia outra conta", [L1]);
  const D = emDias(-2);
  const a1 = await parcela(A, c, { net: 33.33, on: D, loja: L1 });
  const a2 = await parcela(A, c, { net: 33.33, on: D, loja: L2 });
  const a3 = await parcela(A, c, { net: 33.34, on: D, loja: L1 });
  const b1 = await parcela(A, c, { net: 50, on: D, aq: 1 });
  const c1 = await parcela(A, c, { net: 50, on: emDias(-3) });
  const d1 = await parcela(A, outra, { net: 50, on: D });
  X.dia = { c, a1, a2, a3, b1, c1, d1, D };
  const s0 = await saldo(A, c.conta);
  const l0 = await logs(A);
  const r = await confDia(A.tok.fin, { conta: c.conta, aq: c.aq[0] }, D, 99.99);
  check("2xx", ok2xx(r), `${r.status} ${j(r.corpo).slice(0, 200)}`);
  const aj = await ajustesDe([a1.id, a2.id, a3.id]);
  check("um único ajuste no dia: de 1 centavo, saída, na maior parcela (33,34)", aj.length === 1 && aj[0].card_receivable_id === a3.id && aj[0].direction === "saida" && cent(aj[0].amount) === 1, j(aj.map((m) => [m.card_receivable_id, m.direction, m.amount])));
  const [da1, da2, da3] = [await lerParcela(a1.id), await lerParcela(a2.id), await lerParcela(a3.id)];
  check("as três ficam conferidas, com carimbo e quem conferiu", [da1, da2, da3].every((p) => !!p.reconciled_at && p.reconciled_by_user_id === A.fin.id), j([da1.reconciled_at, da2.reconciled_at, da3.reconciled_at]));
  check("confirmed_net: 33,33, 33,33 e 33,33", [da1, da2, da3].every((p) => cent(p.confirmed_net) === 3333), j([da1.confirmed_net, da2.confirmed_net, da3.confirmed_net]));
  check("a soma conferida é exatamente o total que caiu (99,99)", cent(da1.confirmed_net) + cent(da2.confirmed_net) + cent(da3.confirmed_net) === 9999);
  check("o saldo da conta cai exatamente 1 centavo", (await saldo(A, c.conta)) - s0 === -1, `${(await saldo(A, c.conta)) - s0}`);
  check("a parcela de outra adquirente, a de outro dia e a de outra conta ficam intactas", [b1, c1, d1].every((p) => true) && !(await lerParcela(b1.id)).reconciled_at && !(await lerParcela(c1.id)).reconciled_at && !(await lerParcela(d1.id)).reconciled_at);
  check("o lote foi para o Histórico", (await logs(A)) > l0);
  check("o recorte pegou as duas lojas da mesma conta (L2 conferida junto com L1)", !!da2.reconciled_at && !!da1.reconciled_at);
  const rep = await confDia(A.tok.fin, { conta: c.conta, aq: c.aq[0] }, D, 99.99);
  check("conferir o mesmo recorte de novo: 409 (nada a conferir)", recusou(rep, 409), `${rep.status} ${j(rep.corpo).slice(0, 160)}`);
  const vazio = await confDia(A.tok.fin, { conta: c.conta, aq: c.aq[1] }, emDias(-5), 10);
  check("recorte sem nenhuma parcela: 409", recusou(vazio, 409), `${vazio.status} ${j(vazio.corpo).slice(0, 160)}`);
  const outraAdq = await confDia(A.tok.fin, { conta: c.conta, aq: c.aq[1] }, D, 50);
  check("a outra adquirente, mesmo dia e conta, confere à parte (a parcela de 50,00)", ok2xx(outraAdq) && !!(await lerParcela(b1.id)).reconciled_at && !(await lerParcela(c1.id)).reconciled_at, `${outraAdq.status} ${j(outraAdq.corpo).slice(0, 160)}`);

  console.log("  (b) parcela já conferida no meio: 100 + 200 (já conferida) + 300, caíram 390 para as outras duas");
  const cb = await cen(A, "dia meio", [L1]);
  const Db = emDias(-4);
  const m1 = await parcela(A, cb, { net: 100, on: Db });
  const m2 = await parcela(A, cb, { net: 200, on: Db });
  const m3 = await parcela(A, cb, { net: 300, on: Db });
  const rm2 = await conf(A, A.tok.fin, m2.id, 205);
  check("preparação: a de 200 caiu 205 (ajuste +5 já feito)", ok2xx(rm2), `${rm2.status}`);
  const sb = await saldo(A, cb.conta);
  const rb = await confDia(A.tok.fin, { conta: cb.conta, aq: cb.aq[0] }, Db, 390);
  check("2xx", ok2xx(rb), `${rb.status} ${j(rb.corpo).slice(0, 200)}`);
  const ajb = await ajustesDe([m1.id, m3.id]);
  const por = (id: string) => ajb.find((m) => m.card_receivable_id === id);
  check("a diferença do dia é só das duas abertas: 400 previstos, 390 caíram, menos 10,00", ajb.length === 2 && sinalCent(por(m1.id)!) + sinalCent(por(m3.id)!) === -1000, j(ajb.map((m) => [m.card_receivable_id, m.direction, m.amount])));
  check("na proporção do líquido: 100 leva menos 2,50 e 300 leva menos 7,50", !!por(m1.id) && !!por(m3.id) && sinalCent(por(m1.id)!) === -250 && sinalCent(por(m3.id)!) === -750);
  const dm2 = await lerParcela(m2.id);
  check("a conferida no meio fica como estava: 205,00 e um só ajuste (+5,00)", perto(n(dm2.confirmed_net), 205) && (await ajustesDe([m2.id])).length === 1);
  check("o saldo da conta cai exatamente 10,00 no lote", (await saldo(A, cb.conta)) - sb === -1000, `${(await saldo(A, cb.conta)) - sb}`);

  console.log("  (c) reparte com resto: 100 + 200 + 300, caíram 595 (menos 5,00)");
  const cc = await cen(A, "dia resto", [L1]);
  const Dc = emDias(-5);
  const r1 = await parcela(A, cc, { net: 100, on: Dc });
  const r2 = await parcela(A, cc, { net: 200, on: Dc });
  const r3 = await parcela(A, cc, { net: 300, on: Dc });
  const sc = await saldo(A, cc.conta);
  const rr = await confDia(A.tok.fin, { conta: cc.conta, aq: cc.aq[0] }, Dc, 595);
  check("2xx", ok2xx(rr), `${rr.status} ${j(rr.corpo).slice(0, 200)}`);
  const ajc = await ajustesDe([r1.id, r2.id, r3.id]);
  const soma = ajc.reduce((s, m) => s + sinalCent(m), 0);
  check("a soma dos ajustes é EXATAMENTE a diferença do dia (menos 500 centavos)", soma === -500, `${soma}`);
  const ex: [Parcela, number][] = [[r1, 500 / 6], [r2, 1000 / 6], [r3, 250]];
  check("cada ajuste fica a 1 centavo da proporção exata (83,33; 166,67; 250,00)", ex.every(([p, e]) => { const m = ajc.find((x) => x.card_receivable_id === p.id); return !!m && Math.abs(Math.abs(sinalCent(m)) - e) <= 1; }), j(ajc.map((m) => [m.card_receivable_id === r1.id ? 100 : m.card_receivable_id === r2.id ? 200 : 300, sinalCent(m)])));
  check("todos do mesmo sinal (saída)", ajc.every((m) => m.direction === "saida"));
  const confs = [await lerParcela(r1.id), await lerParcela(r2.id), await lerParcela(r3.id)];
  check("a soma dos confirmed_net é 595,00", confs.reduce((s, p) => s + cent(p.confirmed_net), 0) === 59500, j(confs.map((p) => p.confirmed_net)));
  check("cada confirmed_net é o previsto mais o seu ajuste", [[r1, 10000], [r2, 20000], [r3, 30000]].every(([p, prev], i) => cent(confs[i].confirmed_net) === (prev as number) + (ajc.find((x) => x.card_receivable_id === (p as Parcela).id) ? sinalCent(ajc.find((x) => x.card_receivable_id === (p as Parcela).id)!) : 0)));
  check("o saldo da conta cai exatamente 5,00", (await saldo(A, cc.conta)) - sc === -500, `${(await saldo(A, cc.conta)) - sc}`);

  console.log("  (d) o dia caiu a mais: 50 + 50, caíram 101 (mais 1,00)");
  const cd = await cen(A, "dia mais", [L1]);
  const Dd = emDias(-2);
  const e1 = await parcela(A, cd, { net: 50, on: Dd });
  const e2 = await parcela(A, cd, { net: 50, on: Dd });
  const sd = await saldo(A, cd.conta);
  const rd = await confDia(A.tok.fin, { conta: cd.conta, aq: cd.aq[0] }, Dd, 101);
  check("2xx", ok2xx(rd), `${rd.status} ${j(rd.corpo).slice(0, 200)}`);
  const ajd = await ajustesDe([e1.id, e2.id]);
  check("dois ajustes de entrada, 0,50 cada, somando 1,00", ajd.length === 2 && ajd.every((m) => m.direction === "entrada" && cent(m.amount) === 50), j(ajd.map((m) => [m.direction, m.amount])));
  check("o saldo sobe exatamente 1,00", (await saldo(A, cd.conta)) - sd === 100);

  console.log("  (e) o dia sem diferença: sem ajuste algum");
  const ce = await cen(A, "dia zero", [L1]);
  const f1 = await parcela(A, ce, { net: 70, on: Dd });
  const f2 = await parcela(A, ce, { net: 30, on: Dd });
  const re = await confDia(A.tok.fin, { conta: ce.conta, aq: ce.aq[0] }, Dd, 100);
  check("2xx", ok2xx(re), `${re.status}`);
  check("conferidas, sem nenhum ajuste", !!(await lerParcela(f1.id)).reconciled_at && !!(await lerParcela(f2.id)).reconciled_at && (await ajustesDe([f1.id, f2.id])).length === 0);
}

// ---------------------------------------------------------------------------
// Seção 5: corrida
// ---------------------------------------------------------------------------

async function secao5() {
  secaoAtual = "5";
  console.log("\n5. Corrida: duas conferências do mesmo dia ao mesmo tempo, só uma grava");
  const L1 = A.lojas[0];
  const c = await cen(A, "corrida", [L1]);
  const D = emDias(-2);
  const ps = [await parcela(A, c, { net: 100, on: D }), await parcela(A, c, { net: 100, on: D }), await parcela(A, c, { net: 100, on: D })];
  const ids = ps.map((p) => p.id);
  const s0 = await saldo(A, c.conta);
  const [r1, r2] = await Promise.all([
    confDia(A.tok.fin, { conta: c.conta, aq: c.aq[0] }, D, 290),
    confDia(A.tok.owner, { conta: c.conta, aq: c.aq[0] }, D, 290),
  ]);
  const oks = [r1, r2].filter(ok2xx).length;
  check("duas conferências do mesmo dia: exatamente uma 2xx", oks === 1, `${r1.status} e ${r2.status}`);
  const perdedora = [r1, r2].find((x) => !ok2xx(x));
  check("a que perde leva 409", !!perdedora && perdedora.status === 409, `${perdedora?.status} ${j(perdedora?.corpo).slice(0, 160)}`);
  const aj = await ajustesDe(ids);
  check("os ajustes do dia somam UMA vez só a diferença: menos 10,00", aj.reduce((s, m) => s + sinalCent(m), 0) === -1000, j(aj.map((m) => [m.card_receivable_id, m.direction, m.amount])));
  check("nenhuma parcela com mais de um ajuste", oks === 1 && ids.every((id) => aj.filter((m) => m.card_receivable_id === id).length <= 1));
  check("o saldo cai exatamente 10,00 (e não 20,00)", (await saldo(A, c.conta)) - s0 === -1000, `${(await saldo(A, c.conta)) - s0}`);

  console.log("  (b) a mesma parcela conferida por duas pessoas ao mesmo tempo");
  const p = await parcela(A, c, { net: 100, on: emDias(-3) });
  const sp = await saldo(A, c.conta);
  const [q1, q2] = await Promise.all([conf(A, A.tok.fin, p.id, 90), conf(A, A.tok.owner, p.id, 90)]);
  check("exatamente uma 2xx e a outra 409", [q1, q2].filter(ok2xx).length === 1 && [q1, q2].some((x) => x.status === 409), `${q1.status} e ${q2.status}`);
  check("um só ajuste e o saldo cai 10,00", (await ajustesDe([p.id])).length === 1 && (await saldo(A, c.conta)) - sp === -1000);

  console.log("  (c) duas conferências do dia com totais diferentes: vale uma, inteira");
  const cc = await cen(A, "corrida totais", [L1]);
  const Dc = emDias(-2);
  const qs = [await parcela(A, cc, { net: 100, on: Dc }), await parcela(A, cc, { net: 100, on: Dc }), await parcela(A, cc, { net: 100, on: Dc })];
  const sc = await saldo(A, cc.conta);
  const [t1, t2] = await Promise.all([
    confDia(A.tok.fin, { conta: cc.conta, aq: cc.aq[0] }, Dc, 290),
    confDia(A.tok.owner, { conta: cc.conta, aq: cc.aq[0] }, Dc, 280),
  ]);
  check("exatamente uma 2xx", [t1, t2].filter(ok2xx).length === 1, `${t1.status} e ${t2.status}`);
  const vencedor = ok2xx(t1) ? -1000 : -2000;
  const ajc = await ajustesDe(qs.map((x) => x.id));
  check("o saldo e os ajustes são os da conferência que ganhou, sem mistura (10,00 ou 20,00)", (await saldo(A, cc.conta)) - sc === vencedor && ajc.reduce((s, m) => s + sinalCent(m), 0) === vencedor, `saldo ${(await saldo(A, cc.conta)) - sc}, ajustes ${ajc.reduce((s, m) => s + sinalCent(m), 0)}, esperado ${vencedor}`);
}

// ---------------------------------------------------------------------------
// Seção 6: desfazer
// ---------------------------------------------------------------------------

async function secao6() {
  secaoAtual = "6";
  console.log("\n6. Desfazer a conferência");
  const L1 = A.lojas[0];
  const c = await cen(A, "desfazer", [L1]);
  const on = emDias(-9);
  const p = await parcela(A, c, { net: 100, on });
  const s0 = await saldo(A, c.conta);
  const k0 = await custoDoCartao(A, L1);
  const rc = await conf(A, A.tok.fin, p.id, 93);
  check("preparação: conferida com 7,00 a menos", ok2xx(rc) && (await ajustesDe([p.id])).length === 1, `${rc.status}`);
  check("o saldo caiu 7,00", (await saldo(A, c.conta)) - s0 === -700);

  const semMotivo = await desf(A.tok.fin, p.id, undefined);
  check("sem reason: 422 no campo reason", recusou(semMotivo, 422, "reason"), `${semMotivo.status} ${j(semMotivo.corpo).slice(0, 200)}`);
  const vazio = await desf(A.tok.fin, p.id, "   ");
  check("reason só com espaços: 422 no campo reason", recusou(vazio, 422, "reason"), `${vazio.status} ${j(vazio.corpo).slice(0, 200)}`);
  check("as recusas não desfazem nada", !!(await lerParcela(p.id)).reconciled_at && (await ajustesDe([p.id])).length === 1);

  const l0 = await logs(A);
  const rd = await desf(A.tok.fin, p.id, "Valor digitado errado");
  check("com motivo: 2xx", ok2xx(rd), `${rd.status} ${j(rd.corpo).slice(0, 200)}`);
  const d = await lerParcela(p.id);
  check("limpa o carimbo, quem carimbou e o confirmed_net", ok2xx(rd) && d.reconciled_at === null && d.reconciled_by_user_id === null && d.confirmed_net === null, j(d));
  check("apaga o ajuste da parcela", ok2xx(rd) && (await ajustesDe([p.id])).length === 0);
  check("o saldo volta ao de antes da conferência", ok2xx(rd) && (await saldo(A, c.conta)) === s0, `${(await saldo(A, c.conta)) - s0}`);
  check("o Custo do cartão volta ao de antes", ok2xx(rd) && (await custoDoCartao(A, L1)) === k0);
  check("o desfazer vai para o Histórico, com o motivo", (await logs(A)) > l0 && j(await (await prismaCru()).emporioAuditLog.findMany({ where: { tenant_id: A.tenantId }, orderBy: { created_at: "desc" }, take: 5 })).includes("Valor digitado errado"));
  const r2 = await aReceber(A.tok.owner);
  check("a parcela volta a ser listada como atrasada (9 dias)", cartoesDe(r2).find((x) => x.id === p.id)?.status === "atrasada", j(cartoesDe(r2).find((x) => x.id === p.id)));
  const de2 = await desf(A.tok.fin, p.id, "De novo");
  check("desfazer parcela que não está conferida: 409", recusou(de2, 409), `${de2.status} ${j(de2.corpo).slice(0, 160)}`);
  const re = await conf(A, A.tok.fin, p.id, 100);
  check("depois de desfeita, conferir de novo: 2xx", ok2xx(re), `${re.status}`);

  console.log("  (b) no lote, desfaz-se parcela por parcela");
  const cl = await cen(A, "desfazer lote", [L1]);
  const Dl = emDias(-9);
  const q1 = await parcela(A, cl, { net: 100, on: Dl });
  const q2 = await parcela(A, cl, { net: 200, on: Dl });
  const q3 = await parcela(A, cl, { net: 300, on: Dl });
  const sl = await saldo(A, cl.conta);
  const rl = await confDia(A.tok.fin, { conta: cl.conta, aq: cl.aq[0] }, Dl, 570);
  check("preparação: o dia conferido com 30,00 a menos", ok2xx(rl), `${rl.status} ${j(rl.corpo).slice(0, 160)}`);
  const ajs = await ajustesDe([q1.id, q2.id, q3.id]);
  const a2 = ajs.find((m) => m.card_receivable_id === q2.id);
  const a3 = ajs.find((m) => m.card_receivable_id === q3.id);
  check("preparação: três ajustes de saída que somam 30,00", ajs.length === 3 && ajs.reduce((s, m) => s + sinalCent(m), 0) === -3000, j(ajs.map((m) => [m.card_receivable_id, m.direction, m.amount])));
  const rdesf = await desf(A.tok.fin, q2.id, "Só esta estava errada");
  check("desfazer só a parcela de 200: 2xx", ok2xx(rdesf), `${rdesf.status} ${j(rdesf.corpo).slice(0, 160)}`);
  check("a de 200 volta a aberta e perde o ajuste", ok2xx(rdesf) && (await lerParcela(q2.id)).reconciled_at === null && (await ajustesDe([q2.id])).length === 0);
  check("as outras duas seguem conferidas, com o ajuste de cada uma", !!(await lerParcela(q1.id)).reconciled_at && !!(await lerParcela(q3.id)).reconciled_at && (await ajustesDe([q1.id])).length === 1 && (await ajustesDe([q3.id])).length === 1);
  check("o saldo volta só o ajuste da parcela desfeita", !!a2 && (await saldo(A, cl.conta)) - sl === -3000 - sinalCent(a2), `${(await saldo(A, cl.conta)) - sl}`);
  check("e a de 300 segue com o confirmed_net dela", !!a3 && cent((await lerParcela(q3.id)).confirmed_net) === 30000 + sinalCent(a3));
}

// ---------------------------------------------------------------------------
// Seção 7: antecipação pontual
// ---------------------------------------------------------------------------

async function secao7() {
  secaoAtual = "7";
  console.log("\n7. Antecipação pontual: as parcelas nascem conferidas e desfazem junto");
  const L1 = A.lojas[0];
  const An = await import("@/lib/actions/emporio-antecipacao");
  const c = await cen(A, "antecipacao", [L1]);
  const futuro = emDias(5);
  const p1 = await parcela(A, c, { net: 100, on: futuro });
  const p2 = await parcela(A, c, { net: 100, on: futuro });
  const s0 = await saldo(A, c.conta);
  const l0 = await logs(A);
  const ra = await An.anteciparAction(A.db, A.owner, { receivable_ids: [p1.id, p2.id], operated_on: meioDia(hojeStr), received_net: 190 });
  check("antecipar duas parcelas de 100,00 recebendo 190,00: ok", ra.ok, j(ra).slice(0, 300));
  if (!ra.ok) return;
  const opId = (ra.data as Dado).id as string;
  const d = [await lerParcela(p1.id), await lerParcela(p2.id)];
  check("as duas nascem conferidas (reconciled_at preenchido)", d.every((x) => !!x.reconciled_at), j(d.map((x) => x.reconciled_at)));
  check("confirmed_net é o líquido que de fato cai (effective_net depois do custo)", d.every((x) => x.confirmed_net !== null && cent(x.confirmed_net) === cent(x.effective_net)), j(d.map((x) => [x.confirmed_net, x.effective_net])));
  check("a soma dos confirmed_net é o líquido informado (190,00)", d.reduce((s, x) => s + cent(x.confirmed_net), 0) === 19000, j(d.map((x) => x.confirmed_net)));
  check("sem nenhum ajuste_cartao", (await ajustesDe([p1.id, p2.id])).length === 0);
  check("o saldo da conta sobe os 190,00 e nada além disso", (await saldo(A, c.conta)) - s0 === 19000, `${(await saldo(A, c.conta)) - s0}`);
  check("a antecipação foi para o Histórico", (await logs(A)) > l0);

  const rd = await desf(A.tok.owner, p1.id, "Tentando desfazer pela conferência");
  check("a parcela conferida pela antecipação não se desfaz pela rota de desfazer: 409 ou 422", rd.status === 409 || rd.status === 422, `${rd.status} ${j(rd.corpo).slice(0, 160)}`);
  check("e segue conferida", !!(await lerParcela(p1.id)).reconciled_at);

  const rx = await An.desfazerAntecipacaoAction(A.db, A.owner, opId);
  check("desfazer a antecipação: ok, mesmo com as parcelas conferidas (a conferência delas vai junto)", rx.ok, j(rx).slice(0, 300));
  if (!rx.ok) return;
  const v = [await lerParcela(p1.id), await lerParcela(p2.id)];
  check("as parcelas voltam sem conferência: sem reconciled_at, sem quem carimbou e sem confirmed_net", v.every((x) => x.reconciled_at === null && x.reconciled_by_user_id === null && x.confirmed_net === null), j(v.map((x) => [x.reconciled_at, x.reconciled_by_user_id, x.confirmed_net])));
  check("voltam ao dia e ao valor previstos", v.every((x) => x.effective_on.toISOString().slice(0, 10) === futuro && cent(x.effective_net) === 10000));
  check("o saldo volta ao de antes", (await saldo(A, c.conta)) === s0, `${(await saldo(A, c.conta)) - s0}`);
  const r = await aReceber(A.tok.owner);
  check("voltam a aparecer a receber como previstas", [p1.id, p2.id].every((id) => cartoesDe(r).find((x) => x.id === id)?.status === "prevista"), j([p1.id, p2.id].map((id) => cartoesDe(r).find((x) => x.id === id)?.status)));
  const rb = await An.anteciparAction(A.db, A.owner, { receivable_ids: [p1.id, p2.id], operated_on: meioDia(hojeStr), received_net: 192 });
  check("antecipar de novo depois de desfeita: ok e nascem conferidas de novo", rb.ok && !!(await lerParcela(p1.id)).reconciled_at && cent((await lerParcela(p1.id)).confirmed_net) === cent((await lerParcela(p1.id)).effective_net), j(rb).slice(0, 200));
}

// ---------------------------------------------------------------------------
// Seção 8: venda cancelada, parcela cancelada
// ---------------------------------------------------------------------------

async function cancelarVenda(w: Mundo, p: Parcela): Promise<Resp> {
  return chamar(w.tok.owner, R.cancel, "POST", `emporio/sales/${p.sale_id}/cancel`, { reason: "Erro de digitação", cash_register_id: w.reg[p.loja] }, p.sale_id);
}

async function secao8() {
  secaoAtual = "8";
  console.log("\n8. Venda cancelada e parcela cancelada ficam fora");
  const L1 = A.lojas[0];
  const c = await cen(A, "cancelada", [L1]);
  const on = emDias(-9);

  console.log("  (a) venda cancelada DEPOIS de conferida");
  const p = await parcela(A, c, { net: 100, on });
  const rc = await conf(A, A.tok.fin, p.id, 96);
  check("preparação: conferida com 4,00 a menos", ok2xx(rc), `${rc.status}`);
  const rv = await cancelarVenda(A, p);
  check("cancelar a venda: 2xx", ok2xx(rv), `${rv.status} ${j(rv.corpo).slice(0, 200)}`);
  // A parcela que já caiu segue viva e o estorno_cartao a compensa no saldo (cancelamento de antes desta frente);
  // a spec só pede que ela saia dos estados.
  const r = await aReceber(A.tok.owner);
  check("a parcela cancelada some dos estados (A receber)", cartoesDe(r).find((x) => x.id === p.id) === undefined);
  const aj = await ajustesDe([p.id]);
  console.log(`  (informativo: o ajuste da conferida cancelada ${aj.length === 1 ? "ficou" : "foi apagado"} no extrato: ${j(aj.map((m) => [m.direction, m.amount]))})`);

  console.log("  (b) venda cancelada ANTES de conferir: sai das contagens e não se confere");
  const q = await parcela(A, c, { net: 50, on });
  const antes = dados(await hojeFin(A.tok.owner));
  const rv2 = await cancelarVenda(A, q);
  check("cancelar a venda da parcela atrasada: 2xx", ok2xx(rv2), `${rv2.status} ${j(rv2.corpo).slice(0, 200)}`);
  const depois = dados(await hojeFin(A.tok.owner));
  check("Atrasadas do Hoje cai 1 parcela e 50,00", antes?.cards_overdue?.count - depois?.cards_overdue?.count === 1 && perto(antes?.cards_overdue?.total - depois?.cards_overdue?.total, 50), j([antes?.cards_overdue, depois?.cards_overdue]));
  const rcq = await conf(A, A.tok.fin, q.id, 50);
  check("conferir a parcela cancelada: recusa 4xx (404, 409 ou 422)", [404, 409, 422].includes(rcq.status), `${rcq.status} ${j(rcq.corpo).slice(0, 160)}`);
  check("e nada é gravado: sem carimbo e sem ajuste", (await lerParcela(q.id)).reconciled_at === null && (await ajustesDe([q.id])).length === 0);

  console.log("  (c) parcela cancelada direto no banco fica fora do lote do dia");
  const cd = await cen(A, "cancelada dia", [L1]);
  const Dd = emDias(-2);
  const k1 = await parcela(A, cd, { net: 100, on: Dd });
  const k2 = await parcela(A, cd, { net: 100, on: Dd, canceled: true });
  const rd = await confDia(A.tok.fin, { conta: cd.conta, aq: cd.aq[0] }, Dd, 100);
  check("o lote confere só a viva: 100 previstos, 100 caíram, 2xx", ok2xx(rd), `${rd.status} ${j(rd.corpo).slice(0, 200)}`);
  check("a cancelada fica sem carimbo e sem ajuste", !!(await lerParcela(k1.id)).reconciled_at && (await lerParcela(k2.id)).reconciled_at === null && (await ajustesDe([k1.id, k2.id])).length === 0);
}

// ---------------------------------------------------------------------------
// Seção 9: o Vencido e o Hoje
// ---------------------------------------------------------------------------

async function secao9() {
  secaoAtual = "9";
  console.log("\n9. A faixa do A receber (Vencido) e o Hoje do Financeiro, por diferença");
  const L1 = A.lojas[0];
  const c = await cen(A, "vencido", [L1]);
  const r0 = await aReceber(A.tok.owner);
  const h0 = dados(await hojeFin(A.tok.owner));
  const ov0 = r0.corpo?.data?.summary?.overdue;
  check("o Hoje devolve cards_to_confirm e cards_overdue com count e total", typeof h0?.cards_to_confirm?.count === "number" && typeof h0?.cards_to_confirm?.total === "number" && typeof h0?.cards_overdue?.count === "number" && typeof h0?.cards_overdue?.total === "number", j([h0?.cards_to_confirm, h0?.cards_overdue]));
  if (typeof ov0?.count !== "number" || typeof h0?.cards_overdue?.count !== "number") {
    check("a leitura de base do A receber e do Hoje funcionou", false, j([ov0, h0?.cards_overdue]));
    return;
  }
  const hoje = await parcela(A, c, { net: 50, on: hojeStr });
  const velha1 = await parcela(A, c, { net: 70, on: emDias(-10) });
  const velha2 = await parcela(A, c, { net: 30, on: emDias(-12) });
  const futura = await parcela(A, c, { net: 90, on: emDias(3) });
  await parcela(A, c, { net: 1000, on: emDias(-11), canceled: true });
  const conferidaVelha = await parcela(A, c, { net: 110, on: emDias(-11) });
  const rcv = await conf(A, A.tok.fin, conferidaVelha.id, 110);
  check("preparação: uma velha conferida", ok2xx(rcv), `${rcv.status}`);

  const r1 = await aReceber(A.tok.owner);
  const ov1 = r1.corpo?.data?.summary?.overdue;
  check("o Vencido do A receber soma as duas atrasadas: mais 2 itens e mais 100,00", ov1?.count - ov0.count === 2 && perto(ov1?.total - ov0.total, 100), j([ov0, ov1]));
  check("a de hoje, a futura, a cancelada e a conferida não entram no Vencido", ov1?.count - ov0.count === 2);
  const cards = cartoesDe(r1);
  check("as duas atrasadas estão na lista com status atrasada", [velha1, velha2].every((p) => cards.find((x) => x.id === p.id)?.status === "atrasada"));
  check("a de hoje é a_conferir e a futura é prevista", cards.find((x) => x.id === hoje.id)?.status === "a_conferir" && cards.find((x) => x.id === futura.id)?.status === "prevista");
  const h1 = dados(await hojeFin(A.tok.owner));
  check("Hoje, Atrasadas: mais 2 parcelas e mais 100,00", h1?.cards_overdue?.count - h0.cards_overdue.count === 2 && perto(h1?.cards_overdue?.total - h0.cards_overdue.total, 100), j([h0.cards_overdue, h1?.cards_overdue]));
  check("Hoje, Cartão a conferir: mais 1 parcela e mais 50,00 (só a de hoje, estados disjuntos)", h1?.cards_to_confirm?.count - h0.cards_to_confirm.count === 1 && perto(h1?.cards_to_confirm?.total - h0.cards_to_confirm.total, 50), j([h0.cards_to_confirm, h1?.cards_to_confirm]));

  const rc = await conf(A, A.tok.fin, velha1.id, 70);
  check("conferir uma das atrasadas: 2xx", ok2xx(rc), `${rc.status}`);
  const r2 = await aReceber(A.tok.owner);
  check("o Vencido cai a parcela conferida: agora mais 1 item e mais 30,00", r2.corpo?.data?.summary?.overdue?.count - ov0.count === 1 && perto(r2.corpo?.data?.summary?.overdue?.total - ov0.total, 30), j([ov0, r2.corpo?.data?.summary?.overdue]));
  const h2 = dados(await hojeFin(A.tok.owner));
  check("Hoje, Atrasadas cai junto: mais 1 parcela e mais 30,00", h2?.cards_overdue?.count - h0.cards_overdue.count === 1 && perto(h2?.cards_overdue?.total - h0.cards_overdue.total, 30), j(h2?.cards_overdue));
  const rf = await confDia(A.tok.fin, { conta: c.conta, aq: c.aq[0] }, emDias(-12), 30);
  check("conferir o dia da outra atrasada: 2xx e some das Atrasadas", ok2xx(rf) && (dados(await hojeFin(A.tok.owner))?.cards_overdue?.count ?? -1) === h0.cards_overdue.count, `${rf.status}`);
}

// ---------------------------------------------------------------------------
// Seção 10: o carimbo do extrato
// ---------------------------------------------------------------------------

async function secao10() {
  secaoAtual = "10";
  console.log("\n10. O carimbo do extrato é a conferência (Q352) e o extrato mostra o ajuste");
  const L1 = A.lojas[0];
  const c = await cen(A, "carimbo", [L1]);
  const on = emDias(-2);
  const carimbar = (tok: string, kind: string, id: string, extra: Dado = {}) => chamar(tok, R.reconcile, "POST", "emporio/finance/statement/reconcile", { kind, id, ...extra });
  const descarimbar = (tok: string, kind: string, id: string) => chamar(tok, R.reconcile, "DELETE", "emporio/finance/statement/reconcile", { kind, id });

  console.log("  (a) carimbar a linha de cartão sem valor: confere pelo previsto");
  const p1 = await parcela(A, c, { net: 80, on });
  const s0 = await saldo(A, c.conta);
  const r1 = await carimbar(A.tok.fin, "cartao", p1.id);
  check("carimbar: 2xx", ok2xx(r1), `${r1.status} ${j(r1.corpo).slice(0, 200)}`);
  const d1 = await lerParcela(p1.id);
  check("a parcela fica conferida pelo previsto: confirmed_net 80,00, carimbo e quem carimbou", !!d1.reconciled_at && d1.reconciled_by_user_id === A.fin.id && perto(n(d1.confirmed_net), 80), j(d1));
  check("sem ajuste e sem mexer no saldo", (await ajustesDe([p1.id])).length === 0 && (await saldo(A, c.conta)) === s0);
  const r1b = await carimbar(A.tok.fin, "cartao", p1.id);
  check("carimbar de novo: 409", recusou(r1b, 409), `${r1b.status} ${j(r1b.corpo).slice(0, 160)}`);
  const l0 = await logs(A);
  const x1 = await descarimbar(A.tok.fin, "cartao", p1.id);
  check("tirar o carimbo da linha de cartão: 2xx", ok2xx(x1), `${x1.status} ${j(x1.corpo).slice(0, 200)}`);
  const e1 = await lerParcela(p1.id);
  check("é o desfazer: sem carimbo, sem quem carimbou e sem confirmed_net", e1.reconciled_at === null && e1.reconciled_by_user_id === null && e1.confirmed_net === null, j(e1));
  check("o desfazer pelo carimbo vai para o Histórico, com o motivo padrão", (await logs(A)) > l0 && j(await (await prismaCru()).emporioAuditLog.findMany({ where: { tenant_id: A.tenantId }, orderBy: { created_at: "desc" }, take: 4 })).includes("Carimbo retirado no extrato"));
  const x1b = await descarimbar(A.tok.fin, "cartao", p1.id);
  check("tirar o carimbo de novo: 409", recusou(x1b, 409), `${x1b.status} ${j(x1b.corpo).slice(0, 160)}`);

  console.log("  (b) carimbar com received_amount: confere com valor e gera ajuste");
  const p2 = await parcela(A, c, { net: 80, on });
  const s2 = await saldo(A, c.conta);
  const r2 = await carimbar(A.tok.fin, "cartao", p2.id, { received_amount: 70 });
  check("carimbar com received_amount 70,00: 2xx", ok2xx(r2), `${r2.status} ${j(r2.corpo).slice(0, 200)}`);
  const d2 = await lerParcela(p2.id);
  const a2 = await ajustesDe([p2.id]);
  check("confirmed_net 70,00 e ajuste de saída de 10,00", perto(n(d2.confirmed_net), 70) && a2.length === 1 && a2[0].direction === "saida" && cent(a2[0].amount) === 1000, j([d2.confirmed_net, a2.map((m) => [m.direction, m.amount])]));
  check("o saldo cai 10,00", (await saldo(A, c.conta)) - s2 === -1000);

  console.log("  (c) o extrato: a linha de cartão conferida e a linha do ajuste");
  const de = emDias(-12);
  const ext = await chamar(A.tok.fin, R.statement, "GET", `emporio/finance/statement?bank_account_id=${c.conta}&de=${de}&ate=${hojeStr}`);
  check("o extrato da conta: 200", ext.status === 200, `${ext.status} ${j(ext.corpo).slice(0, 200)}`);
  const linhas = (ext.corpo?.data?.lines ?? []) as Dado[];
  const iCart = linhas.findIndex((l) => l.kind === "cartao" && l.id === p2.id);
  const iAj = a2.length === 1 ? linhas.findIndex((l) => l.kind === "movimento" && l.id === a2[0].id) : -1;
  const lc = linhas[iCart];
  check("a linha de cartão conferida mostra o valor conferido (70,00)", !!lc && (perto(n(lc.amount), 70) || perto(n(lc.confirmed_net), 70)), j(lc));
  check("a linha de cartão vem com o carimbo preenchido", !!lc?.reconciled_at, j(lc));
  const la = linhas[iAj];
  check("a linha do ajuste existe: movimento de saída de 10,00", !!la && la.direction === "saida" && perto(n(la.amount), 10), j(la));
  check("a linha do ajuste leva o rótulo 'Ajuste da conferência do cartão'", !!la && j(la).includes("Ajuste da conferência do cartão"), j(la));
  check("a linha do ajuste fica logo abaixo da linha de cartão", iCart >= 0 && iAj >= 0 && Math.abs(iAj - iCart) === 1, `cartão na posição ${iCart}, ajuste na ${iAj}`);

  console.log("  (d) a linha do ajuste nasce carimbada por quem conferiu (não vira pendência no extrato)");
  check("a linha do ajuste vem com o carimbo preenchido no extrato", !!la?.reconciled_at, j(la));
  const mov = await (await prismaCru()).cashMovement.findUnique({ where: { id: a2[0]?.id ?? "x" } });
  check("o movimento do ajuste tem reconciled_at e quem carimbou é quem conferiu", !!mov?.reconciled_at && mov?.reconciled_by_user_id === A.fin.id, j([mov?.reconciled_at, mov?.reconciled_by_user_id]));
  const rm = await carimbar(A.tok.fin, "movimento", a2[0]?.id ?? "x");
  check("carimbar de novo a linha do ajuste: 409, e a parcela segue como estava", recusou(rm, 409) && perto(n((await lerParcela(p2.id)).confirmed_net), 70), `${rm.status} ${j(rm.corpo).slice(0, 200)}`);
  const rm2 = await descarimbar(A.tok.fin, "movimento", a2[0]?.id ?? "x");
  check("tirar o carimbo do movimento: 2xx, sem desfazer a conferência da parcela", ok2xx(rm2) && !!(await lerParcela(p2.id)).reconciled_at && (await ajustesDe([p2.id])).length === 1, `${rm2.status}`);
  const x2 = await descarimbar(A.tok.fin, "cartao", p2.id);
  check("tirar o carimbo da linha de cartão com ajuste: o ajuste some e o saldo volta", ok2xx(x2) && (await ajustesDe([p2.id])).length === 0 && (await saldo(A, c.conta)) === s2, `${x2.status} ${(await saldo(A, c.conta)) - s2}`);
}

// ---------------------------------------------------------------------------
// Seção 11: permissão
// ---------------------------------------------------------------------------

async function secao11() {
  secaoAtual = "11";
  console.log("\n11. Quem não tem `dinheiro` leva 403");
  const L1 = A.lojas[0];
  const c = await cen(A, "permissao", [L1]);
  const D = emDias(-2);
  const p = await parcela(A, c, { net: 100, on: D });
  const q = await parcela(A, c, { net: 100, on: D, aq: 1 });
  const feita = await parcela(A, c, { net: 60, on: D });
  const rf = await conf(A, A.tok.fin, feita.id, 55);
  check("preparação: uma conferida pelo Financeiro", ok2xx(rf), `${rf.status}`);
  const aj0 = (await ajustesDe([p.id, q.id, feita.id])).length;
  for (const [quem, tok] of [["o Gestor da loja", A.tok.gestor], ["o Vendedor", A.tok.vend]] as const) {
    const r1 = await conf(A, tok, p.id, 90);
    check(`${quem} não confere uma parcela: 403`, r1.status === 403, `${r1.status} ${j(r1.corpo).slice(0, 160)}`);
    const r2 = await confDia(tok, { conta: c.conta, aq: c.aq[1] }, D, 90);
    check(`${quem} não confere o dia: 403`, r2.status === 403, `${r2.status} ${j(r2.corpo).slice(0, 160)}`);
    const r3 = await desf(tok, feita.id, "Quero desfazer");
    check(`${quem} não desfaz: 403`, r3.status === 403, `${r3.status} ${j(r3.corpo).slice(0, 160)}`);
    const r4 = await chamar(tok, R.reconcile, "POST", "emporio/finance/statement/reconcile", { kind: "cartao", id: p.id });
    check(`${quem} não carimba a linha de cartão: 403`, r4.status === 403, `${r4.status} ${j(r4.corpo).slice(0, 160)}`);
  }
  check("nada foi gravado pelas recusas", !(await lerParcela(p.id)).reconciled_at && !(await lerParcela(q.id)).reconciled_at && !!(await lerParcela(feita.id)).reconciled_at && (await ajustesDe([p.id, q.id, feita.id])).length === aj0);
  const sem = await chamar("token-que-nao-existe", R.confirm, "POST", "emporio/finance/card-receivables/x/confirm", { received_amount: 1 }, p.id);
  check("sem sessão válida: 401", sem.status === 401, `${sem.status} ${j(sem.corpo).slice(0, 160)}`);
  const ok = await conf(A, A.tok.owner, p.id, 100);
  check("o Dono confere (Dono, Gerente geral e Financeiro têm `dinheiro`)", ok2xx(ok), `${ok.status}`);
}

// ---------------------------------------------------------------------------
// Seção 12: isolamento
// ---------------------------------------------------------------------------

async function secao12() {
  secaoAtual = "12";
  console.log("\n12. Isolamento entre contas bancárias, adquirentes, lojas e contas do sistema");
  const dia = X.dia as Dado;
  if (!dia) {
    check("a seção 4 deixou o recorte de referência", false);
    return;
  }
  const L1 = A.lojas[0];
  const c = await cen(A, "isolamento", [L1]);
  const o = await cen(A, "isolamento outra", [L1]);
  const D = emDias(-2);
  const pc = await parcela(A, c, { net: 100, on: D });
  const po = await parcela(A, o, { net: 100, on: D });
  const sOutra = await saldo(A, o.conta);
  const r = await confDia(A.tok.fin, { conta: c.conta, aq: c.aq[0] }, D, 90);
  check("conferir o dia de uma conta: 2xx", ok2xx(r), `${r.status}`);
  check("a outra conta, na mesma loja e no mesmo dia, não é tocada: sem carimbo, sem ajuste, saldo igual", !(await lerParcela(po.id)).reconciled_at && (await ajustesDe([po.id])).length === 0 && (await saldo(A, o.conta)) === sOutra);
  check("o ajuste caiu na conta da parcela conferida, não na outra", (await ajustesDe([pc.id])).every((m) => m.bank_account_id === c.conta));
  const cruzada = await confDia(A.tok.fin, { conta: o.conta, aq: c.aq[1] }, D, 10);
  check("adquirente de uma conta com a conta de outra: 409 (recorte vazio), nada gravado", cruzada.status === 409 && !(await lerParcela(po.id)).reconciled_at, `${cruzada.status} ${j(cruzada.corpo).slice(0, 160)}`);

  console.log("  (b) outra conta do sistema (tenant B)");
  const cb = await cen(B, "isolamento B", [B.lojas[0]], 1);
  const pb = await parcela(B, cb, { net: 100, on: D });
  const livre = await parcela(A, c, { net: 100, on: D, aq: 1 });
  const rb1 = await conf(B, B.tok.owner, livre.id, 100);
  check("B confere a parcela de A: 404", rb1.status === 404, `${rb1.status} ${j(rb1.corpo).slice(0, 160)}`);
  const rb2 = await confDia(B.tok.owner, { conta: c.conta, aq: c.aq[1] }, D, 100);
  check("B confere o dia da conta e da adquirente de A: recusa 4xx", rb2.status >= 400 && rb2.status < 500, `${rb2.status} ${j(rb2.corpo).slice(0, 160)}`);
  const rb3 = await desf(B.tok.owner, pc.id, "Tentando desfazer a conferência de A");
  check("B desfaz a conferência de A: 404", rb3.status === 404, `${rb3.status} ${j(rb3.corpo).slice(0, 160)}`);
  const rb4 = await chamar(B.tok.owner, R.reconcile, "POST", "emporio/finance/statement/reconcile", { kind: "cartao", id: livre.id });
  check("B carimba a linha de cartão de A: 404", rb4.status === 404, `${rb4.status} ${j(rb4.corpo).slice(0, 160)}`);
  check("nada de A mudou: a de B-sobre-A segue aberta e a conferência de A segue de pé", !(await lerParcela(livre.id)).reconciled_at && !!(await lerParcela(pc.id)).reconciled_at && (await ajustesDe([pc.id])).length === 1);
  const lb = await aReceber(B.tok.owner);
  check("o A receber de B só lista as parcelas de B", cartoesDe(lb).some((x) => x.id === pb.id) && !cartoesDe(lb).some((x) => x.id === pc.id || x.id === livre.id), j(cartoesDe(lb).map((x) => x.id)));
  const rbo = await conf(B, B.tok.owner, pb.id, 100);
  check("B confere a própria parcela normalmente", ok2xx(rbo), `${rbo.status}`);
  const mA = await ajustesDe([pb.id]);
  check("o que B grava não aparece como ajuste de A", mA.every((m) => m.tenant_id === B.tenantId));
  const he = dados(await hojeFin(B.tok.owner));
  check("o Hoje de B não conta as parcelas de A", (he?.cards_overdue?.count ?? 99) <= 1 && (he?.cards_to_confirm?.count ?? 99) <= 1, j([he?.cards_overdue, he?.cards_to_confirm]));
}

// ---------------------------------------------------------------------------
// Seção 13: recusas
// ---------------------------------------------------------------------------

async function secao13() {
  secaoAtual = "13";
  console.log("\n13. Recusas 422 com field");
  const L1 = A.lojas[0];
  const c = await cen(A, "recusas", [L1], 1);
  const D = emDias(-2);
  const p = await parcela(A, c, { net: 100, on: D });
  const quantas = async () => (await ajustesDe([p.id])).length + ((await lerParcela(p.id)).reconciled_at ? 1 : 0);

  const sem = await chamar(A.tok.fin, R.confirm, "POST", "x", {}, p.id);
  check("conferir sem received_amount: 422 em received_amount", recusou(sem, 422, "received_amount"), `${sem.status} ${j(sem.corpo).slice(0, 200)}`);
  const neg = await conf(A, A.tok.fin, p.id, -5);
  check("received_amount negativo: 422 em received_amount", recusou(neg, 422, "received_amount"), `${neg.status} ${j(neg.corpo).slice(0, 200)}`);
  const txt = await conf(A, A.tok.fin, p.id, "banana");
  check("received_amount texto: 422 em received_amount", recusou(txt, 422, "received_amount"), `${txt.status} ${j(txt.corpo).slice(0, 200)}`);
  const longa = await conf(A, A.tok.fin, p.id, 100, { notes: "x".repeat(5000) });
  check("notes gigante: 422 em notes", recusou(longa, 422, "notes"), `${longa.status} ${j(longa.corpo).slice(0, 200)}`);
  const inex = await conf(A, A.tok.fin, "m121-nao-existe", 100);
  check("parcela inexistente: 404", inex.status === 404, `${inex.status} ${j(inex.corpo).slice(0, 160)}`);
  check("nenhuma das recusas gravou", (await quantas()) === 0);
  check("a mensagem de recusa vem em português, sem inglês do Zod", [sem, neg, txt].every((r) => !/expected|Invalid|Too small|Required/i.test(j(r.corpo?.error?.message ?? ""))), j([sem.corpo?.error?.message, neg.corpo?.error?.message]));

  const dia = (corpo: Dado) => chamar(A.tok.fin, R.confirmDay, "POST", "emporio/finance/card-receivables/confirm-day", corpo);
  const base = { bank_account_id: c.conta, acquirer_id: c.aq[0], effective_on: D, received_total: 100 };
  const sc = await dia({ ...base, bank_account_id: undefined });
  check("dia sem bank_account_id: 422 em bank_account_id", recusou(sc, 422, "bank_account_id"), `${sc.status} ${j(sc.corpo).slice(0, 200)}`);
  const sa = await dia({ ...base, acquirer_id: undefined });
  check("dia sem acquirer_id: 422 em acquirer_id", recusou(sa, 422, "acquirer_id"), `${sa.status} ${j(sa.corpo).slice(0, 200)}`);
  const sd = await dia({ ...base, effective_on: "banana" });
  check("dia com effective_on inválido: 422 em effective_on", recusou(sd, 422, "effective_on"), `${sd.status} ${j(sd.corpo).slice(0, 200)}`);
  const sd2 = await dia({ ...base, effective_on: "2026-02-31" });
  check("dia com data impossível (2026-02-31): 422 em effective_on", recusou(sd2, 422, "effective_on"), `${sd2.status} ${j(sd2.corpo).slice(0, 200)}`);
  const st = await dia({ ...base, received_total: undefined });
  check("dia sem received_total: 422 em received_total", recusou(st, 422, "received_total"), `${st.status} ${j(st.corpo).slice(0, 200)}`);
  const sn = await dia({ ...base, received_total: -1 });
  check("dia com received_total negativo: 422 em received_total", recusou(sn, 422, "received_total"), `${sn.status} ${j(sn.corpo).slice(0, 200)}`);
  check("nenhuma recusa do dia gravou", (await quantas()) === 0);
}

// ---------------------------------------------------------------------------
// Seção 14: correções do juiz (loja no Conferir o dia, conferidas recentes na lista, migração Q353)
// ---------------------------------------------------------------------------

async function secao14() {
  secaoAtual = "14";
  console.log("\n14. Conferir o dia de uma loja, conferidas recentes no A receber e a migração Q353");
  const [L1, L2] = A.lojas;

  console.log("  (a) com establishment_id, o dia confere só as parcelas daquela loja");
  const c = await cen(A, "loja do dia", [L1, L2], 1);
  const D = emDias(-2);
  const p1 = await parcela(A, c, { net: 100, on: D, loja: L1 });
  const p2 = await parcela(A, c, { net: 100, on: D, loja: L2 });
  const s0 = await saldo(A, c.conta);
  const r = await confDia(A.tok.fin, { conta: c.conta, aq: c.aq[0] }, D, 90, { establishment_id: L1 });
  check("conferir o dia da loja 1: 2xx, previsto 100,00 (só a parcela da loja 1)", ok2xx(r) && perto(dados(r)?.expected_total, 100) && dados(r)?.receivables?.length === 1, `${r.status} ${j(r.corpo).slice(0, 240)}`);
  check("a parcela da loja 1 fica conferida com 90,00", perto(n((await lerParcela(p1.id)).confirmed_net), 90));
  check("a parcela da loja 2, no mesmo recorte, não é tocada", !(await lerParcela(p2.id)).reconciled_at && (await ajustesDe([p2.id])).length === 0);
  check("o saldo cai só os 10,00 da loja 1", (await saldo(A, c.conta)) - s0 === -1000);
  const outra = await confDia(A.tok.fin, { conta: c.conta, aq: c.aq[0] }, D, 100, { establishment_id: B.lojas[0] });
  check("loja de outra conta do sistema: 404 em establishment_id, nada gravado", recusou(outra, 404, "establishment_id") && !(await lerParcela(p2.id)).reconciled_at, `${outra.status} ${j(outra.corpo).slice(0, 200)}`);
  const vazia = await confDia(A.tok.fin, { conta: c.conta, aq: c.aq[0] }, D, 100, { establishment_id: L1 });
  check("a loja 1 de novo: 409 (nada a conferir), a loja 2 segue aberta", vazia.status === 409 && !(await lerParcela(p2.id)).reconciled_at, `${vazia.status}`);
  const resto = await confDia(A.tok.fin, { conta: c.conta, aq: c.aq[0] }, D, 100);
  check("sem establishment_id, confere o resto do recorte (a loja 2)", ok2xx(resto) && !!(await lerParcela(p2.id)).reconciled_at, `${resto.status}`);

  console.log("  (b) a conferida dos últimos 7 dias segue no A receber, para o Desfazer");
  const c2 = await cen(A, "lista", [L1], 1);
  const recente = await parcela(A, c2, { net: 50, on: emDias(-3) });
  const antiga = await parcela(A, c2, { net: 50, on: emDias(-9) });
  const r1 = await conf(A, A.tok.fin, recente.id, 50);
  const r2 = await conf(A, A.tok.fin, antiga.id, 50);
  check("preparação: as duas conferidas", ok2xx(r1) && ok2xx(r2), `${r1.status} ${r2.status}`);
  const lista = cartoesDe(await aReceber(A.tok.fin));
  const lr = lista.find((x) => x.id === recente.id);
  check("a conferida de 3 dias atrás aparece, com o estado Conferida", lr?.status === "conferida", j(lr));
  check("a conferida de 9 dias atrás não aparece", !lista.some((x) => x.id === antiga.id));

  console.log("  (c) a migração Q353, numa transação desfeita no fim");
  const c3 = await cen(A, "migracao", [L1], 1);
  const m8 = await parcela(A, c3, { net: 30, on: emDias(-8) });
  const m7 = await parcela(A, c3, { net: 30, on: emDias(-7) });
  const m6 = await parcela(A, c3, { net: 30, on: emDias(-6) });
  const mc = await parcela(A, c3, { net: 30, on: emDias(-20), canceled: true });
  const ms = await parcela(A, c3, { net: 30, on: emDias(-4) });
  const P = await prismaCru();
  await P.cardReceivable.update({ where: { id: ms.id }, data: { reconciled_at: new Date(), reconciled_by_user_id: A.fin.id } });
  // Uma antecipação pontual de antes da frente B: a parcela sem carimbo, com data de 10 dias atrás.
  const An = await import("@/lib/actions/emporio-antecipacao");
  const ma = await parcela(A, c3, { net: 30, on: emDias(3) });
  const op = await An.anteciparAction(A.db, A.owner, { receivable_ids: [ma.id], operated_on: meioDia(hojeStr), received_net: 29 });
  check("preparação: a antecipação pontual", op.ok, j(op).slice(0, 200));
  const opId = op.ok ? ((op.data as Dado).id as string) : "x";
  await P.cardReceivable.update({ where: { id: ma.id }, data: { reconciled_at: null, reconciled_by_user_id: null, confirmed_net: null, effective_on: dUTC(emDias(-10)) } });
  const opRow = await P.cardAnticipation.findUnique({ where: { id: opId } });
  const fs = await import("node:fs");
  const path = await import("node:path");
  const sql = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20261117200000_emporio_conferir_cartao/migration.sql"), "utf8");
  const updates = sql
    .split(";")
    .map((s: string) => s.split("\n").filter((l: string) => !l.trim().startsWith("--")).join("\n").trim())
    .filter((s: string) => s.startsWith("UPDATE"));
  check("a migração tem os três UPDATE da Q353", updates.length === 3, String(updates.length));
  const ids = [m8.id, m7.id, m6.id, mc.id, ms.id, ma.id];
  let lidas: Dado[] = [];
  const DESFAZ = "m121-desfaz-a-migracao";
  try {
    await P.$transaction(async (tx: Dado) => {
      for (const u of updates) await tx.$executeRawUnsafe(u);
      lidas = await tx.cardReceivable.findMany({ where: { id: { in: ids } } });
      throw new Error(DESFAZ);
    });
  } catch (e) {
    if (!String(e).includes(DESFAZ)) throw e;
  }
  const de = (id: string) => lidas.find((x) => x.id === id);
  check("8 dias atrás: nasce conferida pelo previsto, sem autor", !!de(m8.id)?.reconciled_at && de(m8.id)?.reconciled_by_user_id === null && perto(n(de(m8.id)?.confirmed_net), 30), j(de(m8.id)));
  check("7 dias atrás: fica para conferir", de(m7.id)?.reconciled_at === null && de(m7.id)?.confirmed_net === null, j(de(m7.id)));
  check("6 dias atrás: fica para conferir", de(m6.id)?.reconciled_at === null, j(de(m6.id)));
  check("a cancelada fica fora", de(mc.id)?.reconciled_at === null && de(mc.id)?.confirmed_net === null, j(de(mc.id)));
  check("a já carimbada ganha confirmed_net = previsto e segue com o autor", perto(n(de(ms.id)?.confirmed_net), 30) && de(ms.id)?.reconciled_by_user_id === A.fin.id, j(de(ms.id)));
  const da = de(ma.id);
  check("a antecipação pontual antiga ganha o carimbo da operação (created_at) e o autor dela, não o now() da migração", !!da?.reconciled_at && !!opRow && new Date(da.reconciled_at).getTime() === new Date(opRow.created_at).getTime() && da.reconciled_by_user_id === opRow.created_by_user_id && perto(n(da.confirmed_net), n(da.effective_net)), j([da?.reconciled_at, opRow?.created_at, da?.reconciled_by_user_id]));
  check("a transação foi desfeita: a de 8 dias segue sem carimbo no banco", (await lerParcela(m8.id)).reconciled_at === null);
  // Com o carimbo da operação, o desfazer da antecipação reconhece a conferência como dela.
  await P.cardReceivable.update({ where: { id: ma.id }, data: { reconciled_at: opRow?.created_at ?? new Date(), reconciled_by_user_id: opRow?.created_by_user_id ?? null } });
  const rx = await An.desfazerAntecipacaoAction(A.db, A.owner, opId);
  check("e a antecipação com o carimbo que a migração dá se desfaz", rx.ok, j(rx).slice(0, 200));
}

// ---------------------------------------------------------------------------
// Limpeza e main
// ---------------------------------------------------------------------------

async function limpar() {
  if (tenantIds.length === 0) return;
  secaoAtual = "limpeza";
  const { prisma } = await import("@/lib/prisma");
  for (const id of tenantIds) {
    await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
  }
  const modelos = [
    "emporioBoleto", "fixedExpenseOccurrence", "fixedExpenseSplit", "fixedExpenseTemplate", "variableExpenseRule",
    "emporioPaymentRequest", "emporioCreditRelease", "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "cardReceivable", "cardAnticipation", "cardFeeRate", "cardAcquirer", "emporioSalePayment", "emporioSaleReturnItem",
    "stockMovement", "emporioSaleItem", "emporioSaleReturn", "emporioCheck", "emporioQuoteItem", "emporioQuote", "emporioSale", "emporioPurchaseItem",
    "emporioPurchase", "financialPayment", "financialEntry", "emporioCreditAgreement", "emporioCustomer", "emporioSupplier", "cashHandover", "cashSession", "cashRegister", "emporioCounter",
    "emporioSettings", "userEstablishment", "establishment", "bankAccount", "contact", "user", "tenantProfile", "tenantFeature",
  ];
  // duas passadas: as referências cruzadas podem deixar sobra na ordem de uma só
  for (let passada = 0; passada < 2; passada += 1) {
    for (const id of tenantIds) {
      for (const m of modelos) {
        try {
          await (prisma as Dado)[m]?.deleteMany({ where: { tenant_id: id } });
        } catch {
          // modelo ausente nesta versão do schema, ou referência que a próxima passada resolve: segue
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
    await rodar("1 pura", secao1Pura);
    await comBanco(async () => {
      await rodar("montagem", async () => {
        secaoAtual = "montagem";
        A = await montar("A");
        B = await montar("B");
      });
      if (!A || !B) {
        check("a montagem dos tenants terminou (sem ela as seções 2 a 13 não rodam)", false);
        return;
      }
      await rodar("2", secao2);
      await rodar("3", secao3);
      await rodar("4", secao4);
      await rodar("5", secao5);
      await rodar("6", secao6);
      await rodar("7", secao7);
      await rodar("8", secao8);
      await rodar("9", secao9);
      await rodar("10", secao10);
      await rodar("11", secao11);
      await rodar("12", secao12);
      await rodar("13", secao13);
      await rodar("14", secao14);
    });
  } finally {
    await limpar();
  }
  console.log("\nChecagens por seção:");
  for (const [s, c] of Object.entries(contagem)) console.log(`  seção ${s}: ${c.ok + c.falhas} (${c.ok} verdes, ${c.falhas} vermelhas)`);
  const total = Object.values(contagem).reduce((s, c) => s + c.ok + c.falhas, 0);
  console.log(falhas === 0 ? `\n✅ M121 verde (${total} checagens)` : `\n❌ M121: ${falhas} falha(s) em ${total} checagens`);
  // As rotas de token deixam o Redis aberto: o processo não encerra sozinho.
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
