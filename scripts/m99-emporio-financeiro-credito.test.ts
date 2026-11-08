import "./_env-local";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * M99: Módulo 39 (Meu Empório), financeiro das lojas, entrega 2: crédito e cobrança do fiado.
 * Roda: `npm run test:m99`
 *
 * Escrita da spec (2026-11-07, "Entrega 2") e do plano (2026-11-08), sem ler a implementação.
 *
 * Seção 1: as funções puras (prazo, vencimento efetivo, atraso, mensagem, telefone). Sem banco.
 * Seção 2: as configurações do fiado (prazo, dias de bloqueio, limite padrão, mensagem).
 * Seção 3: o vencimento (venda > cliente > conta) e o fiado antigo sem data lido na hora.
 * Seção 4: o bloqueio por atraso e o limite de crédito.
 * Seção 5: a liberação pontual do gestor.
 * Seção 6: a lista de cobrança e o registro de "cobrar".
 * Seção 7: isolamento entre tenants.
 *
 * Fixtures: as vendas de preparação passam pela `venderAction` (como a m98); o que está sob prova
 * passa sempre pela ROTA. O fiado antigo "sem data" é ajustado por Prisma (é assim que está em produção).
 * A suíte nasce vermelha: as rotas e as regras das Tasks 3 e 4 ainda não existem.
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

console.log("🧾 M99: Módulo 39 (Meu Empório), financeiro das lojas, entrega 2: crédito e cobrança do fiado\n");

const tenantIds: string[] = [];
const SENHA = "SenhaForte#2026";
const DIA = 86_400_000;
const stamp = Date.now().toString(36);

const hojeStr = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const somaDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * DIA).toISOString().slice(0, 10);
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const diaDe = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
const perto = (a: unknown, b: number, tol = 0.011) => typeof a === "number" && !Number.isNaN(a) && Math.abs(a - b) < tol;
const n = (x: unknown) => Number(x);
const msgDe = (x: unknown): string => String((x as { message?: string })?.message ?? "");

const iso = (d: Date) => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Seção 1 (pura): as funções do fiado
// ---------------------------------------------------------------------------

async function secao1Pura() {
  console.log("Seção 1: as funções puras do fiado (sem banco)");
  const F: Dado = await import("@/lib/emporio/fiado");
  const T: Dado = await import("@/lib/emporio/telefone");
  const d = (s: string) => new Date(s);

  console.log("  base de dias");
  check("DIA_MS vale 86.400.000", F.DIA_MS === 86_400_000);
  check("diaUtc devolve a meia-noite UTC do dia", F.diaUtc(d("2026-11-08T15:30:00Z")) === Date.parse("2026-11-08T00:00:00Z"));
  check("somarDias soma na meia-noite UTC (2026-11-08 + 30 = 2026-12-08)", iso(F.somarDias(d("2026-11-08T15:00:00Z"), 30)) === "2026-12-08" && F.somarDias(d("2026-11-08T15:00:00Z"), 30).getTime() % 86_400_000 === 0);

  console.log("  dias de atraso");
  check("diasDeAtraso: vencido em 2026-10-20, hoje 2026-11-08: 19", F.diasDeAtraso(d("2026-10-20T00:00:00Z"), d("2026-11-08T00:00:00Z")) === 19);
  check("diasDeAtraso: vence amanhã: 0", F.diasDeAtraso(d("2026-11-09T00:00:00Z"), d("2026-11-08T00:00:00Z")) === 0);
  check("diasDeAtraso: vence hoje: 0 (ainda não venceu)", F.diasDeAtraso(d("2026-11-08T00:00:00Z"), d("2026-11-08T20:00:00Z")) === 0);
  check("diasDeAtraso conta por dia, não por hora (venceu ontem, 1 dia)", F.diasDeAtraso(d("2026-11-07T23:00:00Z"), d("2026-11-08T01:00:00Z")) === 1);

  console.log("  dia fixo do mês");
  check("proximoDiaDoMes(2026-02-10, 31) = 2026-02-28 (mês curto: o último dia)", iso(F.proximoDiaDoMes(d("2026-02-10T12:00:00Z"), 31)) === "2026-02-28");
  check("proximoDiaDoMes(2026-01-31, 31) = 2026-02-28", iso(F.proximoDiaDoMes(d("2026-01-31T12:00:00Z"), 31)) === "2026-02-28");
  check("proximoDiaDoMes(2026-03-10, 10) = 2026-04-10 (o dia da venda não conta)", iso(F.proximoDiaDoMes(d("2026-03-10T12:00:00Z"), 10)) === "2026-04-10");
  check("proximoDiaDoMes(2026-03-09, 10) = 2026-03-10", iso(F.proximoDiaDoMes(d("2026-03-09T12:00:00Z"), 10)) === "2026-03-10");
  check("proximoDiaDoMes vira o ano (2026-12-20, 5 = 2027-01-05)", iso(F.proximoDiaDoMes(d("2026-12-20T12:00:00Z"), 5)) === "2027-01-05");
  check("proximoDiaDoMes devolve meia-noite UTC", F.proximoDiaDoMes(d("2026-03-09T12:00:00Z"), 10).getTime() % 86_400_000 === 0);

  console.log("  a regra do prazo e o vencimento sugerido");
  const conta = { fiado_due_days: 30 };
  const rConta = F.regraDePrazo({ fiado_due_days: null, fiado_due_day: null }, conta);
  check("sem prazo no cliente: vale o da conta", rConta.kind === "dias" && rConta.value === 30 && rConta.source === "conta", j(rConta));
  const rDias = F.regraDePrazo({ fiado_due_days: 10, fiado_due_day: null }, conta);
  check("prazo em dias do cliente vence o da conta", rDias.kind === "dias" && rDias.value === 10 && rDias.source === "cliente", j(rDias));
  const rDia = F.regraDePrazo({ fiado_due_days: null, fiado_due_day: 10 }, conta);
  check("dia fixo do cliente", rDia.kind === "dia_do_mes" && rDia.value === 10 && rDia.source === "cliente", j(rDia));
  const rAmbos = F.regraDePrazo({ fiado_due_days: 7, fiado_due_day: 10 }, conta);
  check("dia fixo vence dias do cliente (a ordem da regra)", rAmbos.kind === "dia_do_mes" && rAmbos.value === 10, j(rAmbos));
  check("sugerirVencimento dias: 2026-11-08 + 30 = 2026-12-08", iso(F.sugerirVencimento({ kind: "dias", value: 30, source: "conta" }, d("2026-11-08T15:00:00Z"))) === "2026-12-08");
  check("sugerirVencimento dia do mês: venda 2026-03-09, dia 10 = 2026-03-10", iso(F.sugerirVencimento({ kind: "dia_do_mes", value: 10, source: "cliente" }, d("2026-03-09T15:00:00Z"))) === "2026-03-10");
  check("sugerirVencimento dia do mês: venda 2026-03-10, dia 10 = 2026-04-10", iso(F.sugerirVencimento({ kind: "dia_do_mes", value: 10, source: "cliente" }, d("2026-03-10T15:00:00Z"))) === "2026-04-10");

  console.log("  o vencimento efetivo do fiado antigo");
  const antigo = F.vencimentoEfetivo({ due_date: d("2026-10-01T00:00:00Z"), sold_at: d("2026-10-01T14:00:00Z"), fiado_due_date: null }, 30);
  check("fiado antigo (sem data própria): data da venda + prazo padrão = 2026-10-31", iso(antigo) === "2026-10-31", iso(antigo));
  const antigo60 = F.vencimentoEfetivo({ due_date: d("2026-10-01T00:00:00Z"), sold_at: d("2026-10-01T14:00:00Z"), fiado_due_date: null }, 60);
  check("o prazo padrão novo move o vencimento do antigo (60 = 2026-11-30)", iso(antigo60) === "2026-11-30", iso(antigo60));
  const novo = F.vencimentoEfetivo({ due_date: d("2026-10-20T00:00:00Z"), sold_at: d("2026-10-01T14:00:00Z"), fiado_due_date: d("2026-10-20T00:00:00Z") }, 30);
  check("fiado com data própria mantém a data (2026-10-20), seja qual for o padrão", iso(novo) === "2026-10-20", iso(novo));

  console.log("  a mensagem de cobrança");
  const m = F.mensagemDeCobranca(null, { nome: "Zé", valor: "R$ 30,00", dias: 19, loja: "Loja 1" }) as string;
  check("modelo nulo usa o padrão, com nome, valor, dias e loja", m.includes("Zé") && m.includes("R$ 30,00") && m.includes("19 dias") && m.includes("Loja 1"), m);
  check("a mensagem pronta não deixa marcador sem trocar", !/\{(nome|valor|dias|loja)\}/.test(m), m);
  const m2 = F.mensagemDeCobranca("Oi {nome}, {valor} há {dias} ({loja}). {nome}!", { nome: "Ana", valor: "R$ 5,00", dias: 3, loja: "L" }) as string;
  check("modelo próprio: troca todas as ocorrências", m2 === "Oi Ana, R$ 5,00 há 3 (L). Ana!", m2);
  check("o texto padrão traz os quatro marcadores", ["{nome}", "{loja}", "{valor}", "{dias}"].every((x) => String(F.MENSAGEM_DE_COBRANCA_PADRAO).includes(x)));

  console.log("  o telefone para o WhatsApp");
  check("+55 (34) 99876-1234 vira 5534998761234", T.telefoneParaWhatsApp("+55 (34) 99876-1234") === "5534998761234");
  check("034 99876 1234 (zero de operadora) vira 5534998761234", T.telefoneParaWhatsApp("034 99876 1234") === "5534998761234");
  check("(34) 3222-1234 (fixo) vira 553432221234", T.telefoneParaWhatsApp("(34) 3222-1234") === "553432221234");
  check("34998761234 (11 dígitos) ganha o 55", T.telefoneParaWhatsApp("34998761234") === "5534998761234");
  check("5534998761234 (13 dígitos com 55) fica", T.telefoneParaWhatsApp("5534998761234") === "5534998761234");
  check("9876-1234 (sem DDD) é nulo", T.telefoneParaWhatsApp("9876-1234") === null);
  check("nulo, vazio e indefinido são nulos", T.telefoneParaWhatsApp(null) === null && T.telefoneParaWhatsApp("") === null && T.telefoneParaWhatsApp(undefined) === null);
  check("lixo sem dígitos suficientes é nulo", T.telefoneParaWhatsApp("abc") === null && T.telefoneParaWhatsApp("123") === null);
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
  gestor: Usuario; // gestor da L1
  gestor2: Usuario; // gestor só da L2
  vend: Usuario; // vendedor da L1
  fin: Usuario; // financeiro, sem loja
  tok: Record<"owner" | "gestor" | "gestor2" | "vend" | "fin", string>;
  L1: string;
  L2: string;
  reg: Record<string, string>; // caixa 1 de cada loja
  prodId: string;
  presId: string;
};

