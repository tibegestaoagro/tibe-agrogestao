import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir, exigirUma } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { dataCalendario, inicioDoDiaEmSaoPaulo, periodoDeDatasEmSaoPaulo } from "@/lib/dia-calendario";
import { conferirPeriodo, type Faixa, type Periodo } from "@/lib/emporio/periodo";
import { dinheiro, registrarNoHistorico } from "@/lib/emporio/historico";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import {
  entradasAbertas,
  listarBoletosAction,
  listarChequesAction,
  listarFiadoAction,
  saldoDaGaveta,
  saldoDaGerencia,
  saldosDasContas,
  type BoletoView,
  type ChequeView,
  type FiadoClienteView,
} from "@/lib/actions/emporio-caixa";
import {
  INCLUDE_CARTAO,
  conferirParcelaAction,
  desfazerConferenciaAction,
  estadoDaParcela,
  viewDoCartao,
  type EstadoDaParcela,
} from "@/lib/actions/emporio-conferencia-cartao";
import { lerQuantidadeDeContasAPagar, listarContasAPagarAction, type ContaAPagarView } from "@/lib/actions/emporio-despesas";

/**
 * Meu Empório, financeiro das lojas, entrega 1: a casa do Financeiro (Q215).
 *
 * Só lê. Nada daqui grava saldo (invariante 2): a posição de cada lugar é a
 * soma das movimentações, pelas mesmas funções que a tela de caixa já usa.
 */

const DIA_MS = 86_400_000;
// São Paulo é UTC-3 fixo desde 2019 (o mesmo deslocamento de `dia-calendario.ts`).
const MEIA_NOITE_SP_EM_UTC_MS = 3 * 3_600_000;
const PERIODO_MAXIMO_DIAS = 92;

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const arred2 = (n: number) => centavos(n) / 100;
const dia = (d: Date) => d.toISOString().slice(0, 10);
const dataValida = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());
/** O dia de calendário que `de` e `ate` carregam (meia-noite UTC), sem conversão de fuso. */
const diaDeCalendario = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

export type PosicaoView = {
  kind: "gaveta" | "gerencia" | "conta";
  id: string;
  name: string;
  establishment_id: string | null;
  balance: number;
};

export type HojeView = {
  positions: PosicaoView[];
  total_balance: number;
  payables_due: { count: number; total: number; items: ContaAPagarView[] };
  receivables_due: {
    fiado: { count: number; total: number };
    checks: { count: number; total: number };
    boletos: { count: number; total: number };
    cards: { count: number; total: number };
  };
  overdue_fiado: { customers: number; total: number };
  /** Entrega 3: pedidos de pagamento esperando aprovação (quem lê o Hoje, Dono, Gerente geral e Financeiro, vê todos). */
  pending_approvals: { count: number; total: number };
  /** Entrega 3: linhas de conta (movimentos e parcelas de cartão já devidas) sem carimbo nos últimos 30 dias. */
  unreconciled: { count: number; total: number };
  /** Frente B: parcelas de cartão a conferir (já caíram, dentro do prazo) e atrasadas (passou 1 dia útil sem conferência). */
  cards_to_confirm: { count: number; total: number };
  cards_overdue: { count: number; total: number };
  /** Frente C: cheques "A completar" (recebidos, com número, banco ou bom para faltando), nas lojas visíveis ou na do filtro. */
  checks_to_complete: { count: number; total: number };
};

export type CartaoAReceberView = {
  id: string;
  sale_id: string;
  establishment_id: string;
  establishment_name: string;
  bank_account_id: string;
  bank_account_name: string;
  installment: number;
  installments: number;
  gross_amount: number;
  net_amount: number;
  expected_on: string;
  /** Quando e quanto cai de fato (Q261): difere do previsto se a parcela foi antecipada. */
  effective_on: string;
  effective_net: number;
  fee_amount: number;
  anticipated: boolean;
  received: boolean;
  /** Taxas de cartão (Q254): nulos nas parcelas de antes da entrega. */
  acquirer_id: string | null;
  acquirer_name: string | null;
  brand: string | null;
  /** Frente A: a venda e o cliente da parcela, para os links. `customer_*` é nulo na venda sem cliente. */
  sale_number: number;
  customer_id: string | null;
  customer_name: string | null;
  /** Frente B: o estado da parcela, o que caiu de fato (nulo sem conferência) e a diferença com sinal (nula sem conferência; 0 se conferida sem diferença). */
  status: EstadoDaParcela;
  confirmed_net: number | null;
  adjustment: number | null;
};

export type { Faixa, Periodo };

export type ResumoAReceber = {
  overdue: Faixa;
  due_today: Faixa;
  upcoming: Faixa;
  received: Faixa & { expected_pct: number | null };
};

/** Uma linha de "Recebido no período" (A receber) e dos recebimentos da ficha do cliente. */
export type RecebimentoView = {
  id: string;
  /** `devolucao` só existe na ficha do cliente: o dinheiro devolvido, com `amount` negativo. */
  kind: "dinheiro" | "pix" | "cartao" | "fiado" | "cheque" | "boleto" | "devolucao";
  /** Dia de calendário (AAAA-MM-DD) em Brasília. */
  occurred_on: string;
  customer_id: string | null;
  customer_name: string | null;
  sale_id: string | null;
  sale_number: number | null;
  establishment_id: string | null;
  establishment_name: string | null;
  amount: number;
  /** Só no cheque: a situação dele. */
  check_status?: string;
};

