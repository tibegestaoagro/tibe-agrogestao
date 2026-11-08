import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir, exigirUma } from "@/lib/emporio/papel";
import { hojeEmBrasilia } from "@/lib/emporio/cartao";
import { inicioDoDiaEmSaoPaulo } from "@/lib/dia-calendario";
import { lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";
import {
  entradasAbertas,
  listarChequesAction,
  listarFiadoAction,
  saldoDaGaveta,
  saldoDaGerencia,
  saldosDasContas,
  type ChequeView,
  type FiadoClienteView,
} from "@/lib/actions/emporio-caixa";
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
    cards: { count: number; total: number };
  };
  overdue_fiado: { customers: number; total: number };
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
  received: boolean;
};

export type AReceberView = {
  fiado: FiadoClienteView[];
  checks: ChequeView[];
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
};

const ROTULO_ORIGEM: Record<string, string> = {
  venda: "Venda",
  recebimento_fiado: "Fiado recebido",
  cancelamento_venda: "Venda cancelada",
  devolucao: "Devolução",
  implantacao: "Saldo inicial",
  transferencia: "Transferência",
  conferencia: "Conferência",
  cheque_compensado: "Cheque compensado",
  estorno_cartao: "Estorno de cartão",
  pagamento_despesa: "Conta paga",
  sangria: "Sangria",
  malote: "Malote",
  reforco: "Reforço",
  entrega_gerencia: "Entrega à gerência",
  pagamento_compra: "Pagamento de compra",
};

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

  const lojas = await db.establishment.findMany({
    where: { archived_at: null, ...(lojaId ? { id: lojaId } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const positions: PosicaoView[] = [];
  for (const l of lojas) {
    positions.push({ kind: "gaveta", id: l.id, name: l.name, establishment_id: l.id, balance: (await saldoDaGaveta(db, l.id)) / 100 });
    positions.push({ kind: "gerencia", id: l.id, name: l.name, establishment_id: l.id, balance: (await saldoDaGerencia(db, l.id)) / 100 });
  }
  const contas = await db.bankAccount.findMany({ where: { archived_at: null }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const saldos = await saldosDasContas(db);
  for (const c of contas) {
    positions.push({ kind: "conta", id: c.id, name: c.name, establishment_id: null, balance: (saldos.get(c.id) ?? 0) / 100 });
  }
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
  const cartoes = await db.cardReceivable.findMany({
    where: { canceled_at: null, expected_on: hoje, ...lojasDoFiltro },
    select: { net_amount: true },
  });
  const fiado = await listarFiadoAction(db, ator, { establishment_id: lojaId });
  if (!fiado.ok) return fiado;
  const vencidos = fiado.data.filter((c) => c.overdue_amount > 0);

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
      cards: { count: cartoes.length, total: cartoes.reduce((s, c) => s + centavos(decToNum(c.net_amount) ?? 0), 0) / 100 },
    },
    overdue_fiado: {
      customers: vencidos.length,
      total: arred2(vencidos.reduce((s, c) => s + c.overdue_amount, 0)),
    },
  });
}

/** O fiado por cliente, os cheques em carteira e as parcelas de cartão que ainda vão cair (ou caem hoje). */
export async function listarContasAReceberAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string } = {},
): Promise<ActionResult<AReceberView>> {
  const neg = await exigir(db, ator, "dinheiro", "ver as contas a receber");
  if (neg) return neg;
  const lojaId = typeof opts?.establishment_id === "string" && opts.establishment_id ? opts.establishment_id : undefined;
  if (lojaId && !(await db.establishment.findFirst({ where: { id: lojaId }, select: { id: true } }))) {
    return fail("NOT_FOUND", "Estabelecimento não encontrado.", 404, "establishment_id");
  }
  const fiado = await listarFiadoAction(db, ator, { establishment_id: lojaId });
  if (!fiado.ok) return fiado;
  const carteira = await listarChequesAction(db, ator, { establishment_id: lojaId });
  if (!carteira.ok) return carteira;

  const hoje = hojeEmBrasilia();
  const parcelas = await db.cardReceivable.findMany({
    where: { canceled_at: null, expected_on: { gte: hoje }, ...(lojaId ? { establishment_id: lojaId } : {}) },
    include: { establishment: { select: { name: true } }, bank_account: { select: { name: true } } },
    orderBy: [{ expected_on: "asc" }, { installment: "asc" }],
  });
  return ok({
    fiado: fiado.data,
    checks: carteira.data.filter((c) => c.status === "recebido" || c.status === "depositado"),
    cards: parcelas.map((p) => ({
      id: p.id,
      sale_id: p.sale_id,
      establishment_id: p.establishment_id,
      establishment_name: p.establishment.name,
      bank_account_id: p.bank_account_id,
      bank_account_name: p.bank_account.name,
      installment: p.installment,
      installments: p.installments,
      gross_amount: decToNum(p.gross_amount) ?? 0,
      net_amount: decToNum(p.net_amount) ?? 0,
      expected_on: dia(p.expected_on),
      received: p.expected_on.getTime() <= hoje.getTime(),
    })),
  });
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
  input: { lugar: LugarDoExtrato; de: Date; ate: Date },
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
          where: { bank_account_id: conta.id, canceled_at: null, expected_on: { lt: deDia } },
          _sum: { net_amount: true },
        })
      : null,
    db.cashMovement.findMany({
      where: { ...ondeMovimentos, occurred_at: { gte: desde, lt: ate } },
      include: { establishment: { select: { name: true } } },
      orderBy: [{ occurred_at: "asc" }, { created_at: "asc" }],
    }),
    conta
      ? db.cardReceivable.findMany({
          where: { bank_account_id: conta.id, canceled_at: null, expected_on: { gte: deDia, lte: ateDia } },
          include: { establishment: { select: { name: true } } },
          orderBy: [{ expected_on: "asc" }, { installment: "asc" }],
        })
      : [],
  ]);

  let abertura = centavos(decToNum(antesCartao?._sum.net_amount) ?? 0);
  for (const l of antes) {
    const v = centavos(decToNum(l._sum.amount) ?? 0);
    abertura += l.direction === "entrada" ? v : -v;
  }

  const linhas: ExtratoLinhaView[] = [
    ...movs.map((m): ExtratoLinhaView => ({
      kind: "movimento",
      id: m.id,
      occurred_on: dia(inicioDoDiaEmSaoPaulo(m.occurred_at)),
      direction: m.direction,
      amount: decToNum(m.amount) ?? 0,
      origin: m.origin,
      // O movimento da gerência grava `manager_establishment_id`, não `establishment_id`: a loja é a do lugar.
      establishment_id: m.establishment_id ?? m.manager_establishment_id ?? null,
      establishment_name: m.establishment?.name ?? (m.manager_establishment_id ? lugar.name : null),
      description: m.notes?.trim() || ROTULO_ORIGEM[m.origin] || m.origin,
    })),
    ...parcelas.map((p): ExtratoLinhaView => ({
      kind: "cartao",
      id: p.id,
      occurred_on: dia(p.expected_on),
      direction: "entrada",
      amount: decToNum(p.net_amount) ?? 0,
      origin: "cartao",
      establishment_id: p.establishment_id,
      establishment_name: p.establishment.name,
      description: `Cartão, parcela ${p.installment}/${p.installments}`,
    })),
  ].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on));

  const variacao = linhas.reduce((s, l) => s + (l.direction === "entrada" ? centavos(l.amount) : -centavos(l.amount)), 0);
  return ok({
    place: lugar,
    account: conta ? { id: conta.id, name: conta.name, bank: conta.bank } : null,
    opening_balance: abertura / 100,
    lines: linhas,
    closing_balance: (abertura + variacao) / 100,
  });
}