let M: { A: Mundo; B: Mundo; C: Mundo } | null = null;

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
    data: { name: `M99 ${rotulo} ${stamp}`, document: `M99${rotulo}${stamp}`.slice(0, 14), plan: "grupo", status: "trial", trial_ends_at: new Date(Date.now() + DIA) },
  });
  tenantIds.push(t.id);
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "emporio", active: true } });
  await prisma.tenantProfile.create({ data: { tenant_id: t.id, profile_type: "fazenda", active: true } });
  await prisma.tenantFeature.create({ data: { tenant_id: t.id, feature_key: "emporio", enabled: true } });

  const mk = async (suf: string, role: "OWNER" | "OPERADOR", extra: Dado = {}): Promise<Usuario> => {
    const u = await prisma.user.create({
      data: { tenant_id: t.id, name: `M99 ${suf}`, email: `m99-${rotulo}-${suf}-${stamp}@teste.local`, password_hash: hash, role, ...papelDeFixture(role), ...extra },
    });
    return { id: u.id, role, email: u.email };
  };
  const owner = await mk("own", "OWNER");
  const gestor = await mk("gest", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const gestor2 = await mk("gest2", "OPERADOR", { emporio_role: "gestor", emporio_keys: [] });
  const vend = await mk("vend", "OPERADOR", { emporio_role: "vendedor", emporio_keys: ["lancar_compra"] });
  const fin = await mk("fin", "OPERADOR", papelFinanceiro());

  const db = prismaForTenant(t.id) as Dado;
  const l1 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M99 ${rotulo} Loja 1` });
  const l2 = await Cat.criarEstabelecimentoAction(db, owner, { name: `M99 ${rotulo} Loja 2` });
  if (!l1.ok || !l2.ok) throw new Error(`lojas: ${j([l1, l2])}`);
  const L1 = l1.data.id as string;
  const L2 = l2.data.id as string;
  await vincularTodas(prisma, t.id, [gestor.id, vend.id], [L1]);
  await vincularTodas(prisma, t.id, [gestor2.id], [L2]);

  const cat = await db.productCategory.create({ data: scoped({ name: `M99 categoria ${rotulo}` }) });
  const prod = await Cat.criarProdutoEmporioAction(db, owner, { name: `M99 Ração ${rotulo} ${stamp}`, category_id: cat.id, base_unit: "quilograma" });
  if (!prod.ok) throw new Error(`produto: ${j(prod)}`);
  const pres = await Cat.criarApresentacaoAction(db, owner, prod.data.id, { name: "Quilo", base_qty: 1, is_sealed_package: false });
  if (!pres.ok) throw new Error(`apresentação: ${j(pres)}`);
  for (const L of [L1, L2]) {
    const pr = await Cat.definirPrecoAction(db, owner, { establishment_id: L, presentation_id: pres.data.id, price: 10 });
    if (!pr.ok) throw new Error(`preço: ${j(pr)}`);
    const imp = await Est.implantarEstoqueAction(db, owner, { establishment_id: L, emporio_product_id: prod.data.id, sealed: [], loose_qty: 100000, unit_cost: 4 });
    if (!imp.ok) throw new Error(`implantar: ${j(imp)}`);
    await abrirTurnoDeTeste(db, owner, L);
  }
  const reg: Record<string, string> = {};
  for (const L of [L1, L2]) reg[L] = (await db.cashRegister.findFirst({ where: { establishment_id: L, number: 1 } }))?.id as string;

  const tok = {} as Mundo["tok"];
  const pares: [keyof Mundo["tok"], Usuario][] = [["owner", owner], ["gestor", gestor], ["gestor2", gestor2], ["vend", vend], ["fin", fin]];
  for (const [k, u] of pares) {
    tok[k] = String(
      ((await (await rotaTok.POST(new Request("http://localhost/api/v1/auth/token", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: u.email, password: SENHA }),
      }))).json()) as Dado)?.data?.access_token ?? "",
    );
  }
  return { rotulo, tenantId: t.id, db, owner, gestor, gestor2, vend, fin, tok, L1, L2, reg, prodId: prod.data.id, presId: pres.data.id };
}

// Rotas (import literal, para o bundler do tsx resolver os colchetes)
const R = {
  sales: () => import("@/app/api/v1/emporio/sales/route"),
  receivables: () => import("@/app/api/v1/emporio/finance/receivables/route"),
  settings: () => import("@/app/api/v1/emporio/settings/route"),
  settingsFiado: () => import("@/app/api/v1/emporio/settings/fiado/route"),
  credit: () => import("@/app/api/v1/emporio/customers/[id]/credit/route"),
  releases: () => import("@/app/api/v1/emporio/customers/[id]/credit/releases/route"),
  collectCustomer: () => import("@/app/api/v1/emporio/customers/[id]/collections/route"),
  collections: () => import("@/app/api/v1/emporio/finance/collections/route"),
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
const chave = (p: string) => `m99-${p}-${stamp}-${(seq += 1)}`;

// --- fixtures ---

const PADRAO = { fiado_due_days: 30, fiado_block_after_days: 15, fiado_default_limit: null, fiado_collection_message: null };

/** Põe as configurações do fiado no estado pedido (o resto vem do padrão), por Prisma: sem passar pela rota sob prova. */
async function config(w: Mundo, d: Dado = {}) {
  const { prisma } = await import("@/lib/prisma");
  const dados = { ...PADRAO, ...d };
  await (prisma as Dado).emporioSettings.upsert({ where: { tenant_id: w.tenantId }, create: { tenant_id: w.tenantId, ...dados }, update: dados });
}
/** Fixtures de atraso: com o bloqueio no teto, para a segunda venda vencida do mesmo cliente não ser recusada. */
const abrirFixtures = (w: Mundo) => config(w, { fiado_block_after_days: 365 });

async function cliente(w: Mundo, nome: string, extra: Dado = {}) {
  const { prisma } = await import("@/lib/prisma");
  return (await prisma.emporioCustomer.create({ data: { tenant_id: w.tenantId, name: nome, ...extra } as Dado })) as Dado;
}

const itens = (w: Mundo, qty: number) => [{ emporio_product_id: w.prodId, presentation_id: w.presId, quantity: qty }];

/** Venda de preparação pela action (o preço é 10 o quilo: `qty` de 5 vale R$ 50). */
async function vender(w: Mundo, cli: Dado, loja: string, qty: number, payments: Dado[], over: Dado = {}): Promise<string> {
  const V = await import("@/lib/actions/emporio-vendas");
  const r = await V.venderAction(w.db, w.owner, {
    operation_key: chave("venda"), establishment_id: loja, cash_register_id: w.reg[loja],
    customer_id: cli.id, items: itens(w, qty), payments, ...over,
  } as Dado);
  if (!r.ok) throw new Error(`venda de preparação: ${j(r)}`);
  return (r.data as Dado).id as string;
}
/** Fiado vencido há `dias` dias (a venda foi cinco dias antes do vencimento). */
const fiadoVencido = (w: Mundo, cli: Dado, dias: number, qty: number, loja?: string) =>
  vender(w, cli, loja ?? w.L1, qty, [{ kind: "fiado", amount: qty * 10, due_date: meioDia(somaDias(hojeStr, -dias)) }], { sold_at: new Date(Date.now() - (dias + 5) * DIA) });

/** Venda pela rota, o que está sob prova. */
const vendaRota = (w: Mundo, cli: Dado, loja: string, qty: number, payments: Dado[]) =>
  chamar(w.tok.owner, R.sales, "POST", "emporio/sales", {
    operation_key: chave("rota"), establishment_id: loja, cash_register_id: w.reg[loja], customer_id: cli.id, items: itens(w, qty), payments,
  });
const fiadoRota = (w: Mundo, cli: Dado, loja: string, valor: number, dinheiro = 0) =>
  vendaRota(w, cli, loja, (valor + dinheiro) / 10, [
    { kind: "fiado", amount: valor },
    ...(dinheiro > 0 ? [{ kind: "dinheiro", amount: dinheiro }] : []),
  ]);

const entradaDaVenda = async (w: Mundo, vendaId: string, cli: Dado) =>
  ((await w.db.financialEntry.findFirst({ where: { related_module: "emporio", related_id: vendaId, entry_type: "income" } }))
    ?? (await w.db.financialEntry.findFirst({ where: { emporio_customer_id: cli.id, entry_type: "income" }, orderBy: { created_at: "desc" } }))) as Dado;
const pagamentoFiado = async (w: Mundo, vendaId: string) =>
  (await w.db.emporioSalePayment.findFirst({ where: { sale_id: vendaId, kind: "fiado" } })) as Dado;

const credito = (w: Mundo, tok: string, cli: Dado) => chamar(tok, R.credit, "GET", `emporio/customers/${cli.id}/credit`, undefined, cli.id);
const liberar = (w: Mundo, tok: string, cli: Dado, loja: string, reason = "Cliente vai acertar amanhã") =>
  chamar(tok, R.releases, "POST", `emporio/customers/${cli.id}/credit/releases`, { establishment_id: loja, reason }, cli.id);

// ---------------------------------------------------------------------------
// Seção 2: as configurações do fiado
// ---------------------------------------------------------------------------

async function secao2() {
  console.log("\nSeção 2: as configurações do fiado");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");
  const F: Dado = await import("@/lib/emporio/fiado");

  console.log("  os padrões");
  const g0 = await chamar(A.tok.owner, R.settings, "GET", "emporio/settings");
  const d0 = g0.corpo?.data as Dado;
  check("GET settings: 200", g0.status === 200, `${g0.status} ${j(g0.corpo)}`);
  check("prazo padrão 30 e bloqueio em 15 dias", d0?.fiado_due_days === 30 && d0?.fiado_block_after_days === 15, j(d0));
  check("limite padrão e mensagem própria nulos", d0?.fiado_default_limit === null && d0?.fiado_collection_message === null, j(d0));
  check("a mensagem efetiva é o texto padrão", d0?.fiado_collection_message_effective === F.MENSAGEM_DE_COBRANCA_PADRAO, String(d0?.fiado_collection_message_effective));

  console.log("  o Financeiro muda");
  const modelo = "Oi {nome}, tudo bem? Falta acertar {valor} ({dias} dias).";
  const p1 = await chamar(A.tok.fin, R.settingsFiado, "PATCH", "emporio/settings/fiado", {
    fiado_due_days: 20, fiado_block_after_days: 10, fiado_default_limit: 500, fiado_collection_message: modelo,
  });
  check("Financeiro: PATCH settings/fiado: 200", p1.status === 200, `${p1.status} ${j(p1.corpo)}`);
  const g1 = (await chamar(A.tok.owner, R.settings, "GET", "emporio/settings")).corpo?.data as Dado;
  check("o GET reflete: 20 dias, bloqueio 10, limite 500", g1?.fiado_due_days === 20 && g1?.fiado_block_after_days === 10 && perto(n(g1?.fiado_default_limit), 500), j(g1));
  check("o GET reflete a mensagem própria e a efetiva", g1?.fiado_collection_message === modelo && g1?.fiado_collection_message_effective === modelo, j(g1));
  const linha = (await (prisma as Dado).emporioSettings.findFirst({ where: { tenant_id: A.tenantId } })) as Dado;
  check("gravou na linha das configurações (Prisma)", linha?.fiado_due_days === 20 && linha?.fiado_block_after_days === 10 && perto(n(linha?.fiado_default_limit), 500), j(linha));

  const p2 = await chamar(A.tok.owner, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_default_limit: null, fiado_collection_message: null });
  check("o Dono limpa limite e mensagem (nulos): 200", p2.status === 200, `${p2.status} ${j(p2.corpo)}`);
  const g2 = (await chamar(A.tok.owner, R.settings, "GET", "emporio/settings")).corpo?.data as Dado;
  check("limite e mensagem voltam a nulos, e a efetiva volta ao padrão",
    g2?.fiado_default_limit === null && g2?.fiado_collection_message === null && g2?.fiado_collection_message_effective === F.MENSAGEM_DE_COBRANCA_PADRAO, j(g2));
  check("o que não veio no corpo não mudou (20 dias)", g2?.fiado_due_days === 20 && g2?.fiado_block_after_days === 10, j(g2));

  console.log("  quem não pode e o que recusa");
  const antes = j(await (prisma as Dado).emporioSettings.findFirst({ where: { tenant_id: A.tenantId } }));
  const pg = await chamar(A.tok.gestor, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_due_days: 99 });
  check("o Gestor não muda as configurações do fiado: 403", pg.status === 403, `${pg.status} ${j(pg.corpo)}`);
  const pv = await chamar(A.tok.vend, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_due_days: 99 });
  check("o Vendedor também não: 403", pv.status === 403, `${pv.status}`);
  const z = await chamar(A.tok.fin, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_due_days: 0 });
  check("prazo 0: 422 no campo fiado_due_days", erro(z, 422, undefined, "fiado_due_days"), `${z.status} ${j(z.corpo)}`);
  const z2 = await chamar(A.tok.fin, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_due_days: 366 });
  check("prazo 366: 422 no campo fiado_due_days (o teto é 365)", erro(z2, 422, undefined, "fiado_due_days"), `${z2.status} ${j(z2.corpo)}`);
  const z3 = await chamar(A.tok.fin, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_block_after_days: 0 });
  check("bloqueio em 0 dias: 422 no campo fiado_block_after_days", erro(z3, 422, undefined, "fiado_block_after_days"), `${z3.status} ${j(z3.corpo)}`);
  const z4 = await chamar(A.tok.fin, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_default_limit: -1 });
  check("limite -1: 422 no campo fiado_default_limit", erro(z4, 422, undefined, "fiado_default_limit"), `${z4.status} ${j(z4.corpo)}`);
  const z5 = await chamar(A.tok.fin, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_collection_message: "x".repeat(501) });
  check("mensagem de 501 caracteres: 422 no campo fiado_collection_message", erro(z5, 422, undefined, "fiado_collection_message"), `${z5.status} ${j(z5.corpo)}`);
  const lim0 = await chamar(A.tok.fin, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_default_limit: 0 });
  check("limite padrão 0 é válido (>= 0): 200", lim0.status === 200, `${lim0.status} ${j(lim0.corpo)}`);
  void antes;
  const depois = (await (prisma as Dado).emporioSettings.findFirst({ where: { tenant_id: A.tenantId } })) as Dado;
  check("depois das recusas o prazo segue 20 (nem o 99 do Gestor nem o 0 entraram)", depois?.fiado_due_days === 20, String(depois?.fiado_due_days));

  console.log("  o Histórico");
  const hist = (await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "configuracoes.editar" } })) as Dado[];
  check("o Histórico tem configuracoes.editar", hist.length >= 1);
  check("o changes guarda o prazo antigo e o novo (30 para 20)", hist.some((h) => { const t = j(h.changes ?? ""); return t.includes("Prazo") && t.includes("30") && t.includes("20"); }), j(hist.map((h) => h.changes)));
}

// ---------------------------------------------------------------------------
// Seção 3: o vencimento
// ---------------------------------------------------------------------------

async function secao3() {
  console.log("\nSeção 3: o vencimento do fiado (venda, cliente, conta)");
  const { A } = M!;
  const F: Dado = await import("@/lib/emporio/fiado");
  await config(A);

  console.log("  (a) o informado na venda");
  const ca = await cliente(A, "M99 Prazo informado");
  const dInf = somaDias(hojeStr, 12);
  const va = await vender(A, ca, A.L1, 1, [{ kind: "fiado", amount: 10, due_date: meioDia(dInf) }]);
  check("a entry grava o dia informado", diaDe((await entradaDaVenda(A, va, ca))?.due_date) === dInf, j(await entradaDaVenda(A, va, ca)));
  check("o pagamento fiado grava o mesmo dia", diaDe((await pagamentoFiado(A, va))?.due_date) === dInf, j(await pagamentoFiado(A, va)));

  console.log("  (b) o prazo do cliente em dias");
  const cb = await cliente(A, "M99 Prazo 10 dias", { fiado_due_days: 10 });
  const vb = await vender(A, cb, A.L1, 1, [{ kind: "fiado", amount: 10 }]);
  const eb = await entradaDaVenda(A, vb, cb);
  check("sem due_date, vence venda + 10 dias na entry", diaDe(eb?.due_date) === somaDias(hojeStr, 10), `${diaDe(eb?.due_date)} vs ${somaDias(hojeStr, 10)}`);
  check("e no pagamento fiado (nunca mais nulo)", diaDe((await pagamentoFiado(A, vb))?.due_date) === somaDias(hojeStr, 10), j(await pagamentoFiado(A, vb)));

  console.log("  (c) o dia fixo do mês do cliente");
  const cc1 = await cliente(A, "M99 Dia 10 antes", { fiado_due_day: 10 });
  const vc1 = await vender(A, cc1, A.L1, 1, [{ kind: "fiado", amount: 10 }], { sold_at: new Date("2026-03-09T15:00:00Z") });
  check("venda em 2026-03-09, dia 10: vence 2026-03-10", diaDe((await entradaDaVenda(A, vc1, cc1))?.due_date) === "2026-03-10", String((await entradaDaVenda(A, vc1, cc1))?.due_date));
  check("o pagamento fiado também (2026-03-10)", diaDe((await pagamentoFiado(A, vc1))?.due_date) === "2026-03-10");
  const cc2 = await cliente(A, "M99 Dia 10 no dia", { fiado_due_day: 10 });
  const vc2 = await vender(A, cc2, A.L1, 1, [{ kind: "fiado", amount: 10 }], { sold_at: new Date("2026-03-10T15:00:00Z") });
  check("venda em 2026-03-10, dia 10: vence 2026-04-10 (o dia da venda não conta)", diaDe((await entradaDaVenda(A, vc2, cc2))?.due_date) === "2026-04-10", String((await entradaDaVenda(A, vc2, cc2))?.due_date));

  console.log("  (d) o padrão da conta");
  const cd = await cliente(A, "M99 Sem prazo");
  const vd = await vender(A, cd, A.L1, 1, [{ kind: "fiado", amount: 10 }]);
  check("sem nada: vence venda + 30 (padrão da conta)", diaDe((await entradaDaVenda(A, vd, cd))?.due_date) === somaDias(hojeStr, 30), String((await entradaDaVenda(A, vd, cd))?.due_date));
  await config(A, { fiado_due_days: 20 });
  const cd2 = await cliente(A, "M99 Sem prazo 20");
  const vd2 = await vender(A, cd2, A.L1, 1, [{ kind: "fiado", amount: 10 }]);
  check("a conta com 20 dias: vence venda + 20", diaDe((await entradaDaVenda(A, vd2, cd2))?.due_date) === somaDias(hojeStr, 20), String((await entradaDaVenda(A, vd2, cd2))?.due_date));
  check("e o pagamento fiado (+ 20)", diaDe((await pagamentoFiado(A, vd2))?.due_date) === somaDias(hojeStr, 20));
  await config(A);

  console.log("  (e) o fiado antigo sem data: regra de leitura, sem UPDATE");
  const ce = await cliente(A, "M99 Fiado antigo");
  const venda40 = new Date(Date.now() - 40 * DIA);
  const ve = await vender(A, ce, A.L1, 3, [{ kind: "fiado", amount: 30, due_date: meioDia(diaDe(venda40)) }], { sold_at: venda40 });
  const eEnt = await entradaDaVenda(A, ve, ce);
  const pg = await pagamentoFiado(A, ve);
  await A.db.emporioSalePayment.update({ where: { id: pg.id }, data: { due_date: null } });
  await A.db.financialEntry.update({ where: { id: eEnt.id }, data: { due_date: venda40 } });
  const cruAntes = diaDe((await A.db.financialEntry.findFirst({ where: { id: eEnt.id } })).due_date);
  const venc30 = somaDias(diaDe(venda40), 30);
  const achar = async () => {
    const r = await chamar(A.tok.fin, R.receivables, "GET", "emporio/finance/receivables");
    const f = (r.corpo?.data?.fiado ?? []).find((x: Dado) => x.customer_id === ce.id);
    return { r, f, s: j(f ?? {}) };
  };
  const a30 = await achar();
  check("(fixture) o fiado antigo aparece em receivables: 200", a30.r.status === 200 && !!a30.f, `${a30.r.status} ${a30.s}`);
  check("padrão 30: o vencimento é a venda + 30", a30.s.includes(`"due_date":"${venc30}`), `${venc30} em ${a30.s}`);
  check("e está vencido (10 dias)", a30.s.includes('"overdue":true'), a30.s);
  await config(A, { fiado_due_days: 60 });
  const a60 = await achar();
  check("padrão 60: o mesmo fiado deixa de estar vencido", a60.s.includes('"overdue":false') && !a60.s.includes('"overdue":true'), a60.s);
  check("e o vencimento acompanha (venda + 60)", a60.s.includes(`"due_date":"${somaDias(diaDe(venda40), 60)}`), a60.s);
  const cruDepois = diaDe((await A.db.financialEntry.findFirst({ where: { id: eEnt.id } })).due_date);
  check("sem UPDATE: o due_date cru da entry não mudou", cruAntes === cruDepois && cruDepois === diaDe(venda40), `${cruAntes} -> ${cruDepois}`);
  check("nem o do pagamento fiado (segue nulo)", (await A.db.emporioSalePayment.findFirst({ where: { id: pg.id } })).due_date === null);
  await config(A);

  console.log("  (f) a ficha de crédito traz o vencimento sugerido pela mesma ordem");
  const fc = await credito(A, A.tok.owner, cd);
  check("cliente sem prazo: sugerido = hoje + 30 (conta)", fc.status === 200 && fc.corpo?.data?.suggested_due_date === somaDias(hojeStr, 30), `${fc.status} ${j(fc.corpo)}`);
  check("a regra do prazo diz dias, 30, da conta", fc.corpo?.data?.due_rule?.kind === "dias" && fc.corpo?.data?.due_rule?.value === 30 && fc.corpo?.data?.due_rule?.source === "conta", j(fc.corpo?.data?.due_rule));
  const fb = await credito(A, A.tok.owner, cb);
  check("cliente de 10 dias: sugerido = hoje + 10 (cliente)", fb.corpo?.data?.suggested_due_date === somaDias(hojeStr, 10) && fb.corpo?.data?.due_rule?.source === "cliente", j(fb.corpo?.data));
  const fcd = await credito(A, A.tok.owner, cc1);
  const esperadoDia = iso(F.proximoDiaDoMes(new Date(), 10));
  check("cliente com dia 10: sugerido = o próximo dia 10, e a regra é dia_do_mes", fcd.corpo?.data?.suggested_due_date === esperadoDia && fcd.corpo?.data?.due_rule?.kind === "dia_do_mes", `${esperadoDia} vs ${j(fcd.corpo?.data)}`);

  console.log("  (g) o saldo não depende do prazo");
  const o1 = (await credito(A, A.tok.owner, ce)).corpo?.data?.owed_total;
  await config(A, { fiado_due_days: 77 });
  const o2 = (await credito(A, A.tok.owner, ce)).corpo?.data?.owed_total;
  check("owed_total do cliente é 30 e não muda com o prazo padrão", perto(o1, 30) && perto(o2, 30), `${o1} -> ${o2}`);
  await config(A);
}