export type AReceberView = {
  fiado: FiadoClienteView[];
  checks: ChequeView[];
  /** Q282: os boletos em aberto (os vencidos inclusive, com `overdue`). */
  boletos: BoletoView[];
  cards: CartaoAReceberView[];
};

export type ExtratoLinhaView = {
  kind: "movimento" | "cartao";
  id: string;
  occurred_on: string;
  direction: "entrada" | "saida";
  amount: number;
  origin: string;
  establishment_id: string | null;
  establishment_name: string | null;
  description: string;
  /** A venda que gerou a linha (PIX, dinheiro, cartão): o cliente e o número; nulos sem venda. */
  customer_name?: string | null;
  sale_number?: number | null;
  /** Frente A: ids para os links; nulos sem venda. */
  sale_id: string | null;
  customer_id: string | null;
  /** Só na linha de cartão (Q254); nulos nas demais e nas parcelas antigas. */
  acquirer_name?: string | null;
  brand?: string | null;
  /** Entrega 3: o carimbo de conciliação (só linha de conta; gaveta e gerência vêm nulos). */
  reconciled_at: string | null;
  reconciled_by: string | null;
  /** Só na linha de cartão conferida: o valor que caiu (o `amount` segue o previsto, que é o que entra no saldo; a diferença é a linha `ajuste_cartao`). */
  confirmed_net?: number | null;
};

export type LugarDoExtrato = { kind: "conta" | "gaveta" | "gerencia"; id: string };

export type ExtratoView = {
  /** O lugar do extrato; para gaveta e gerência o `id` é o da loja e o `name`, o dela. */
  place: { kind: "conta" | "gaveta" | "gerencia"; id: string; name: string };
  /** Só para `place.kind === "conta"`; nulo nos outros lugares. */
  account: { id: string; name: string; bank: string | null } | null;
  opening_balance: number;
  lines: ExtratoLinhaView[];
  closing_balance: number;
  /** Linhas de conta sem carimbo no período e a soma dos valores absolutos, antes do filtro `apenas_sem_carimbo`. */
  unreconciled_count: number;
  unreconciled_total: number;
};

/** A frase do movimento no extrato: as notas, ou o rótulo da origem. O estorno de cartão leva o rótulo na frente do motivo (Q368). */
function descricaoDoMovimento(m: { origin: string; notes: string | null }): string {
  const notas = m.notes?.trim();
  if (m.origin === "estorno_cartao") return notas ? `${ROTULO_ORIGEM.estorno_cartao}: ${notas}` : ROTULO_ORIGEM.estorno_cartao;
  return notas || ROTULO_ORIGEM[m.origin] || m.origin;
}

export const ROTULO_ORIGEM: Record<string, string> = {
  venda: "Venda",
  recebimento_fiado: "Fiado recebido",
  cancelamento_venda: "Venda cancelada",
  devolucao: "Devolução",
  implantacao: "Saldo inicial",
  transferencia: "Transferência",
  conferencia: "Conferência",
  cheque_compensado: "Cheque compensado",
  boleto_pago: "Boleto pago",
  estorno_cartao: "Estorno de cartão",
  pagamento_despesa: "Conta paga",
  sangria: "Sangria",
  malote: "Malote",
  reforco: "Reforço",
  entrega_gerencia: "Entrega à gerência",
  pagamento_compra: "Pagamento de compra",
  cartao: "Cartão",
  ajuste_cartao: "Ajuste da conferência do cartão",
};

/**
 * As posições (gaveta e gerência de cada loja, e as contas bancárias): cada saldo é a soma das movimentações.
 * `visiveis` recorta as lojas do alcance (nulo ou ausente: todas); as contas só entram com `comContas`.
 */