// ---------------------------------------------------------------------------
// Seção 4: bloqueio e limite
// ---------------------------------------------------------------------------

async function secao4() {
  console.log("\nSeção 4: o bloqueio por atraso e o limite de crédito");
  const { A } = M!;

  // Fixtures com o bloqueio no teto; depois o cenário de teste.
  await abrirFixtures(A);
  const c20 = await cliente(A, "M99 Atraso 20");
  await fiadoVencido(A, c20, 20, 10);
  const c10 = await cliente(A, "M99 Atraso 10");
  await fiadoVencido(A, c10, 10, 10);
  const c450 = await cliente(A, "M99 Deve 450");
  await vender(A, c450, A.L1, 45, [{ kind: "fiado", amount: 450, due_date: meioDia(somaDias(hojeStr, 20)) }]);
  const c600 = await cliente(A, "M99 Limite proprio", { fiado_limit: 1000 });
  await vender(A, c600, A.L1, 60, [{ kind: "fiado", amount: 600, due_date: meioDia(somaDias(hojeStr, 20)) }]);
  const c0 = await cliente(A, "M99 Limite zero", { fiado_limit: 0 });
  const cMista = await cliente(A, "M99 Venda mista");
  await vender(A, cMista, A.L1, 45, [{ kind: "fiado", amount: 450, due_date: meioDia(somaDias(hojeStr, 20)) }]);
  await config(A, { fiado_block_after_days: 15, fiado_default_limit: 500 });

  console.log("  (a) vencido há 20 dias, bloqueio em 15");
  const ra = await fiadoRota(A, c20, A.L2, 10);
  check("fiado em OUTRA loja (L2): 409 FIADO_BLOQUEADO no campo payments", erro(ra, 409, "FIADO_BLOQUEADO", "payments"), `${ra.status} ${j(ra.corpo)}`);
  check("a mensagem diz 'vencido há 20 dias'", String(ra.corpo?.error?.message).includes("vencido há 20 dias"), String(ra.corpo?.error?.message));
  const antesVendas = await A.db.emporioSale.count({ where: { customer_id: c20.id } });
  const rdin = await vendaRota(A, c20, A.L2, 1, [{ kind: "dinheiro", amount: 10 }]);
  check("a mesma venda só em dinheiro passa: 201", rdin.status === 201, `${rdin.status} ${j(rdin.corpo)}`);
  check("a recusa não gravou venda; a de dinheiro gravou uma", (await A.db.emporioSale.count({ where: { customer_id: c20.id } })) === antesVendas + 1);

  console.log("  (b) vencido há 10 dias, bloqueio em 15");
  const rb = await fiadoRota(A, c10, A.L1, 10);
  check("não bloqueia: 201", rb.status === 201, `${rb.status} ${j(rb.corpo)}`);

  console.log("  (c) limite padrão 500, cliente deve 450");
  const rc1 = await fiadoRota(A, c450, A.L1, 100);
  check("fiado de 100: 409 LIMITE_EXCEDIDO no campo payments", erro(rc1, 409, "LIMITE_EXCEDIDO", "payments"), `${rc1.status} ${j(rc1.corpo)}`);
  const msgC = String(rc1.corpo?.error?.message);
  check("a mensagem cita o limite (500) e quanto cabe (50)", /500/.test(msgC) && /\b50\b/.test(msgC), msgC);
  const rc2 = await fiadoRota(A, c450, A.L1, 50);
  check("fiado de 50 (cabe exato): 201", rc2.status === 201, `${rc2.status} ${j(rc2.corpo)}`);

  console.log("  (d) o limite do cliente vence o padrão");
  const rd = await fiadoRota(A, c600, A.L1, 100);
  check("limite do cliente 1000, padrão 500, deve 600: fiado de 100 passa (201)", rd.status === 201, `${rd.status} ${j(rd.corpo)}`);

  console.log("  (e) limite zero");
  const re = await fiadoRota(A, c0, A.L1, 10);
  check("limite 0: 409 LIMITE_EXCEDIDO", erro(re, 409, "LIMITE_EXCEDIDO", "payments"), `${re.status} ${j(re.corpo)}`);
  check("a mensagem diz que não compra fiado", String(re.corpo?.error?.message).includes("não compra fiado"), String(re.corpo?.error?.message));

  console.log("  (f) venda mista: só a parte fiado conta");
  const rf1 = await fiadoRota(A, cMista, A.L1, 60, 100);
  check("fiado 60 + dinheiro 100, devendo 450 de 500: 409 LIMITE_EXCEDIDO", erro(rf1, 409, "LIMITE_EXCEDIDO", "payments"), `${rf1.status} ${j(rf1.corpo)}`);
  const rf2 = await fiadoRota(A, cMista, A.L1, 50, 110);
  check("fiado 50 + dinheiro 110: 201 (o dinheiro não entra na conta)", rf2.status === 201, `${rf2.status} ${j(rf2.corpo)}`);

  console.log("  (g) a ficha de crédito diz o estado");
  const g1 = await credito(A, A.tok.owner, c20);
  check("cliente com atraso de 20 dias: status bloqueado_por_atraso", g1.corpo?.data?.status === "bloqueado_por_atraso", `${g1.status} ${j(g1.corpo)}`);
  check("oldest_overdue.days é 20 e o limite de bloqueio vem na view", g1.corpo?.data?.oldest_overdue?.days === 20 && g1.corpo?.data?.block_after_days === 15, j(g1.corpo?.data));
  const g2 = await credito(A, A.tok.owner, cMista);
  check("cliente que bateu o limite: status no_limite", g2.corpo?.data?.status === "no_limite", j(g2.corpo?.data));
  check("e available é 0 ou menos (devendo 500 de 500)", typeof g2.corpo?.data?.available === "number" && g2.corpo.data.available <= 0 && perto(g2.corpo.data.owed_total, 500), j(g2.corpo?.data));
  check("limit 500 vem da conta (limit_source conta)", perto(g2.corpo?.data?.limit, 500) && g2.corpo?.data?.limit_source === "conta", j(g2.corpo?.data));
  const g3 = await credito(A, A.tok.owner, c600);
  check("limite do cliente: limit_source cliente, limit 1000", perto(g3.corpo?.data?.limit, 1000) && g3.corpo?.data?.limit_source === "cliente", j(g3.corpo?.data));
  const g4 = await credito(A, A.tok.owner, c10);
  check("cliente em dia dentro do limite (atraso 10 de 15): status em_dia", g4.corpo?.data?.status === "em_dia", j(g4.corpo?.data));

  console.log("  (h) devolução com abater fiado");
  console.log("  (fica de fora: a devolução com `abater_fiado` exige montar a venda e o item a devolver, e esta suíte não leu a assinatura de `devolverAction`)");
}