export async function lerPosicoes(
  db: TenantPrismaClient,
  opts: { lojaId?: string; visiveis?: Set<string> | null; comContas: boolean },
): Promise<PosicaoView[]> {
  const { lojaId, visiveis } = opts;
  const lojas = await db.establishment.findMany({
    where: {
      archived_at: null,
      ...(lojaId ? { id: lojaId } : visiveis ? { id: { in: [...visiveis] } } : {}),
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const positions: PosicaoView[] = [];
  for (const l of lojas) {
    positions.push({ kind: "gaveta", id: l.id, name: l.name, establishment_id: l.id, balance: (await saldoDaGaveta(db, l.id)) / 100 });
    positions.push({ kind: "gerencia", id: l.id, name: l.name, establishment_id: l.id, balance: (await saldoDaGerencia(db, l.id)) / 100 });
  }
  if (opts.comContas) {
    const contas = await db.bankAccount.findMany({ where: { archived_at: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const saldos = await saldosDasContas(db);
    for (const c of contas) {
      positions.push({ kind: "conta", id: c.id, name: c.name, establishment_id: null, balance: (saldos.get(c.id) ?? 0) / 100 });
    }
  }
  return positions;
}

/** O que existe hoje em cada lugar, com o que vence hoje a pagar e a receber. */
export async function lerResumoHojeAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string } = {},
): Promise<ActionResult<HojeView>> {
  const neg = await exigir(db, ator, "dinheiro", "ver a posição de caixa");
  if (neg) return neg;
  const lojaId = typeof opts?.establishment_id === "string" && opts.establishment_id ? opts.establishment_id : undefined;
  if (lojaId && !(await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true } }))) {
    return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }

  const hoje = hojeEmBrasilia();
  const fimDoDia = new Date(hoje.getTime() + DIA_MS - 1);

  const positions = await lerPosicoes(db, { lojaId, comContas: true });
  const total = positions.reduce((s, p) => s + centavos(p.balance), 0) / 100;

  const pagar = await listarContasAPagarAction(db, ator, {
    establishment_id: lojaId,
    status: "pending",
    ate: fimDoDia,
    limit: 500,
  });
  if (!pagar.ok) return pagar;
  const itens = pagar.data;
  // A lista tem teto de 500; a contagem é do filtro inteiro.
  const quantas = await lerQuantidadeDeContasAPagar(db, ator, { establishment_id: lojaId, status: "pending", ate: fimDoDia });
  if (!quantas.ok) return quantas;

  const visiveis = await lojasDoAtor(db, ator);
  const abertas = (
    await entradasAbertas(db, {
      emporio_customer_id: { not: null },
      ...(lojaId ? { establishment_id: lojaId } : visiveis ? { establishment_id: { in: [...visiveis] } } : {}),
    })
  ).filter((e) => e.effective_due_date.getTime() <= fimDoDia.getTime());
  const lojasDoFiltro = lojaId ? { establishment_id: lojaId } : {};
  const cheques = await db.emporioCheck.findMany({
    where: { status: { in: ["recebido", "depositado"] }, good_for: { lte: hoje }, ...lojasDoFiltro },
    select: { amount: true },
  });
  const aCompletar = await db.emporioCheck.findMany({
    where: {
      status: "recebido",
      OR: [{ number: null }, { bank: null }, { good_for: null }],
      ...(lojaId ? { establishment_id: lojaId } : visiveis ? { establishment_id: { in: [...visiveis] } } : {}),
    },
    select: { amount: true },
  });
  const boletos = await db.emporioBoleto.findMany({
    where: { status: "aberto", due_on: { lte: hoje }, ...lojasDoFiltro },
    select: { amount: true },
  });
  const cartoes = await db.cardReceivable.findMany({
    where: { canceled_at: null, effective_on: hoje, ...lojasDoFiltro },
    select: { effective_net: true },
  });
  const fiado = await listarFiadoAction(db, ator, { establishment_id: lojaId });
  if (!fiado.ok) return fiado;
  const vencidos = fiado.data.filter((c) => c.overdue_amount > 0);
  // Com filtro de loja: os pedidos pela gaveta daquela loja, mais os pela conta bancária (a conta não é de loja).
  const pedidos = await db.emporioPaymentRequest.findMany({
    where: { status: "pendente", ...(lojaId ? { OR: [{ establishment_id: lojaId }, { establishment_id: null }] } : {}) },
    select: { total: true },
  });
  // `unreconciled` (sem carimbo) não filtra por loja de propósito: conta bancária não é de loja.
  const desdeCarimbo = new Date(hoje.getTime() - 30 * DIA_MS);
  const [movsSem, cartoesSem] = await Promise.all([
    db.cashMovement.findMany({
      where: { bank_account_id: { not: null }, reconciled_at: null, occurred_at: { gte: new Date(desdeCarimbo.getTime() + MEIA_NOITE_SP_EM_UTC_MS), lt: new Date(hoje.getTime() + DIA_MS + MEIA_NOITE_SP_EM_UTC_MS) } },
      select: { amount: true },
    }),
    db.cardReceivable.findMany({
      where: { canceled_at: null, reconciled_at: null, effective_on: { gte: desdeCarimbo, lte: hoje } },
      select: { effective_net: true },
    }),
  ]);
  const semCarimbo = [...movsSem.map((m) => m.amount), ...cartoesSem.map((c) => c.effective_net)];

  // Frente B: o cartão que já caiu e falta conferir, dentro do prazo (a conferir) e fora dele (atrasadas).
  const aberto = await db.cardReceivable.findMany({
    where: { canceled_at: null, reconciled_at: null, effective_on: { lte: hoje }, sale: { status: { not: "cancelada" } }, ...lojasDoFiltro },
    select: { effective_on: true, reconciled_at: true, effective_net: true },
  });
  const doEstado = (estado: EstadoDaParcela) => {
    const xs = aberto.filter((p) => estadoDaParcela(p, hoje) === estado);
    return { count: xs.length, total: xs.reduce((s, p) => s + centavos(decToNum(p.effective_net) ?? 0), 0) / 100 };
  };

  return ok({
    positions,
    total_balance: total,
    payables_due: {
      count: quantas.data,
      total: itens.reduce((s, i) => s + centavos(i.open_amount), 0) / 100,
      items: itens,
    },
    receivables_due: {
      fiado: {
        count: new Set(abertas.map((e) => e.emporio_customer_id)).size,
        total: abertas.reduce((s, e) => s + e.open_cent, 0) / 100,
      },
      checks: { count: cheques.length, total: cheques.reduce((s, c) => s + centavos(decToNum(c.amount) ?? 0), 0) / 100 },
      boletos: { count: boletos.length, total: boletos.reduce((s, b) => s + centavos(decToNum(b.amount) ?? 0), 0) / 100 },
      cards: { count: cartoes.length, total: cartoes.reduce((s, c) => s + centavos(decToNum(c.effective_net) ?? 0), 0) / 100 },
    },
    overdue_fiado: {
      customers: vencidos.length,
      total: arred2(vencidos.reduce((s, c) => s + c.overdue_amount, 0)),
    },
    pending_approvals: { count: pedidos.length, total: pedidos.reduce((s, p) => s + centavos(decToNum(p.total) ?? 0), 0) / 100 },
    unreconciled: { count: semCarimbo.length, total: semCarimbo.reduce((s, v) => s + centavos(Math.abs(decToNum(v) ?? 0)), 0) / 100 },
    cards_to_confirm: doEstado("a_conferir"),
    cards_overdue: doEstado("atrasada"),
    checks_to_complete: {
      count: aCompletar.length,
      total: aCompletar.reduce((s, c) => s + centavos(decToNum(c.amount) ?? 0), 0) / 100,
    },
  });
}

/** O fiado por cliente, os cheques em carteira e as parcelas de cartão que ainda vão cair (ou caem hoje). */
export async function listarContasAReceberAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; de?: string; ate?: string } = {},
): Promise<ActionResult<AReceberView & { summary: ResumoAReceber; received_items: RecebimentoView[]; period: Periodo }>> {
  const neg = await exigir(db, ator, "dinheiro", "ver as contas a receber");
  if (neg) return neg;
  const lojaId = typeof opts?.establishment_id === "string" && opts.establishment_id ? opts.establishment_id : undefined;
  if (lojaId && !(await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true } }))) {
    return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }
  const hoje = hojeEmBrasilia();
  const periodo = conferirPeriodo(opts?.de, opts?.ate, hoje);
  if (!periodo.ok) return periodo;
  const fiado = await listarFiadoAction(db, ator, { establishment_id: lojaId });
  if (!fiado.ok) return fiado;
  const carteira = await listarChequesAction(db, ator, { establishment_id: lojaId });
  if (!carteira.ok) return carteira;
  const boletos = await listarBoletosAction(db, ator, { establishment_id: lojaId, status: "aberto" });
  if (!boletos.ok) return boletos;

  // Toda soma respeita as lojas do ator (quem vê uma loja só soma a dele).
  const visiveis = await lojasDoAtor(db, ator);
  const lojas = lojaId ? { establishment_id: lojaId } : visiveis ? { establishment_id: { in: [...visiveis] } } : {};
  const parcelas = await db.cardReceivable.findMany({
    // Frente B: as que ainda vão cair, as passadas que seguem sem conferência e as conferidas dos últimos 7 dias,
    // que ficam à vista para o Desfazer (venda cancelada fica fora). As conferidas não entram em soma nenhuma:
    // a data delas é passada e o estado não é Atrasada.
    where: {
      canceled_at: null,
      sale: { status: { not: "cancelada" } },
      OR: [
        { effective_on: { gte: hoje } },
        { reconciled_at: null },
        { effective_on: { gte: new Date(hoje.getTime() - 7 * DIA_MS) } },
      ],
      ...lojas,
    },
    include: INCLUDE_CARTAO,
    orderBy: [{ effective_on: "asc" }, { installment: "asc" }],
  });
  const cheques = carteira.data.filter((c) => c.status === "recebido" || c.status === "depositado");
  const recebidos = await recebidosNoPeriodo(db, lojas, periodo.data, hoje);

  const hojeIso = dia(hoje);
  const soma = (xs: { cent: number }[]): Faixa => ({ total: xs.reduce((s, x) => s + x.cent, 0) / 100, count: xs.length });
  // O fiado tem uma linha por cliente: a quantidade é a de clientes com valor naquele recorte.
  const faixaDoFiado = (campo: "overdue_amount" | "due_today_amount" | "upcoming_amount") => {
    const com = fiado.data.filter((c) => c[campo] > 0);
    return com.map((c) => ({ cent: centavos(c[campo]) }));
  };
  const doCheque = (c: ChequeView) => ({ cent: centavos(c.amount), em: c.good_for });
  const doBoleto = (b: BoletoView) => ({ cent: centavos(b.amount), em: b.due_on as string | null });
  // O cheque sem data (A completar, Q354) não tem vencimento: fica fora de todas as faixas.
  const recorte = (f: (em: string) => boolean) => [
    ...cheques.map(doCheque).filter((x) => x.em !== null && f(x.em)),
    ...boletos.data.map(doBoleto).filter((x) => x.em !== null && f(x.em)),
  ];
  const doCartao = (f: (em: string) => boolean) =>
    parcelas.filter((p) => f(dia(p.effective_on))).map((p) => ({ cent: centavos(decToNum(p.effective_net) ?? 0) }));

  // O previsto do período que segue em aberto: o aberto de cada lançamento (não o valor original) e o cartão que ainda não caiu.
  const noPeriodo = (em: string) => em >= periodo.data.de && em <= periodo.data.ate;
  const previstoCent =
    fiado.data.flatMap((c) => c.entries).filter((e) => e.due_date && noPeriodo(e.due_date.slice(0, 10))).reduce((s, e) => s + centavos(e.open), 0) +
    recorte(noPeriodo).reduce((s, x) => s + x.cent, 0) +
    doCartao((em) => em > hojeIso && noPeriodo(em)).reduce((s, x) => s + x.cent, 0);
  const recebidoCent = recebidos.reduce((s, r) => s + centavos(r.amount), 0);
  const base = recebidoCent + previstoCent;

  const summary: ResumoAReceber = {
    overdue: soma([
      ...faixaDoFiado("overdue_amount"),
      ...recorte((em) => em < hojeIso),
      ...parcelas.filter((p) => estadoDaParcela(p, hoje) === "atrasada").map((p) => ({ cent: centavos(decToNum(p.effective_net) ?? 0) })),
    ]),
    due_today: soma([...faixaDoFiado("due_today_amount"), ...recorte((em) => em === hojeIso), ...doCartao((em) => em === hojeIso)]),
    upcoming: soma([...faixaDoFiado("upcoming_amount"), ...recorte((em) => em > hojeIso), ...doCartao((em) => em > hojeIso)]),
    received: { total: recebidoCent / 100, count: recebidos.length, expected_pct: base > 0 ? Math.round((recebidoCent / base) * 100) : null },
  };

  return ok({
    summary,
    received_items: recebidos,
    period: periodo.data,
    fiado: fiado.data,
    checks: cheques,
    boletos: boletos.data,
    cards: parcelas.map((p) => viewDoCartao(p, hoje)),
  });
}