// ---------------------------------------------------------------------------
// Seção 5: a liberação pontual
// ---------------------------------------------------------------------------

async function secao5() {
  console.log("\nSeção 5: a liberação pontual do gestor");
  const { A } = M!;
  const { prisma } = await import("@/lib/prisma");

  await abrirFixtures(A);
  const bloqueado = async (nome: string, extra: Dado = {}) => {
    const c = await cliente(A, nome, extra);
    await fiadoVencido(A, c, 20, 10);
    return c;
  };
  const c5 = await bloqueado("M99 Liberacao");
  const c5e = await bloqueado("M99 Liberacao L2");
  const c5f = await bloqueado("M99 Liberacao limite zero");
  const c5h = await bloqueado("M99 Liberacao do dono");
  await (prisma as Dado).emporioCustomer.update({ where: { id: c5f.id }, data: { fiado_limit: 0 } });
  await config(A, { fiado_block_after_days: 15 });

  console.log("  (a) quem libera, e até quando");
  const rOutra = await liberar(A, A.tok.gestor2, c5, A.L1);
  check("gestor da L2 liberando na L1: 403", rOutra.status === 403, `${rOutra.status} ${j(rOutra.corpo)}`);
  check("o 403 não gravou liberação", (await (prisma as Dado).emporioCreditRelease.count({ where: { customer_id: c5.id } })) === 0);
  const r1 = await liberar(A, A.tok.gestor, c5, A.L1, "Paga na sexta, combinado por telefone");
  check("gestor da L1 liberando na L1: 201", r1.status === 201, `${r1.status} ${j(r1.corpo)}`);
  const rel = r1.corpo?.data as Dado;
  const validade = new Date(String(rel?.valid_until));
  const fimSp = Number.isNaN(validade.getTime())
    ? "(sem valid_until)"
    : new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" }).format(validade);
  check("valid_until é o fim do dia de São Paulo (hoje, 23:59)", fimSp.startsWith(`${hojeStr} 23:59`), `${rel?.valid_until} -> ${fimSp}`);
  check("a liberação nasce sem venda consumida", rel?.consumed_sale_id === null || rel?.consumed_sale_id === undefined, j(rel));

  console.log("  (b) uma por dia, cliente e loja");
  const r2 = await liberar(A, A.tok.gestor, c5, A.L1, "Outra tentativa no mesmo dia");
  check("segunda liberação no mesmo dia: 409 LIBERACAO_JA_EXISTE no campo establishment_id", erro(r2, 409, "LIBERACAO_JA_EXISTE", "establishment_id"), `${r2.status} ${j(r2.corpo)}`);
  const rCurto = await liberar(A, A.tok.owner, c5h, A.L1, "ab");
  check("motivo com 2 caracteres: 422 no campo reason", erro(rCurto, 422, undefined, "reason"), `${rCurto.status} ${j(rCurto.corpo)}`);
  check("(e a recusa de motivo não gravou)", (await (prisma as Dado).emporioCreditRelease.count({ where: { customer_id: c5h.id } })) === 0);

  console.log("  (c) a venda usa a liberação");
  const v1 = await fiadoRota(A, c5, A.L1, 10);
  check("com a liberação, o fiado do cliente bloqueado passa: 201", v1.status === 201, `${v1.status} ${j(v1.corpo)}`);
  const vendaId = v1.corpo?.data?.id as string;
  const rb = (await (prisma as Dado).emporioCreditRelease.findFirst({ where: { customer_id: c5.id } })) as Dado;
  check("a liberação sai consumida pela venda (consumed_sale_id)", !!vendaId && rb?.consumed_sale_id === vendaId && !!rb?.consumed_at, j(rb));

  console.log("  (d) não se reutiliza");
  const v2 = await fiadoRota(A, c5, A.L1, 10);
  check("a segunda venda fiado recusa de novo: 409 FIADO_BLOQUEADO", erro(v2, 409, "FIADO_BLOQUEADO", "payments"), `${v2.status} ${j(v2.corpo)}`);

  console.log("  (e) vale só para a loja liberada");
  const re1 = await liberar(A, A.tok.gestor, c5e, A.L1);
  check("(fixture) liberação da L1 para outro cliente: 201", re1.status === 201, `${re1.status} ${j(re1.corpo)}`);
  const re2 = await fiadoRota(A, c5e, A.L2, 10);
  check("a venda em L2 com liberação da L1: 409 FIADO_BLOQUEADO", erro(re2, 409, "FIADO_BLOQUEADO", "payments"), `${re2.status} ${j(re2.corpo)}`);
  const reRel = (await (prisma as Dado).emporioCreditRelease.findFirst({ where: { customer_id: c5e.id } })) as Dado;
  check("a recusa não consumiu a liberação", reRel?.consumed_sale_id === null, j(reRel));

  console.log("  (f) a liberação passa pelo limite zero também");
  const rf = await liberar(A, A.tok.gestor, c5f, A.L1);
  check("(fixture) liberação para cliente com limite 0 e atraso: 201", rf.status === 201, `${rf.status} ${j(rf.corpo)}`);
  const vf = await fiadoRota(A, c5f, A.L1, 10);
  check("a venda fiado passa: 201", vf.status === 201, `${vf.status} ${j(vf.corpo)}`);

  console.log("  (g) Histórico e ficha");
  const hist = (await prisma.emporioAuditLog.findMany({ where: { tenant_id: A.tenantId, action: "fiado.liberar" } })) as Dado[];
  check("o Histórico tem fiado.liberar", hist.length >= 1);
  check("a linha leva o motivo", hist.some((h) => j(h).includes("Paga na sexta, combinado por telefone")), j(hist.map((h) => h.summary)));
  check("e a loja da liberação", hist.some((h) => h.establishment_id === A.L1));
  const fc = await credito(A, A.tok.owner, c5);
  const lista = (fc.corpo?.data?.releases ?? []) as Dado[];
  check("GET credit lista a liberação, com a venda consumida e o nome de quem liberou",
    lista.some((l) => l.consumed_sale_id === vendaId && l.establishment_id === A.L1 && typeof l.released_by_name === "string" && l.reason === "Paga na sexta, combinado por telefone"), j(lista));

  console.log("  (h) quem não libera");
  const rv = await liberar(A, A.tok.vend, c5h, A.L1);
  check("o Vendedor (sem ser gestor) tentando liberar: 403", rv.status === 403, `${rv.status} ${j(rv.corpo)}`);
  const rfin = await liberar(A, A.tok.fin, c5h, A.L1);
  check("o Financeiro também não libera (não é `gestor_da_loja`): 403", rfin.status === 403, `${rfin.status} ${j(rfin.corpo)}`);
  const rd = await liberar(A, A.tok.owner, c5h, A.L1);
  check("o Dono libera: 201", rd.status === 201, `${rd.status} ${j(rd.corpo)}`);
}

// ---------------------------------------------------------------------------
// Seção 6: a lista de cobrança
// ---------------------------------------------------------------------------

async function secao6() {
  console.log("\nSeção 6: a lista de cobrança");
  const { C } = M!;
  const { prisma } = await import("@/lib/prisma");

  await abrirFixtures(C);
  const mais = await cliente(C, "Cob Mais", { phone: "(34) 99876-1234" });
  await fiadoVencido(C, mais, 40, 5, C.L2); // 50 na L2 (a venda de L2 primeiro: a segunda não pode ser bloqueada)
  await fiadoVencido(C, mais, 40, 10, C.L1); // 100 na L1
  const menos = await cliente(C, "Cob Menos", { phone: "+55 34 3222-1234" });
  await fiadoVencido(C, menos, 5, 3);
  const semtel = await cliente(C, "Cob Semtel");
  await fiadoVencido(C, semtel, 10, 4);
  const emdia = await cliente(C, "Cob Em dia", { phone: "34 99111-2222" });
  await vender(C, emdia, C.L1, 5, [{ kind: "fiado", amount: 50, due_date: meioDia(somaDias(hojeStr, 10)) }]);
  await config(C);

  const lista = async (qs = "") => {
    const r = await chamar(C.tok.fin, R.collections, "GET", `emporio/finance/collections${qs}`);
    return { r, cs: (r.corpo?.data?.customers ?? []) as Dado[] };
  };
  const nomes = (cs: Dado[]) => cs.map((x) => x.customer_name);

  console.log("  (a) quem aparece, e a ordem");
  const l0 = await lista();
  check("Financeiro lê a cobrança: 200", l0.r.status === 200, `${l0.r.status} ${j(l0.r.corpo)}`);
  check("traz os três vencidos, do mais atrasado ao menos: Mais, Semtel, Menos", j(nomes(l0.cs)) === j(["Cob Mais", "Cob Semtel", "Cob Menos"]), j(nomes(l0.cs)));
  check("não traz o cliente em dia", l0.cs.length > 0 && !nomes(l0.cs).includes("Cob Em dia"));
  const m0 = l0.cs.find((x) => x.customer_name === "Cob Mais") as Dado;
  check("o Mais deve 150 vencidos há 40 dias, em duas lojas", perto(m0?.overdue_total, 150) && m0?.oldest_days === 40 && m0?.stores?.length === 2, j(m0));
  check("as lojas do Mais trazem o vencido de cada uma (100 na L1, 50 na L2)",
    perto(m0?.stores?.find((s: Dado) => s.establishment_id === C.L1)?.overdue, 100) && perto(m0?.stores?.find((s: Dado) => s.establishment_id === C.L2)?.overdue, 50), j(m0?.stores));
  check("ainda ninguém foi cobrado: last_charged_at nulo", m0?.last_charged_at === null, j(m0));
  check("o modelo da conta vem na view (message_template)", typeof l0.r.corpo?.data?.message_template === "string" && l0.r.corpo.data.message_template.length > 0);

  console.log("  (b) o link do WhatsApp");
  check("telefone do Mais vira 5534998761234 em phone_whatsapp", m0?.phone_whatsapp === "5534998761234", j(m0));
  const url = String(m0?.whatsapp_url);
  check("whatsapp_url começa com https://wa.me/5534998761234?text=", url.startsWith("https://wa.me/5534998761234?text="), url);
  const texto = (() => { try { return decodeURIComponent(url.split("?text=")[1] ?? ""); } catch { return ""; } })();
  check("o texto decodificado cita o nome e o valor em formato brasileiro", texto.includes("Cob Mais") && texto.includes("150,00"), texto);
  check("o texto cita os dias de atraso", texto.includes("40"), texto);
  check("a message da view é o mesmo texto do link", m0?.message === texto, `${m0?.message} vs ${texto}`);
  const me0 = l0.cs.find((x) => x.customer_name === "Cob Menos") as Dado;
  check("o fixo do Menos vira 553432221234", me0?.phone_whatsapp === "553432221234" && String(me0?.whatsapp_url).startsWith("https://wa.me/553432221234?text="), j(me0));

  console.log("  (c) sem telefone");
  const s0 = l0.cs.find((x) => x.customer_name === "Cob Semtel") as Dado;
  check("Semtel: phone_whatsapp e whatsapp_url nulos, e continua na lista", !!s0 && s0.phone_whatsapp === null && s0.whatsapp_url === null, j(s0));

  console.log("  (d) os filtros");
  const f1 = await lista("?faixa=31-60");
  check("faixa=31-60 traz só o Mais", j(nomes(f1.cs)) === j(["Cob Mais"]), j(nomes(f1.cs)));
  const f2 = await lista("?faixa=1-15");
  check("faixa=1-15 traz Semtel e Menos (10 e 5 dias)", j(nomes(f2.cs)) === j(["Cob Semtel", "Cob Menos"]), j(nomes(f2.cs)));
  const f3 = await lista("?faixa=60%2B");
  check("faixa=60+ não traz ninguém (o maior atraso é 40)", f3.r.status === 200 && f3.cs.length === 0, `${f3.r.status} ${j(nomes(f3.cs))}`);
  const f4 = await lista(`?establishment_id=${C.L2}`);
  check("establishment_id=L2 traz só quem deve na L2 (o Mais)", j(nomes(f4.cs)) === j(["Cob Mais"]), j(nomes(f4.cs)));
  check("e o vencido é só o da L2 (50)", perto(f4.cs[0]?.overdue_total, 50), j(f4.cs[0]));
  const f5 = await lista("?faixa=lixo");
  check("faixa inválida: 422 no campo faixa", erro(f5.r, 422, undefined, "faixa"), `${f5.r.status} ${j(f5.r.corpo)}`);

  console.log("  (e) cobrar");
  const cobrar = (tok: string, cli: Dado, corpo: Dado = {}) => chamar(tok, R.collectCustomer, "POST", `emporio/customers/${cli.id}/collections`, corpo, cli.id);
  const gG = await cobrar(C.tok.gestor, mais);
  check("o Gestor não cobra: 403", gG.status === 403, `${gG.status} ${j(gG.corpo)}`);
  const gL = await chamar(C.tok.gestor, R.collections, "GET", "emporio/finance/collections");
  check("o Gestor não lê a lista de cobrança: 403", gL.status === 403, `${gL.status}`);
  const eD = await cobrar(C.tok.fin, emdia);
  check("cobrar quem não tem fiado vencido: 422 SEM_FIADO_VENCIDO no campo customer_id", erro(eD, 422, "SEM_FIADO_VENCIDO", "customer_id"), `${eD.status} ${j(eD.corpo)}`);
  const antes = await prisma.emporioAuditLog.count({ where: { tenant_id: C.tenantId, action: "fiado.cobrar" } });
  check("a recusa não gravou no Histórico", antes === 0, String(antes));
  const ok = await cobrar(C.tok.fin, mais, { establishment_id: null });
  check("o Financeiro cobra o Mais: 201 com charged_at", ok.status === 201 && typeof ok.corpo?.data?.charged_at === "string", `${ok.status} ${j(ok.corpo)}`);
  const l1 = await lista();
  const m1 = l1.cs.find((x) => x.customer_name === "Cob Mais") as Dado;
  check("a lista seguinte traz last_charged_at preenchido no Mais", typeof m1?.last_charged_at === "string" && diaDe(m1.last_charged_at) === diaDe(new Date()), j(m1));
  check("quem não foi cobrado segue sem data", l1.cs.length === 3 && l1.cs.filter((x) => x.customer_name !== "Cob Mais").every((x) => x.last_charged_at === null), j(l1.cs.map((x) => [x.customer_name, x.last_charged_at])));
  const h = (await prisma.emporioAuditLog.findMany({ where: { tenant_id: C.tenantId, action: "fiado.cobrar" } })) as Dado[];
  check("o Histórico grava fiado.cobrar uma vez", h.length === 1, String(h.length));
  check("com o nome do cliente no resumo", h.some((x) => String(x.summary).includes("Cob Mais")), j(h.map((x) => x.summary)));
  const fc = await credito(C, C.tok.fin, mais);
  check("a ficha de crédito mostra last_charged_at", typeof fc.corpo?.data?.last_charged_at === "string", j(fc.corpo?.data));
  const oL1 = await cobrar(C.tok.owner, mais, { establishment_id: C.L1 });
  check("o Dono cobra o Mais só pela L1: 201", oL1.status === 201, `${oL1.status} ${j(oL1.corpo)}`);

  console.log("  (f) o modelo da conta");
  const modelo = "Oi {nome}, pague {valor} por favor.";
  const p = await chamar(C.tok.fin, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_collection_message: modelo });
  check("(fixture) o Financeiro define a mensagem: 200", p.status === 200, `${p.status} ${j(p.corpo)}`);
  const l2 = await lista();
  const m2 = l2.cs.find((x) => x.customer_name === "Cob Mais") as Dado;
  check("a view devolve o modelo da conta", l2.r.corpo?.data?.message_template === modelo, String(l2.r.corpo?.data?.message_template));
  check("a mensagem usa o modelo com {nome} e {valor} trocados", String(m2?.message).startsWith("Oi Cob Mais, pague ") && String(m2?.message).includes("150,00") && !String(m2?.message).includes("{"), String(m2?.message));
  const wa = (() => { try { return decodeURIComponent(String(m2?.whatsapp_url).split("?text=")[1] ?? ""); } catch { return ""; } })();
  check("e o link leva a mesma mensagem", wa === m2?.message, wa);
}