/**
 * O que entrou no período e já foi A receber: fiado recebido, cheque compensado, boleto pago e
 * parcela de cartão caída (até hoje). O dinheiro e o PIX do ato da venda ficam fora. Venda
 * cancelada fica fora; os instantes se medem pelo dia de Brasília (o das 22h do último dia vale o mês).
 */
async function recebidosNoPeriodo(
  db: TenantPrismaClient,
  lojas: { establishment_id?: string | { in: string[] } },
  periodo: Periodo,
  hoje: Date,
): Promise<RecebimentoView[]> {
  const { since, until } = periodoDeDatasEmSaoPaulo(periodo.de, periodo.ate);
  const deDia = dataCalendario(periodo.de);
  const ateDia = dataCalendario(periodo.ate);
  const ateCartao = ateDia.getTime() < hoje.getTime() ? ateDia : hoje;
  const nome = { select: { name: true } };

  const [fiados, cheques, boletos, cartoes] = await Promise.all([
    db.cashMovement.findMany({
      where: {
        origin: "recebimento_fiado",
        direction: "entrada",
        occurred_at: { gte: since, lte: until },
        financial_payment: { entry: lojas },
        OR: [{ sale_id: null }, { sale: { status: "concluida" } }],
      },
      include: {
        sale: { select: { number: true } },
        financial_payment: {
          select: { entry: { select: { emporio_customer_id: true, establishment_id: true, emporio_customer: nome, establishment: nome } } },
        },
      },
    }),
    db.emporioCheck.findMany({
      where: { status: "compensado", cleared_at: { gte: since, lte: until }, ...lojas },
      include: { customer: nome, establishment: nome, sale: { select: { number: true } } },
    }),
    db.emporioBoleto.findMany({
      where: { status: "pago", paid_on: { gte: deDia, lte: ateDia }, ...lojas },
      include: { customer: nome, establishment: nome, sale: { select: { number: true } } },
    }),
    db.cardReceivable.findMany({
      where: { canceled_at: null, effective_on: { gte: deDia, lte: ateCartao }, sale: { status: "concluida" }, ...lojas },
      include: { establishment: nome, sale: { select: { number: true, customer_id: true, customer: nome } } },
    }),
  ]);

  const linhas: RecebimentoView[] = [
    ...fiados.map((m): RecebimentoView => {
      const e = m.financial_payment?.entry;
      return {
        id: m.id,
        kind: "fiado",
        occurred_on: dia(inicioDoDiaEmSaoPaulo(m.occurred_at)),
        customer_id: e?.emporio_customer_id ?? null,
        customer_name: e?.emporio_customer?.name ?? null,
        sale_id: m.sale_id,
        sale_number: m.sale?.number ?? null,
        establishment_id: e?.establishment_id ?? null,
        establishment_name: e?.establishment?.name ?? null,
        amount: decToNum(m.amount) ?? 0,
      };
    }),
    ...cheques.map((c): RecebimentoView => ({
      id: c.id,
      kind: "cheque",
      occurred_on: dia(inicioDoDiaEmSaoPaulo(c.cleared_at as Date)),
      customer_id: c.customer_id,
      customer_name: c.customer.name,
      sale_id: c.sale_id,
      sale_number: c.sale.number,
      establishment_id: c.establishment_id,
      establishment_name: c.establishment.name,
      amount: decToNum(c.amount) ?? 0,
      check_status: c.status,
    })),
    ...boletos.map((b): RecebimentoView => ({
      id: b.id,
      kind: "boleto",
      occurred_on: dia(b.paid_on as Date),
      customer_id: b.customer_id,
      customer_name: b.customer.name,
      sale_id: b.sale_id,
      sale_number: b.sale.number,
      establishment_id: b.establishment_id,
      establishment_name: b.establishment.name,
      amount: decToNum(b.amount) ?? 0,
    })),
    ...cartoes.map((p): RecebimentoView => ({
      id: p.id,
      kind: "cartao",
      occurred_on: dia(p.effective_on),
      customer_id: p.sale.customer_id,
      customer_name: p.sale.customer?.name ?? null,
      sale_id: p.sale_id,
      sale_number: p.sale.number,
      establishment_id: p.establishment_id,
      establishment_name: p.establishment.name,
      amount: decToNum(p.effective_net) ?? 0,
    })),
  ];
  return linhas.sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.id.localeCompare(a.id));
}

/**
 * O extrato de uma conta no período: os movimentos mais as parcelas de cartão
 * (linhas iguais, como o banco mostra). `de` e `ate` são o dia de calendário,
 * como meia-noite UTC; o período é de `de` ao fim de `ate`, em São Paulo.
 */
export async function lerExtratoDaContaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { bank_account_id: string; de: Date; ate: Date },
): Promise<ActionResult<ExtratoView>> {
  return lerExtratoAction(db, ator, {
    lugar: { kind: "conta", id: input?.bank_account_id },
    de: input?.de,
    ate: input?.ate,
  });
}

/**
 * O extrato de um lugar do bloco 1 (conta, gaveta ou gerência de uma loja) no
 * período. Conta: movimentos mais parcelas de cartão. Gaveta e gerência: só
 * movimentos, pelo mesmo filtro e pela mesma soma da posição do Hoje, para o
 * fechamento bater com ela. Permissão: conta pede gestor ou dinheiro; gaveta,
 * vendedor da loja ou dinheiro; gerência, gestor da loja ou dinheiro.
 */
export async function lerExtratoAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { lugar: LugarDoExtrato; de: Date; ate: Date; apenas_sem_carimbo?: boolean },
): Promise<ActionResult<ExtratoView>> {
  const kind = input?.lugar?.kind;
  if (kind !== "conta" && kind !== "gaveta" && kind !== "gerencia") {
    return fail("VALIDATION_ERROR", "Escolha o lugar: conta, gaveta ou gerência.", 422, "kind");
  }
  const campoId = kind === "conta" ? "bank_account_id" : "id";
  const lugarId = typeof input.lugar.id === "string" ? input.lugar.id.trim() : "";
  // Primeiro a ação em si (403); a loja do extrato se confere depois de achá-la, e loja que o ator não vê
  // é 404, como em `lerCaixaAction`: assim o Vendedor da loja A e o Financeiro recebem a mesma resposta
  // para uma loja de outra conta de cliente.
  const acoesDaLoja: ["vendedor_da_loja" | "gestor_da_loja", "dinheiro"] = [
    kind === "gaveta" ? "vendedor_da_loja" : "gestor_da_loja",
    "dinheiro",
  ];
  const oQue = kind === "conta" ? "ver o extrato de uma conta" : kind === "gaveta" ? "ver o extrato da gaveta" : "ver o extrato da gerência";
  const neg =
    kind === "conta"
      ? await exigirUma(db, ator, ["gestor_da_loja", "dinheiro"], oQue)
      : await exigirUma(db, ator, acoesDaLoja, oQue);
  if (neg) return neg;
  if (!lugarId) {
    return fail("VALIDATION_ERROR", kind === "conta" ? "Escolha a conta." : "Escolha a loja.", 422, campoId);
  }
  if (!dataValida(input.de)) return fail("VALIDATION_ERROR", "Informe uma data inicial válida.", 422, "de");
  if (!dataValida(input.ate)) return fail("VALIDATION_ERROR", "Informe uma data final válida.", 422, "ate");
  const deDia = diaDeCalendario(input.de);
  const ateDia = diaDeCalendario(input.ate);
  if (ateDia.getTime() < deDia.getTime()) {
    return fail("VALIDATION_ERROR", "A data final não pode ser antes da inicial.", 422, "ate");
  }
  if ((ateDia.getTime() - deDia.getTime()) / DIA_MS + 1 > PERIODO_MAXIMO_DIAS) {
    return fail("VALIDATION_ERROR", `O período do extrato é de até ${PERIODO_MAXIMO_DIAS} dias.`, 422, "ate");
  }
  let conta: { id: string; name: string; bank: string | null } | null = null;
  let lugar: { kind: "conta" | "gaveta" | "gerencia"; id: string; name: string };
  let ondeMovimentos: { bank_account_id: string } | { establishment_id: string } | { manager_establishment_id: string };
  if (kind === "conta") {
    conta = await db.bankAccount.findFirst({ where: { id: lugarId }, select: { id: true, name: true, bank: true } });
    if (!conta) return fail("NOT_FOUND", "Conta não encontrada.", 404, "bank_account_id");
    lugar = { kind, id: conta.id, name: conta.name };
    ondeMovimentos = { bank_account_id: conta.id };
  } else {
    const loja = await db.establishment.findFirst({ where: { id: lugarId }, select: { id: true, name: true } });
    if (!loja) return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "id");
    const negLoja = await exigirUma(db, ator, acoesDaLoja, oQue, loja.id);
    if (negLoja) return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "id");
    lugar = { kind, id: loja.id, name: loja.name };
    // O mesmo filtro de `saldoDaGaveta` e `saldoDaGerencia`, que alimentam o bloco 1 do Hoje.
    ondeMovimentos = kind === "gaveta" ? { establishment_id: loja.id } : { manager_establishment_id: loja.id };
  }

  const desde = new Date(deDia.getTime() + MEIA_NOITE_SP_EM_UTC_MS);
  const ate = new Date(ateDia.getTime() + DIA_MS + MEIA_NOITE_SP_EM_UTC_MS);

  const [antes, antesCartao, movs, parcelas] = await Promise.all([
    db.cashMovement.groupBy({
      by: ["direction"],
      where: { ...ondeMovimentos, occurred_at: { lt: desde } },
      _sum: { amount: true },
    }),
    conta
      ? db.cardReceivable.aggregate({
          where: { bank_account_id: conta.id, canceled_at: null, effective_on: { lt: deDia } },
          _sum: { effective_net: true },
        })
      : null,
    db.cashMovement.findMany({
      where: { ...ondeMovimentos, occurred_at: { gte: desde, lt: ate } },
      include: {
        establishment: { select: { name: true } },
        // O PIX e a transferência caem na conta sem loja: a venda diz a loja e o cliente da linha.
        sale: { select: { number: true, customer_id: true, customer: { select: { name: true } }, establishment: { select: { name: true } } } },
      },
      orderBy: [{ occurred_at: "asc" }, { created_at: "asc" }],
    }),
    conta
      ? db.cardReceivable.findMany({
          where: { bank_account_id: conta.id, canceled_at: null, effective_on: { gte: deDia, lte: ateDia } },
          include: {
            establishment: { select: { name: true } },
            acquirer: { select: { name: true } },
            sale: { select: { number: true, customer_id: true, customer: { select: { name: true } } } },
          },
          orderBy: [{ effective_on: "asc" }, { installment: "asc" }],
        })
      : [],
  ]);

  let abertura = centavos(decToNum(antesCartao?._sum.effective_net) ?? 0);
  for (const l of antes) {
    const v = centavos(decToNum(l._sum.amount) ?? 0);
    abertura += l.direction === "entrada" ? v : -v;
  }

  // Quem carimbou, por nome (só conta tem carimbo; gaveta e gerência nunca o têm).
  const idsCarimbadores = [
    ...new Set(
      [...movs, ...parcelas].map((l) => l.reconciled_by_user_id).filter((u): u is string => typeof u === "string" && !!u),
    ),
  ];
  const nomes = new Map<string, string>(
    idsCarimbadores.length
      ? (await db.user.findMany({ where: { id: { in: idsCarimbadores } }, select: { id: true, name: true } })).map((u) => [u.id, u.name])
      : [],
  );
  const carimbo = (r: { reconciled_at: Date | null; reconciled_by_user_id: string | null }) => ({
    reconciled_at: r.reconciled_at ? r.reconciled_at.toISOString() : null,
    reconciled_by: r.reconciled_at && r.reconciled_by_user_id ? (nomes.get(r.reconciled_by_user_id) ?? null) : null,
  });

  const todas: ExtratoLinhaView[] = [
    ...movs.map((m): ExtratoLinhaView => ({
      kind: "movimento",
      id: m.id,
      occurred_on: dia(inicioDoDiaEmSaoPaulo(m.occurred_at)),
      direction: m.direction,
      amount: decToNum(m.amount) ?? 0,
      origin: m.origin,
      // O movimento da gerência grava `manager_establishment_id`, não `establishment_id`: a loja é a do lugar.
      establishment_id: m.establishment_id ?? m.manager_establishment_id ?? null,
      establishment_name:
        m.establishment?.name ?? (m.manager_establishment_id ? lugar.name : null) ?? m.sale?.establishment.name ?? null,
      description: descricaoDoMovimento(m),
      customer_name: m.sale?.customer?.name ?? null,
      sale_number: m.sale?.number ?? null,
      sale_id: m.sale_id,
      customer_id: m.sale?.customer_id ?? null,
      ...carimbo(m),
    })),
    ...parcelas.map((p): ExtratoLinhaView => ({
      kind: "cartao",
      id: p.id,
      occurred_on: dia(p.effective_on),
      direction: "entrada",
      amount: decToNum(p.effective_net) ?? 0,
      origin: "cartao",
      establishment_id: p.establishment_id,
      establishment_name: p.establishment.name,
      description: `Cartão, parcela ${p.installment}/${p.installments}`,
      customer_name: p.sale?.customer?.name ?? null,
      sale_number: p.sale?.number ?? null,
      sale_id: p.sale_id,
      customer_id: p.sale?.customer_id ?? null,
      acquirer_name: p.acquirer?.name ?? null,
      brand: p.brand,
      confirmed_net: decToNum(p.confirmed_net),
      ...carimbo(p),
    })),
  ].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  // Frente B: o ajuste da conferência fica logo abaixo da linha de cartão a que pertence (quando ela está no período).
  const parcelaDoAjuste = new Map(movs.filter((m) => m.origin === "ajuste_cartao" && m.card_receivable_id).map((m) => [m.id, m.card_receivable_id as string]));
  const idsDeCartao = new Set(todas.filter((l) => l.kind === "cartao").map((l) => l.id));
  const ajustesDe = new Map<string, ExtratoLinhaView[]>();
  const ordenadas: ExtratoLinhaView[] = [];
  for (const l of todas) {
    const pai = l.kind === "movimento" ? parcelaDoAjuste.get(l.id) : undefined;
    if (pai && idsDeCartao.has(pai)) ajustesDe.set(pai, [...(ajustesDe.get(pai) ?? []), l]);
    else ordenadas.push(l);
  }
  todas.length = 0;
  for (const l of ordenadas) {
    todas.push(l);
    if (l.kind === "cartao") todas.push(...(ajustesDe.get(l.id) ?? []));
  }

  // O total sem carimbo se calcula ANTES do filtro, para o aviso não mudar com ele.
  const semCarimbo = conta ? todas.filter((l) => l.reconciled_at === null) : [];
  const linhas = input.apenas_sem_carimbo === true ? todas.filter((l) => l.reconciled_at === null) : todas;

  const variacao = todas.reduce((s, l) => s + (l.direction === "entrada" ? centavos(l.amount) : -centavos(l.amount)), 0);
  return ok({
    place: lugar,
    account: conta ? { id: conta.id, name: conta.name, bank: conta.bank } : null,
    opening_balance: abertura / 100,
    lines: linhas,
    closing_balance: (abertura + variacao) / 100,
    unreconciled_count: semCarimbo.length,
    unreconciled_total: semCarimbo.reduce((s, l) => s + centavos(Math.abs(l.amount)), 0) / 100,
  });
}