// ---------------------------------------------------------------------------
// Seção 7: isolamento
// ---------------------------------------------------------------------------

async function secao7() {
  console.log("\nSeção 7: o Financeiro de um tenant não alcança o crédito do outro");
  const { A, B } = M!;
  const { prisma } = await import("@/lib/prisma");
  const alvo = (await (prisma as Dado).emporioCustomer.findFirst({ where: { tenant_id: A.tenantId, name: "M99 Atraso 20" } })) as Dado;
  check("(fixture) o cliente de A, com atraso, existe", !!alvo?.id);
  const limiteAntes = alvo?.fiado_limit === null || alvo?.fiado_limit === undefined ? null : n(alvo.fiado_limit);
  const liberacoesAntes = await (prisma as Dado).emporioCreditRelease.count({ where: { customer_id: alvo.id } });
  const cobrancasAntes = await prisma.emporioAuditLog.count({ where: { tenant_id: A.tenantId, action: "fiado.cobrar" } });

  const lido = await chamar(B.tok.fin, R.credit, "GET", `emporio/customers/${alvo.id}/credit`, undefined, alvo.id);
  check("ler /credit do cliente de A: 404", lido.status === 404, `${lido.status} ${j(lido.corpo)}`);
  check("e a resposta não vaza o nome nem o saldo", lido.status === 404 && !j(lido.corpo).includes("M99 Atraso 20"), j(lido.corpo));
  const def = await chamar(B.tok.fin, R.credit, "PATCH", `emporio/customers/${alvo.id}/credit`, { fiado_limit: 1 }, alvo.id);
  check("definir limite do cliente de A: 404", def.status === 404, `${def.status} ${j(def.corpo)}`);
  const lib = await chamar(B.tok.owner, R.releases, "POST", `emporio/customers/${alvo.id}/credit/releases`, { establishment_id: B.L1, reason: "Tentativa de outro tenant" }, alvo.id);
  check("liberar o cliente de A (com loja de B): 404", lib.status === 404, `${lib.status} ${j(lib.corpo)}`);
  const libA = await chamar(B.tok.owner, R.releases, "POST", `emporio/customers/${alvo.id}/credit/releases`, { establishment_id: A.L1, reason: "Tentativa com a loja de A" }, alvo.id);
  check("liberar o cliente de A (com loja de A): recusa, nunca 201", libA.status >= 400 && libA.status !== 0, `${libA.status} ${j(libA.corpo)}`);
  const cob = await chamar(B.tok.fin, R.collectCustomer, "POST", `emporio/customers/${alvo.id}/collections`, {}, alvo.id);
  check("cobrar o cliente de A: 404", cob.status === 404, `${cob.status} ${j(cob.corpo)}`);

  const lista = await chamar(B.tok.fin, R.collections, "GET", "emporio/finance/collections");
  check("finance/collections de B: 200", lista.status === 200, `${lista.status} ${j(lista.corpo)}`);
  check("e não lista cliente de A (nem de C)", lista.status === 200 && (lista.corpo?.data?.customers ?? []).length === 0 && !j(lista.corpo).includes(alvo.id), j(lista.corpo).slice(0, 300));
  const filtroA = await chamar(B.tok.fin, R.collections, "GET", `emporio/finance/collections?establishment_id=${A.L1}`);
  check("com a loja de A no filtro: não devolve 200 com dado de A", filtroA.status !== 0 && (filtroA.status !== 200 || (filtroA.corpo?.data?.customers ?? []).length === 0), `${filtroA.status}`);

  const pB = await chamar(B.tok.fin, R.settingsFiado, "PATCH", "emporio/settings/fiado", { fiado_due_days: 44 });
  const sA = (await (prisma as Dado).emporioSettings.findFirst({ where: { tenant_id: A.tenantId } })) as Dado;
  const sB = (await (prisma as Dado).emporioSettings.findFirst({ where: { tenant_id: B.tenantId } })) as Dado;
  check("mudar o prazo em B grava em B e não mexe nas configurações de A", pB.status === 200 && sB?.fiado_due_days === 44 && sA?.fiado_due_days !== 44, `${pB.status} B=${sB?.fiado_due_days} A=${sA?.fiado_due_days}`);

  const depois = (await (prisma as Dado).emporioCustomer.findFirst({ where: { id: alvo.id } })) as Dado;
  const limiteDepois = depois?.fiado_limit === null || depois?.fiado_limit === undefined ? null : n(depois.fiado_limit);
  check("nada mudou no cliente de A: limite, liberações e cobranças",
    limiteAntes === limiteDepois
    && (await (prisma as Dado).emporioCreditRelease.count({ where: { customer_id: alvo.id } })) === liberacoesAntes
    && (await prisma.emporioAuditLog.count({ where: { tenant_id: A.tenantId, action: "fiado.cobrar" } })) === cobrancasAntes,
    `${limiteAntes} -> ${limiteDepois}`);
}

// ---------------------------------------------------------------------------

async function limpar() {
  if (tenantIds.length === 0) return;
  const { prisma } = await import("@/lib/prisma");
  for (const id of tenantIds) {
    await prisma.emporioSale.updateMany({ where: { tenant_id: id }, data: { exchange_return_id: null, quote_id: null } }).catch(() => undefined);
  }
  const modelos = [
    "emporioCreditRelease", "emporioAuditLog", "cashMovement", "cashTransfer", "cashCount", "cardReceivable", "cardFeeRule", "emporioSalePayment", "emporioSaleReturnItem",
    "stockMovement", "emporioSaleItem", "emporioSaleReturn", "emporioCheck", "emporioQuoteItem", "emporioQuote", "emporioSale", "emporioPurchaseItem",
    "emporioPurchase", "emporioCustomer", "emporioSupplier", "cashHandover", "cashSession", "cashRegister", "emporioCounter", "emporioSettings",
    "financialPayment", "financialEntry", "userEstablishment", "establishment", "bankAccount", "contact", "user", "tenantProfile", "tenantFeature",
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
        M = { A: await montar("A"), B: await montar("B"), C: await montar("C") };
      });
      if (!M) {
        check("a montagem dos tenants terminou (sem ela as seções 2 a 7 não rodam)", false);
        return;
      }
      await rodar("2", secao2);
      await rodar("3", secao3);
      await rodar("4", secao4);
      await rodar("5", secao5);
      await rodar("6", secao6);
      await rodar("7", secao7);
    });
  } finally {
    await limpar();
  }
  console.log(falhas === 0 ? "\n✅ M99 verde" : `\n❌ M99: ${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