type KindDaLinha = "movimento" | "cartao";
type LinhaDoCarimbo = {
  conta_id: string | null;
  descricao: string;
  valor: number;
  dia: Date;
  carimbada: boolean;
};

const diaBr = (d: Date) => `${dia(d).slice(8, 10)}/${dia(d).slice(5, 7)}`;

/** Acha a linha de conta a carimbar; devolve a recusa quando não existe ou não é de conta. */
async function acharLinhaDeConta(
  db: TenantPrismaClient,
  input: { kind: KindDaLinha; id: string },
): Promise<{ linha: LinhaDoCarimbo } | { erro: ActionResult<never> }> {
  if (input?.kind !== "movimento" && input?.kind !== "cartao") {
    return { erro: fail("VALIDATION_ERROR", "Escolha o tipo da linha: movimento ou cartão.", 422, "kind") };
  }
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!id) return { erro: fail("VALIDATION_ERROR", "Escolha a linha.", 422, "id") };
  if (input.kind === "movimento") {
    const m = await db.cashMovement.findFirst({ where: { id } });
    if (!m) return { erro: fail("NOT_FOUND", "Linha não encontrada.", 404, "id") };
    if (!m.bank_account_id) {
      return { erro: fail("LINHA_NAO_E_DE_CONTA", "Só linha de conta bancária leva carimbo de conciliação.", 422, "id") };
    }
    return {
      linha: {
        conta_id: m.bank_account_id,
        descricao: descricaoDoMovimento(m),
        valor: decToNum(m.amount) ?? 0,
        dia: inicioDoDiaEmSaoPaulo(m.occurred_at),
        carimbada: !!m.reconciled_at,
      },
    };
  }
  const p = await db.cardReceivable.findFirst({ where: { id, canceled_at: null } });
  if (!p) return { erro: fail("NOT_FOUND", "Linha não encontrada.", 404, "id") };
  return {
    linha: {
      conta_id: p.bank_account_id,
      descricao: `Cartão, parcela ${p.installment}/${p.installments}`,
      valor: decToNum(p.effective_net) ?? 0,
      dia: p.effective_on,
      carimbada: !!p.reconciled_at,
    },
  };
}

/** Marca a linha do extrato como conferida com o banco. Não mexe em valor nem em saldo. */
export async function carimbarLinhaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { kind: KindDaLinha; id: string; received_amount?: number },
): Promise<ActionResult<{ kind: KindDaLinha; id: string; reconciled_at: string; reconciled_by: string }>> {
  const neg = await exigir(db, ator, "dinheiro", "carimbar o extrato");
  if (neg) return neg;
  const a = await acharLinhaDeConta(db, input);
  if ("erro" in a) return a.erro;
  const { linha } = a;
  if (linha.carimbada) return fail("JA_CARIMBADO", "Esta linha já tem carimbo.", 409, "id");
  const id = input.id.trim();
  // Q352: na linha de cartão, carimbar É conferir a parcela (o valor padrão é o previsto).
  if (input.kind === "cartao") {
    const r = await conferirParcelaAction(db, ator, id, { received_amount: input.received_amount ?? linha.valor });
    if (!r.ok) return r.code === "JA_CONFERIDA" ? fail("JA_CARIMBADO", "Esta linha já tem carimbo.", 409, "id") : r;
    return ok({ kind: "cartao", id, reconciled_at: r.data.reconciled_at, reconciled_by: r.data.reconciled_by ?? "" });
  }
  const agora = new Date();
  const quem = await db.user.findFirst({ where: { id: ator.id }, select: { name: true } });
  const gravou = await db.$transaction(async (tx) => {
    const alvo = { where: { id, reconciled_at: null }, data: { reconciled_at: agora, reconciled_by_user_id: ator.id } };
    const r = input.kind === "movimento" ? await tx.cashMovement.updateMany(alvo) : await tx.cardReceivable.updateMany(alvo);
    if (r.count === 0) return false;
    await registrarNoHistorico(tx, ator, {
      action: "conciliacao.carimbar",
      target_type: "conta",
      target_id: linha.conta_id,
      summary: `Carimbou ${linha.descricao}, ${dinheiro(linha.valor)} de ${diaBr(linha.dia)}`,
    });
    return true;
  });
  if (!gravou) return fail("JA_CARIMBADO", "Esta linha já tem carimbo.", 409, "id");
  return ok({ kind: input.kind, id, reconciled_at: agora.toISOString(), reconciled_by: quem?.name ?? "" });
}

/** Tira o carimbo da linha (a conferência foi um engano). */
export async function descarimbarLinhaAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: { kind: KindDaLinha; id: string },
): Promise<ActionResult<{ kind: KindDaLinha; id: string }>> {
  const neg = await exigir(db, ator, "dinheiro", "retirar o carimbo do extrato");
  if (neg) return neg;
  const a = await acharLinhaDeConta(db, input);
  if ("erro" in a) return a.erro;
  const { linha } = a;
  if (!linha.carimbada) return fail("SEM_CARIMBO", "Esta linha não tem carimbo.", 409, "id");
  const id = input.id.trim();
  // Q352: na linha de cartão, tirar o carimbo É desfazer a conferência.
  if (input.kind === "cartao") {
    const r = await desfazerConferenciaAction(db, ator, id, { reason: "Carimbo retirado no extrato" });
    if (!r.ok) return r.code === "NAO_CONFERIDA" ? fail("SEM_CARIMBO", "Esta linha não tem carimbo.", 409, "id") : r;
    return ok({ kind: "cartao", id });
  }
  const limpou = await db.$transaction(async (tx) => {
    const alvo = { where: { id, reconciled_at: { not: null } }, data: { reconciled_at: null, reconciled_by_user_id: null } };
    const r = input.kind === "movimento" ? await tx.cashMovement.updateMany(alvo) : await tx.cardReceivable.updateMany(alvo);
    if (r.count === 0) return false;
    await registrarNoHistorico(tx, ator, {
      action: "conciliacao.descarimbar",
      target_type: "conta",
      target_id: linha.conta_id,
      summary: `Retirou o carimbo de ${linha.descricao}, ${dinheiro(linha.valor)} de ${diaBr(linha.dia)}`,
    });
    return true;
  });
  if (!limpou) return fail("SEM_CARIMBO", "Esta linha não tem carimbo.", 409, "id");
  return ok({ kind: input.kind, id });
}
