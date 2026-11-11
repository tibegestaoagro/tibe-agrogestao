import type { Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { dinheiro, itens as frasItens, registrarNoHistorico } from "@/lib/emporio/historico";
import { CATEGORIA_ACORDO } from "@/lib/emporio/acordo";
import { pesoDoItemKg, pesoTotal } from "@/lib/emporio/peso";
import { CATEGORIA_FRETE, ORIGENS_DA_VENDA, type OrigemDaVenda } from "@/lib/emporio/frete";
import { contaEmAprovacao, EM_APROVACAO } from "@/lib/emporio/pedido-pagamento";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { exigir, papelDoEmporio } from "@/lib/emporio/papel";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { descreverQuantidade } from "@/lib/stock/units";
import { custoMedio } from "@/lib/emporio/custo-medio";
import { formatarNumero, proximoNumero } from "@/lib/emporio/numeracao";
import { cancelarVendeuPagou, gravarVendeuPagou } from "@/lib/emporio/vendeu-pagou";
import { resolverTurno, type TurnoResolvido } from "@/lib/emporio/turno";
import { vendedoresDaLoja } from "@/lib/emporio/vendedores";
import { CONSUMIDOR_FINAL } from "@/lib/contatos/cadastro";
import { regraDePrazo, sugerirVencimento } from "@/lib/emporio/fiado";
import { estadoDeCredito, liberacaoValida, type ClienteOuTransacao } from "@/lib/actions/emporio-credito";
import type { EnderecoDoPedido } from "@/lib/emporio/cliente-cadastro";
import {
  enderecoDasColunas,
  entradaHerdadaDoOrcamento,
  linhaDoEndereco,
  resolverPedidoParaEntrega,
  type EscolhaDoEndereco,
  type PedidoParaEntregaColunas,
  type PedidoParaEntregaInput,
} from "@/lib/emporio/pedido-para-entrega";
import {
  arred2,
  arred3,
  centavos,
  precificarItens,
  precoDeReferencia,
  precoQueVale,
  resolverVendedor,
  type OrcamentoNaPrecificacao,
  type VendaItemInput,
} from "@/lib/emporio/precificar";
import {
  CATEGORIA_ANTECIPACAO,
  CATEGORIA_TAXAS_CARTAO,
  BANDEIRAS,
  REGRA_DIA_UTIL_PADRAO,
  ROTULO_DA_BANDEIRA,
  adquirentesComTaxa,
  custoAntecipacaoCent,
  datasDasParcelas,
  dividirEmParcelas,
  hojeEmBrasilia,
  resolverTaxa,
  taxaDoPagamentoCent,
  type Bandeira,
  type LinhaDeTaxa,
  type RegraDiaUtil,
} from "@/lib/emporio/cartao";
import { somarDiasUteis } from "@/lib/emporio/dia-util";
import {
  INCLUDE_PRODUTO,
  lacradoEfetivo,
  lojaVisivel,
  lojasDoAtor,
  type Ator,
  type ProdutoRow,
} from "@/lib/actions/emporio-catalogo";
import {
  MOTIVOS_DE_PERDA,
  acharLojaParaEscrita,
  chaveDoEstado,
  lerMovimentos,
  saldosPorEstado,
} from "@/lib/actions/emporio-estoque";

/**
 * Meu Empório, F3a: venda, cancelamento, devolução e troca (Módulo 39, Q82 a
 * Q86).
 *
 * A receita é UM lançamento por venda, criado por `createLinkedEntry`; o
 * dinheiro que entra é `FinancialPayment` mais `CashMovement`. O estoque
 * continua sendo a soma das movimentações (invariante 2): a venda grava
 * `venda`, a saca que abre sozinha grava `abertura_lacrado` mais
 * `abertura_avulso`, e a devolução grava `devolucao`. Cancelar só marca
 * `canceled_at` nas `venda`. A validação é em TypeScript puro, porque o agente
 * do WhatsApp chama estas funções sem passar pelo Zod da rota.
 */

export const CATEGORIA_VENDAS = "Vendas do Empório";
export const CATEGORIA_DEVOLUCOES = "Devoluções de vendas do Empório";

const NAO_ACHADO = (o: string, field?: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404, field);
const CHAVE_DE_OUTRA_VENDA = () =>
  fail("DUPLICATE_OPERATION_KEY", "Essa chave de operação já foi usada em outra venda.", 409, "operation_key");


const arred4 = (n: number) => Math.round(n * 10000) / 10000;
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const dataValida = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function nomeDaLoja(tx: Pick<Tx, "establishment">, id: string): Promise<string> {
  return (await tx.establishment.findFirst({ where: { id }, select: { name: true } }))?.name ?? "loja";
}

function ehErroUnico(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}

type Tx = Prisma.TransactionClient;
type Movs = Awaited<ReturnType<typeof lerMovimentos>>;

/** Aborta a transação com uma recusa de negócio (o rollback desfaz o que já foi escrito). */
class AbortarVenda extends Error {
  constructor(public recusa: ActionResult<never>) {
    super("venda abortada");
  }
}

/**
 * O turno em que cai o dinheiro da gaveta (entrega 2), dentro da transação: a
 * recusa de `resolverTurno` aborta a escrita inteira.
 */
async function turnoOuAborta(tx: Tx, ator: Ator, lojaId: string, pedido: string | null | undefined): Promise<TurnoResolvido> {
  const r = await resolverTurno(tx, ator, lojaId, pedido || undefined, "exige");
  if (!r.ok) throw new AbortarVenda(r);
  if (!r.turno) throw new Error("resolverTurno no modo exige devolveu turno nulo");
  return r.turno;
}

const pedidoDeCaixa = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Q301, Q302, Q309: o franqueado e o crédito dele, comuns à venda e ao orçamento. O crédito é digitado
 * (nada é calculado) e cobrado a mais do cliente, como o frete. Sem crédito não há o que controlar: o
 * franqueado grava nulo. Não grava nada. `FRANCHISEE_ARCHIVED` vale só para escolha nova: o franqueado
 * que já estava no documento (`jaNoDocumento`: a venda editada, o orçamento faturado ou editado) segue aceito.
 */
export async function resolverFranqueadoDoCredito(
  db: TenantPrismaClient,
  franchiseeId: unknown,
  credit: unknown,
  jaNoDocumento: (string | null | undefined)[] = [],
): Promise<ActionResult<{ franchisee_id: string | null; credit_cent: number }>> {
  let creditCent = 0;
  if (credit != null) {
    if (typeof credit !== "number" || !Number.isFinite(credit)) {
      return fail("VALIDATION_ERROR", "O crédito do franqueado deve ser um número.", 422, "franchisee_credit");
    }
    if (credit < 0) return fail("VALIDATION_ERROR", "O crédito do franqueado não pode ser negativo.", 422, "franchisee_credit");
    creditCent = centavos(credit);
  }
  const id = typeof franchiseeId === "string" ? franchiseeId.trim() : "";
  if (creditCent === 0) return ok({ franchisee_id: null, credit_cent: 0 });
  if (!id) return fail("VALIDATION_ERROR", "Escolha o franqueado do crédito.", 422, "franchisee_id");
  const f = await db.emporioFranchisee.findFirst({ where: { id }, select: { id: true, archived_at: true } });
  if (!f) return NAO_ACHADO("Franqueado", "franchisee_id");
  if (f.archived_at && !jaNoDocumento.includes(f.id)) return fail("FRANCHISEE_ARCHIVED", "Esse franqueado está arquivado.", 422, "franchisee_id");
  return ok({ franchisee_id: f.id, credit_cent: creditCent });
}

/** A frase do Histórico: vazia sem crédito. */
const fraseDoCredito = (credito: number): string => (credito > 0 ? `, crédito do franqueado ${dinheiro(credito)}` : "");

// ---------------------------------------------------------------------------
// Visões
// ---------------------------------------------------------------------------

export type VendaItemView = {
  id: string;
  emporio_product_id: string;
  product_name: string;
  presentation_id: string;
  presentation_name: string;
  quantity: number;
  base_qty: number;
  /** Q291: peso do item em quilos, calculado da quantidade-base; nulo sem conteúdo em quilograma. */
  weight_kg: number | null;
  suggested_price: number | null;
  unit_price: number;
  total: number;
  unit_cost: number | null;
  cost_estimated: boolean;
  cost_provisional: boolean;
  returned_qty: number;
  returnable_qty: number;
};

export type VendaPagamentoView = {
  id: string;
  kind: string;
  amount: number;
  bank_account_id: string | null;
  due_date: string | null;
  financial_payment_id: string | null;
  /** F3b: parcelas do crédito parcelado e a taxa que valia na hora da venda. */
  installments: number | null;
  fee_pct: number | null;
  fee_amount: number | null;
  /** Taxas de cartão (Q254): a adquirente, a bandeira, a taxa fixa e a linha da tabela usadas; nulos nas vendas antigas. */
  acquirer_id: string | null;
  acquirer_name: string | null;
  brand: string | null;
  fee_fixed_amount: number | null;
  fee_rate_id: string | null;
  check: { id: string; number: string; holder_name: string; bank: string; good_for: string; status: string } | null;
  /** Boleto (Q278): o vencimento é data de calendário (ISO à meia-noite UTC), como o `good_for` do cheque. */
  boleto: { id: string; number: string | null; due_on: string; status: string; paid_on: string | null } | null;
  /** Parcelas vivas do cartão (Q261), com o previsto e o efetivo (a antecipação muda o efetivo). */
  receivables: VendaParcelaCartaoView[];
};

export type VendaParcelaCartaoView = {
  id: string;
  installment: number;
  installments: number;
  gross_amount: number;
  net_amount: number;
  fee_amount: number;
  expected_on: string;
  effective_on: string;
  effective_net: number;
  anticipated: boolean;
  anticipation_fee: number | null;
};

export type DevolucaoView = {
  id: string;
  sale_id: string;
  operation_key: string;
  refund_kind: string;
  amount: number;
  returned_at: string;
  returned_by_user_id: string | null;
  reason: string | null;
  exchange_sale_id: string | null;
  items: { sale_item_id: string; quantity: number; base_qty: number; loss_reason: string | null }[];
};

export type VendaView = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  operation_key: string;
  /** Número da venda por conta; no papel sai com `formatarNumero`. */
  number: number;
  /** O cliente do Empório (`EmporioCustomer`); antes da Frente 1, `contact_id`. */
  customer_id: string | null;
  customer_name: string | null;
  sold_at: string;
  sold_by_user_id: string | null;
  sold_by_name: string | null;
  /** Entrega 3: quem de fato vendeu (difere de `sold_by_user_id` quando o Caixa registra). */
  seller_user_id: string | null;
  seller_name: string | null;
  /** O turno de caixa em que a venda foi feita; nulo nas vendas anteriores aos turnos. */
  cash_session_id: string | null;
  net_amount: number;
  /** Frete cobrado do cliente: fora do faturamento (os itens), dentro do recibo e do que o cliente paga. */
  freight_amount: number;
  /** Q301 a Q303: o franqueado e o crédito dele, cobrado a mais do cliente, fora do faturamento. Interno: nunca vai ao impresso do cliente. */
  franchisee_id: string | null;
  franchisee_name: string | null;
  franchisee_credit: number;
  /** `net_amount + freight_amount + franchisee_credit`: o que o cliente paga. */
  total_amount: number;
  origin: OrigemDaVenda;
  /** A venda que esta substituiu (Q249), e a que a substituiu. */
  replaces: { id: string; number: number } | null;
  replaced_by: { id: string; number: number } | null;
  discount_amount: number;
  discount_pct: number;
  discount_authorized_by_user_id: string | null;
  status: "concluida" | "cancelada";
  canceled_at: string | null;
  canceled_by_user_id: string | null;
  canceled_reason: string | null;
  exchange_return_id: string | null;
  /** Entrega 4: o orçamento que a venda faturou (a cancelada continua dizendo). */
  quote: { id: string; numero: string } | null;
  /** Pedido para entrega: a escolha e a cópia do endereço (nulas na retirada). */
  for_delivery: boolean;
  delivery_address_kind: EscolhaDoEndereco | null;
  delivery_address: EnderecoDoPedido | null;
  notes: string | null;
  entry_id: string | null;
  entry_amount: number | null;
  paid_amount: number;
  open_amount: number;
  created_at: string;
  items: VendaItemView[];
  /** Q291: soma dos pesos dos itens; nulo quando nenhum item tem peso. */
  total_weight_kg: number | null;
  items_without_weight: number;
  payments: VendaPagamentoView[];
  returns: DevolucaoView[];
};

const INCLUDE_VENDA = {
  establishment: { select: { name: true } },
  customer: { select: { name: true } },
  franchisee: { select: { name: true } },
  quote: { select: { id: true, number: true } },
  replaces: { select: { id: true, number: true } },
  replaced_by: { select: { id: true, number: true } },
  items: {
    include: {
      emporio_product: { include: { product: { select: { name: true } } } },
      presentation: { select: { name: true } },
      return_items: { select: { quantity: true } },
    },
    orderBy: { id: "asc" },
  },
  payments: {
    include: {
      check: true,
      boleto: true,
      acquirer: { select: { name: true } },
      card_receivables: { where: { canceled_at: null }, orderBy: { installment: "asc" } },
    },
    orderBy: { created_at: "asc" },
  },
  returns: { include: { items: true, exchange_sale: { select: { id: true } } }, orderBy: { created_at: "asc" } },
} as const;

type VendaRow = Awaited<ReturnType<typeof buscarVendas>>[number];

async function buscarVendas(db: TenantPrismaClient, where: Record<string, unknown>, take?: number) {
  return db.emporioSale.findMany({
    where,
    include: INCLUDE_VENDA,
    orderBy: [{ sold_at: "desc" }, { created_at: "desc" }],
    ...(take ? { take } : {}),
  });
}

function viewDaDevolucao(r: VendaRow["returns"][number]): DevolucaoView {
  return {
    id: r.id,
    sale_id: r.sale_id,
    operation_key: r.operation_key,
    refund_kind: r.refund_kind,
    amount: decToNum(r.amount) ?? 0,
    returned_at: r.returned_at.toISOString(),
    returned_by_user_id: r.returned_by_user_id,
    reason: r.reason,
    exchange_sale_id: r.exchange_sale?.id ?? null,
    items: r.items.map((i) => ({
      sale_item_id: i.sale_item_id,
      quantity: decToNum(i.quantity) ?? 0,
      base_qty: decToNum(i.base_qty) ?? 0,
      loss_reason: i.loss_reason,
    })),
  };
}

async function montarVendas(db: TenantPrismaClient, linhas: VendaRow[]): Promise<VendaView[]> {
  if (linhas.length === 0) return [];
  const entradas = await db.financialEntry.findMany({
    where: { related_module: "emporio", entry_type: "income", related_id: { in: linhas.map((l) => l.id) } },
    select: { id: true, related_id: true, amount: true, status: true },
  });
  const pagos = await db.financialPayment.findMany({
    where: { entry_id: { in: entradas.map((e) => e.id) } },
    select: { entry_id: true, amount: true },
  });
  const somaPorEntrada = new Map<string, number>();
  for (const p of pagos) {
    somaPorEntrada.set(p.entry_id, (somaPorEntrada.get(p.entry_id) ?? 0) + centavos(decToNum(p.amount) ?? 0));
  }
  const entradaPorVenda = new Map(entradas.map((e) => [e.related_id as string, e]));
  // Os nomes de quem registrou e de quem vendeu: uma consulta só, ativos ou não.
  const idsDeUsuario = [...new Set(linhas.flatMap((l) => [l.sold_by_user_id, l.seller_user_id]).filter((x): x is string => !!x))];
  const usuarios =
    idsDeUsuario.length > 0 ? await db.user.findMany({ where: { id: { in: idsDeUsuario } }, select: { id: true, name: true } }) : [];
  const nomeDoUsuario = new Map(usuarios.map((u) => [u.id, u.name]));

  return linhas.map((s) => {
    const e = entradaPorVenda.get(s.id) ?? null;
    const valorEntrada = e ? (decToNum(e.amount) ?? 0) : null;
    const pago = e ? (somaPorEntrada.get(e.id) ?? 0) / 100 : 0;
    const aberto = e && e.status !== "cancelled" && valorEntrada !== null ? Math.max(0, arred2(valorEntrada - pago)) : 0;
    let denominador = 0;
    const itens: VendaItemView[] = s.items.map((i) => {
      const quantity = decToNum(i.quantity) ?? 0;
      const sugerido = decToNum(i.suggested_price);
      if (sugerido !== null) denominador += sugerido * quantity;
      const devolvido = arred3(i.return_items.reduce((t, r) => t + (decToNum(r.quantity) ?? 0), 0));
      return {
        id: i.id,
        emporio_product_id: i.emporio_product_id,
        product_name: i.emporio_product.product.name,
        presentation_id: i.presentation_id,
        presentation_name: i.presentation.name,
        quantity,
        base_qty: decToNum(i.base_qty) ?? 0,
        weight_kg: pesoDoItemKg(
          {
            base_unit: i.emporio_product.base_unit,
            content_qty: decToNum(i.emporio_product.content_qty),
            content_unit: i.emporio_product.content_unit,
          },
          decToNum(i.base_qty) ?? 0,
        ),
        suggested_price: sugerido,
        unit_price: decToNum(i.unit_price) ?? 0,
        total: decToNum(i.total) ?? 0,
        unit_cost: decToNum(i.unit_cost),
        cost_estimated: i.cost_estimated,
        cost_provisional: i.cost_provisional,
        returned_qty: devolvido,
        returnable_qty: Math.max(0, arred3(quantity - devolvido)),
      };
    });
    const pesos = pesoTotal(itens.map((i) => i.weight_kg));
    const desconto = decToNum(s.discount_amount) ?? 0;
    return {
      id: s.id,
      establishment_id: s.establishment_id,
      establishment_name: s.establishment.name,
      operation_key: s.operation_key,
      number: s.number,
      customer_id: s.customer_id,
      customer_name: s.customer?.name ?? null,
      sold_at: s.sold_at.toISOString(),
      sold_by_user_id: s.sold_by_user_id,
      sold_by_name: s.sold_by_user_id ? (nomeDoUsuario.get(s.sold_by_user_id) ?? null) : null,
      seller_user_id: s.seller_user_id,
      seller_name: s.seller_user_id ? (nomeDoUsuario.get(s.seller_user_id) ?? null) : null,
      cash_session_id: s.cash_session_id,
      net_amount: decToNum(s.net_amount) ?? 0,
      freight_amount: decToNum(s.freight_amount) ?? 0,
      franchisee_id: s.franchisee_id,
      franchisee_name: s.franchisee?.name ?? null,
      franchisee_credit: decToNum(s.franchisee_credit) ?? 0,
      total_amount: arred2(
        (decToNum(s.net_amount) ?? 0) + (decToNum(s.freight_amount) ?? 0) + (decToNum(s.franchisee_credit) ?? 0),
      ),
      origin: s.origin,
      replaces: s.replaces ? { id: s.replaces.id, number: s.replaces.number } : null,
      replaced_by: s.replaced_by ? { id: s.replaced_by.id, number: s.replaced_by.number } : null,
      discount_amount: desconto,
      discount_pct: denominador > 0 ? arred2((desconto / denominador) * 100) : 0,
      discount_authorized_by_user_id: s.discount_authorized_by_user_id,
      status: s.status,
      canceled_at: isoOrNull(s.canceled_at),
      canceled_by_user_id: s.canceled_by_user_id,
      canceled_reason: s.canceled_reason,
      exchange_return_id: s.exchange_return_id,
      quote: s.quote ? { id: s.quote.id, numero: formatarNumero(s.quote.number) } : null,
      for_delivery: s.for_delivery,
      delivery_address_kind: s.delivery_address_kind,
      delivery_address: enderecoDasColunas(s),
      notes: s.notes,
      entry_id: e?.id ?? null,
      entry_amount: valorEntrada,
      paid_amount: pago,
      open_amount: aberto,
      created_at: s.created_at.toISOString(),
      items: itens,
      total_weight_kg: pesos.total_kg,
      items_without_weight: pesos.sem_peso,
      payments: s.payments.map((p) => ({
        id: p.id,
        kind: p.kind,
        amount: decToNum(p.amount) ?? 0,
        bank_account_id: p.bank_account_id,
        due_date: isoOrNull(p.due_date),
        financial_payment_id: p.financial_payment_id,
        installments: p.installments,
        fee_pct: decToNum(p.fee_pct),
        fee_amount: decToNum(p.fee_amount),
        acquirer_id: p.acquirer_id,
        acquirer_name: p.acquirer?.name ?? null,
        brand: p.brand,
        fee_fixed_amount: decToNum(p.fee_fixed_amount),
        fee_rate_id: p.fee_rate_id,
        receivables: p.card_receivables.map((c) => ({
          id: c.id,
          installment: c.installment,
          installments: c.installments,
          gross_amount: decToNum(c.gross_amount) ?? 0,
          net_amount: decToNum(c.net_amount) ?? 0,
          fee_amount: decToNum(c.fee_amount) ?? 0,
          expected_on: c.expected_on.toISOString(),
          effective_on: c.effective_on.toISOString(),
          effective_net: decToNum(c.effective_net) ?? 0,
          anticipated: c.anticipation_id !== null,
          anticipation_fee: decToNum(c.anticipation_fee),
        })),
        check: p.check
          ? {
              id: p.check.id,
              number: p.check.number,
              holder_name: p.check.holder_name,
              bank: p.check.bank,
              good_for: p.check.good_for.toISOString(),
              status: p.check.status,
            }
          : null,
        boleto: p.boleto
          ? {
              id: p.boleto.id,
              number: p.boleto.number,
              due_on: p.boleto.due_on.toISOString(),
              status: p.boleto.status,
              paid_on: isoOrNull(p.boleto.paid_on),
            }
          : null,
      })),
      returns: s.returns.map(viewDaDevolucao),
    };
  });
}

async function vendaPorId(db: TenantPrismaClient, id: string): Promise<VendaView | null> {
  const [v] = await montarVendas(db, await buscarVendas(db, { id }));
  return v ?? null;
}

/** Meia-noite de hoje em São Paulo (sem horário de verão desde 2019), como instante. */
function inicioDeHojeEmSaoPaulo(): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return new Date(`${ymd}T00:00:00-03:00`);
}

export async function lerVendaAction(db: TenantPrismaClient, ator: Ator, id: string): Promise<ActionResult<VendaView>> {
  const v = await vendaPorId(db, id);
  if (!v || !(await lojaVisivel(db, ator, v.establishment_id))) return NAO_ACHADO("Venda");
  // O Caixa só enxerga o dia de hoje.
  if ((await papelDoEmporio(db, ator)).papel === "caixa" && new Date(v.sold_at) < inicioDeHojeEmSaoPaulo()) {
    return NAO_ACHADO("Venda");
  }
  return ok(v);
}

export async function listarVendasAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: {
    establishment_id?: string;
    customer_id?: string;
    status?: "concluida" | "cancelada";
    origin?: OrigemDaVenda;
    de?: Date;
    ate?: Date;
    limit?: number;
  } = {},
): Promise<ActionResult<VendaView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  if (opts.origin != null && !(ORIGENS_DA_VENDA as readonly unknown[]).includes(opts.origin)) {
    return fail("VALIDATION_ERROR", "Escolha a origem: balcão ou e-commerce.", 422, "origin");
  }
  const periodo: Record<string, Date> = {};
  if (dataValida(opts.de)) periodo.gte = opts.de;
  // O Caixa só enxerga o dia de hoje, mesmo pedindo um período maior.
  if ((await papelDoEmporio(db, ator)).papel === "caixa") {
    const hoje = inicioDeHojeEmSaoPaulo();
    if (!periodo.gte || periodo.gte < hoje) periodo.gte = hoje;
  }
  if (dataValida(opts.ate)) periodo.lte = opts.ate;
  const where: Record<string, unknown> = {
    ...(opts.establishment_id
      ? { establishment_id: opts.establishment_id }
      : visiveis
        ? { establishment_id: { in: [...visiveis] } }
        : {}),
    ...(opts.customer_id ? { customer_id: opts.customer_id } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.origin ? { origin: opts.origin } : {}),
    ...(Object.keys(periodo).length > 0 ? { sold_at: periodo } : {}),
  };
  const limite = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 200;
  return ok(await montarVendas(db, await buscarVendas(db, where, limite)));
}

/**
 * Quem pode ser o vendedor numa loja (a lista do seletor do Caixa). Quem não tem
 * função no Empório leva a recusa de permissão; loja fora do alcance ou que não
 * existe é 404 no `establishment_id`, como em `listarVendasAction`.
 */
export async function listarVendedoresDaLojaAction(
  db: TenantPrismaClient,
  ator: Ator,
  establishmentId: string,
): Promise<ActionResult<{ id: string; name: string }[]>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "ver os vendedores");
  if (neg) return neg;
  const id = typeof establishmentId === "string" ? establishmentId.trim() : "";
  if (!id || !(await lojaVisivel(db, ator, id))) return NAO_ACHADO("Estabelecimento", "establishment_id");
  const existe = await db.establishment.findFirst({ where: { id }, select: { id: true } });
  if (!existe) return NAO_ACHADO("Estabelecimento", "establishment_id");
  return ok(await vendedoresDaLoja(db, id));
}

// ---------------------------------------------------------------------------
// Venda: validação
// ---------------------------------------------------------------------------

export type { VendaItemInput };

export type VendaPagamentoInput = {
  kind: string;
  amount: number;
  bank_account_id?: string | null;
  due_date?: Date | null;
  /** Crédito parcelado: de 2 a 12. */
  installments?: number | null;
  /** Cartão (Q254): a adquirente e a bandeira. Sem a adquirente, vale a única com taxa vigente na loja. */
  acquirer_id?: string | null;
  brand?: Bandeira | null;
  /** Cheque: número, banco, "bom para" e o titular (Q284) são obrigatórios. */
  check?: { number?: string | null; bank?: string | null; good_for?: Date | null; holder_name?: string | null } | null;
  /** Boleto (Q278): o vencimento é obrigatório; o número é opcional. */
  boleto?: { due_on?: Date | null; number?: string | null } | null;
};

export type VenderInput = PedidoParaEntregaInput & {
  operation_key: string;
  establishment_id: string;
  /** O cliente do Empório (`EmporioCustomer`); o Consumidor final para quem não se identifica. */
  customer_id?: string | null;
  sold_at?: Date | null;
  items: VendaItemInput[];
  payments?: VendaPagamentoInput[] | null;
  notes?: string | null;
  /** Entrega 2: o caixa do turno; sem ele vale a regra de `resolverTurno`. */
  cash_register_id?: string | null;
  /** Entrega 3: quem vendeu. O Caixa é obrigado a informar; os outros papéis vendem em nome próprio. */
  seller_user_id?: string | null;
  /**
   * Entrega 4: o orçamento que esta venda fatura. O vendedor passa a ser o do
   * orçamento; dentro da validade, os itens dele têm a referência de
   * `precoDeReferencia` e o preço de `precoQueVale` (ver `precificarItens`).
   */
  quote_id?: string | null;
  /** Frete cobrado do cliente (Q244): soma ao que ele paga, não ao faturamento. */
  freight_amount?: number | null;
  /**
   * Q301: o franqueado e o crédito dele, digitados, cobrados a mais do cliente como o frete. Ausentes
   * (`undefined`) ao faturar um orçamento herdam os dele; `null` é "sem franqueado".
   */
  franchisee_id?: string | null;
  franchisee_credit?: number | null;
  /** De onde veio o pedido (Q248); sem ela, balcão. */
  origin?: OrigemDaVenda | null;
};

const FORMAS_DE_CARTAO = ["debito", "credito_vista", "credito_parcelado"] as const;
type FormaDeCartao = (typeof FORMAS_DE_CARTAO)[number];
const ehCartao = (k: unknown): k is FormaDeCartao => (FORMAS_DE_CARTAO as readonly unknown[]).includes(k);
const NOME_DO_CARTAO: Record<FormaDeCartao, string> = {
  debito: "débito",
  credito_vista: "crédito à vista",
  credito_parcelado: "crédito parcelado",
};

type ItemPreparado = {
  produto: ProdutoRow;
  apresentacao: ProdutoRow["presentations"][number];
  quantity: number;
  base_qty: number;
  suggested: number | null;
  unit_price: number;
  total: number;
};

type ConfigDaAdquirente = {
  business_day_rule: RegraDiaUtil;
  auto_enabled: boolean;
  auto_pct_month: number | null;
  auto_business_days: number;
  auto_since: string | null;
};

type LinhasDaLoja = {
  linhas: LinhaDeTaxa[];
  configs: Map<string, ConfigDaAdquirente>;
  nomes: Map<string, string>;
  arquivadas: Set<string>;
};

const diaDaColuna = (d: Date) => d.toISOString().slice(0, 10);

/** Todas as linhas da tabela de taxas da loja (uma leitura por venda); a vigência é decidida por `resolverTaxa`. */
async function carregarLinhasDaLoja(db: TenantPrismaClient, establishmentId: string): Promise<LinhasDaLoja> {
  const rows = await db.cardFeeRate.findMany({
    where: { establishment_id: establishmentId },
    include: { acquirer: { select: { name: true, archived_at: true } } },
  });
  const nomes = new Map<string, string>();
  const arquivadas = new Set<string>();
  for (const r of rows) {
    nomes.set(r.acquirer_id, r.acquirer.name);
    if (r.acquirer.archived_at) arquivadas.add(r.acquirer_id);
  }
  // Adquirente sem linha na loja também precisa de nome, para a recusa dizer qual é.
  const semLinha = await db.cardAcquirer.findMany({
    select: {
      id: true,
      name: true,
      archived_at: true,
      business_day_rule: true,
      auto_anticipation_enabled: true,
      auto_anticipation_pct_month: true,
      auto_anticipation_business_days: true,
      auto_anticipation_since: true,
    },
  });
  const configs = new Map<string, ConfigDaAdquirente>();
  for (const a of semLinha) {
    if (!nomes.has(a.id)) nomes.set(a.id, a.name);
    if (a.archived_at) arquivadas.add(a.id);
    configs.set(a.id, {
      business_day_rule: a.business_day_rule,
      auto_enabled: a.auto_anticipation_enabled,
      auto_pct_month: decToNum(a.auto_anticipation_pct_month),
      auto_business_days: a.auto_anticipation_business_days,
      auto_since: a.auto_anticipation_since ? diaDaColuna(a.auto_anticipation_since) : null,
    });
  }
  return {
    nomes,
    configs,
    arquivadas,
    linhas: rows.map((r) => ({
      id: r.id,
      acquirer_id: r.acquirer_id,
      brand: r.brand,
      kind: r.kind,
      installments_from: r.installments_from,
      installments_to: r.installments_to,
      fee_pct: decToNum(r.fee_pct) ?? 0,
      fee_fixed: decToNum(r.fee_fixed) ?? 0,
      days: r.days,
      bank_account_id: r.bank_account_id,
      valid_from: diaDaColuna(r.valid_from),
      valid_to: r.valid_to ? diaDaColuna(r.valid_to) : null,
    })),
  };
}

/**
 * A regra do crédito do fiado, uma só para o preparo e para a gravação (2.37): o atraso e o limite
 * valem na conta inteira; a liberação pontual do Gestor, válida na loja, dispensa os dois.
 */
async function conferirFiado(
  db: ClienteOuTransacao,
  customerId: string,
  lojaId: string,
  fiadoAmount: number,
  semAVenda: string | null,
): Promise<{ recusa: null; liberacao_id: string | null } | { recusa: ActionResult<never> }> {
  const estado = await estadoDeCredito(db, customerId, { semAVenda });
  const liberacao = await liberacaoValida(db, customerId, lojaId, new Date());
  if (liberacao) return { recusa: null, liberacao_id: liberacao.id };
  if (estado.blocked_by_delay && estado.oldest_overdue) {
    return {
      recusa: fail(
        "FIADO_BLOQUEADO",
        `Cliente com fiado vencido há ${estado.oldest_overdue.days} dias. Peça a liberação ao gestor.`,
        409,
        "payments",
      ),
    };
  }
  if (estado.limit !== null) {
    const limiteCent = centavos(estado.limit);
    const fiadoCent = centavos(fiadoAmount);
    if (estado.owed_cent + fiadoCent > limiteCent) {
      return {
        recusa: fail(
          "LIMITE_EXCEDIDO",
          limiteCent === 0
            ? "Este cliente não compra fiado: o limite dele é zero."
            : `O limite de fiado do cliente é ${brl(estado.limit)} e ele já deve ${brl(estado.owed_cent / 100)}: cabem ${brl(Math.max(0, limiteCent - estado.owed_cent) / 100)}.`,
          409,
          "payments",
        ),
      };
    }
  }
  return { recusa: null, liberacao_id: null };
}

type PagamentoPreparado = {
  kind: "dinheiro" | "pix" | "fiado" | FormaDeCartao | "cheque" | "boleto";
  amount: number;
  bank_account_id: string | null;
  due_date: Date | null;
  /** Cartão: a regra do momento, copiada para o pagamento (§23.4). */
  cartao: {
    installments: number | null;
    parcelas: number;
    fee_pct: number;
    fee_amount: number;
    days: number;
    acquirer_id: string;
    brand: Bandeira | null;
    fee_fixed_amount: number;
    fee_rate_id: string;
    regra_dia_util: RegraDiaUtil;
    /** A antecipação automática da adquirente que vale para esta venda (crédito, ligada, com taxa e já em vigor); senão nulo. */
    auto: { pct_mes: number; dias_uteis: number } | null;
  } | null;
  cheque: { number: string; bank: string; good_for: Date; holder_name: string } | null;
  boleto: { number: string | null; due_on: Date } | null;
};

type Preparada = {
  loja: { id: string; name: string; allow_negative_stock: boolean };
  chave: string;
  customer_id: string | null;
  sold_at: Date;
  itens: ItemPreparado[];
  pagamentos: PagamentoPreparado[];
  net: number;
  /** Frete cobrado do cliente, 0 quando ausente. */
  frete: number;
  /** O franqueado e o crédito dele (0 e nulo quando não há). Fora do `net`, do custo e do "Vendeu, Pagou". */
  franchisee_id: string | null;
  franchisee_credit: number;
  origin: OrigemDaVenda;
  desconto: number;
  autorizou: string | null;
  /** Parte da venda paga pelo valor devolvido na troca (já limitada ao total). */
  troca: number;
  notes: string | null;
  cash_register_id: string | null;
  seller_user_id: string;
  /** O orçamento faturado: a transação o marca, e recusa se outra venda chegou antes. */
  quote: { id: string; number: number } | null;
  /** As nove colunas do pedido para entrega, já resolvidas contra o cliente da venda. */
  pedido: PedidoParaEntregaColunas;
  /** A liberação pontual do Gestor que esta venda em fiado consome (a transação a marca, e recusa se outra venda chegou antes). */
  credit_release_id: string | null;
};

const FIADO_BLOQUEADO_CONSUMIDA = () =>
  fail("FIADO_BLOQUEADO", "A liberação deste cliente já foi usada em outra venda. Peça uma nova ao gestor.", 409, "payments");

const QUOTE_NOT_FOUND = () => fail("QUOTE_NOT_FOUND", "Orçamento não encontrado nesta loja.", 404, "quote_id");
const QUOTE_CANCELED = () => fail("QUOTE_CANCELED", "Este orçamento foi cancelado.", 409, "quote_id");
const QUOTE_ALREADY_INVOICED = (numeroDaVenda: number) =>
  fail("QUOTE_ALREADY_INVOICED", `Este orçamento já foi faturado na venda nº ${formatarNumero(numeroDaVenda)}.`, 409, "quote_id");

type OrcamentoAFaturar = {
  quote: { id: string; number: number };
  vendedor: string | null;
  /** Para `precificarItens`; nulo quando vencido (a venda segue a regra normal). */
  precificacao: OrcamentoNaPrecificacao | null;
  /** O pedido para entrega gravado no orçamento: a venda herda quando o corpo não diz (D3). */
  pedido: PedidoParaEntregaColunas;
  /** Q309: o franqueado e o crédito do orçamento; a venda herda quando o corpo não os traz. */
  franchisee_id: string | null;
  franchisee_credit: number;
};

/**
 * Entrega 4: o orçamento que a venda vai faturar, conferido fora da transação
 * (a corrida é barrada dentro dela, em `gravarVenda`). A validade é contra o dia
 * da venda em Brasília, não contra agora: a venda lançada às 23h50 do último dia
 * ainda leva o preço orçado.
 */
async function orcamentoAFaturar(
  db: TenantPrismaClient,
  lojaId: string,
  quoteId: unknown,
  soldAt: Date,
  /** A edição da venda (Q249): o orçamento ainda preso à venda que ela vai substituir vale. */
  substituindo: string | null = null,
): Promise<ActionResult<OrcamentoAFaturar>> {
  const id = typeof quoteId === "string" ? quoteId.trim() : "";
  if (!id) return QUOTE_NOT_FOUND();
  const q = await db.emporioQuote.findFirst({
    where: { id },
    select: {
      id: true,
      number: true,
      establishment_id: true,
      seller_user_id: true,
      valid_until: true,
      canceled_at: true,
      discount_authorized_by_user_id: true,
      franchisee_id: true,
      franchisee_credit: true,
      for_delivery: true,
      delivery_address_kind: true,
      delivery_zip: true,
      delivery_street: true,
      delivery_number: true,
      delivery_complement: true,
      delivery_district: true,
      delivery_city: true,
      delivery_state: true,
      sale: { select: { id: true, number: true } },
      items: { select: { presentation_id: true, unit_price: true, suggested_price: true } },
    },
  });
  if (!q) return QUOTE_NOT_FOUND();
  if (q.establishment_id !== lojaId) {
    return fail("QUOTE_OTHER_STORE", "Este orçamento é de outra loja. Fature na loja dele.", 422, "quote_id");
  }
  if (q.canceled_at) return QUOTE_CANCELED();
  if (q.sale && q.sale.id !== substituindo) return QUOTE_ALREADY_INVOICED(q.sale.number);

  const quote = { id: q.id, number: q.number };
  const pedido: PedidoParaEntregaColunas = {
    for_delivery: q.for_delivery,
    delivery_address_kind: q.delivery_address_kind,
    delivery_zip: q.delivery_zip,
    delivery_street: q.delivery_street,
    delivery_number: q.delivery_number,
    delivery_complement: q.delivery_complement,
    delivery_district: q.delivery_district,
    delivery_city: q.delivery_city,
    delivery_state: q.delivery_state,
  };
  const franquia = { franchisee_id: q.franchisee_id, franchisee_credit: decToNum(q.franchisee_credit) ?? 0 };
  // Vencido: os itens do orçamento seguem a regra normal, sem referência nem autorização herdada.
  if (hojeEmBrasilia(soldAt).getTime() > q.valid_until.getTime()) {
    return ok({ quote, vendedor: q.seller_user_id, precificacao: null, pedido, ...franquia });
  }
  const precos = await db.presentationPrice.findMany({
    where: { establishment_id: lojaId, presentation_id: { in: q.items.map((i) => i.presentation_id) } },
    select: { presentation_id: true, price: true },
  });
  const precoHoje = new Map(precos.map((p) => [p.presentation_id, centavos(decToNum(p.price) ?? 0)]));
  // O orçado é o preço praticado no orçamento (já com o desconto dele). A mesma
  // apresentação em duas linhas do orçamento: vale a mais barata de cada conta.
  const linhas = new Map<string, { referencia: number; vale: number }>();
  for (const i of q.items) {
    const orcadoCent = centavos(decToNum(i.unit_price) ?? 0);
    const sugerida = decToNum(i.suggested_price);
    const hoje = precoHoje.get(i.presentation_id) ?? null;
    // Dentro da validade nenhuma das duas é nula: sem preço hoje, valem as do orçamento.
    const vale = precoQueVale(orcadoCent, hoje, false) as number;
    const referencia = precoDeReferencia(orcadoCent, sugerida === null ? null : centavos(sugerida), hoje, false) as number;
    const ja = linhas.get(i.presentation_id);
    linhas.set(
      i.presentation_id,
      ja ? { referencia: Math.min(ja.referencia, referencia), vale: Math.min(ja.vale, vale) } : { referencia, vale },
    );
  }
  return ok({
    quote,
    vendedor: q.seller_user_id,
    precificacao: { linhas, autorizou: q.discount_authorized_by_user_id },
    pedido,
    ...franquia,
  });
}

/** O cliente da venda com tudo o que `resolverPedidoParaEntrega` confere (`ClienteParaConferir`). */
const CAMPOS_DO_CLIENTE_DA_VENDA = {
  id: true,
  archived_at: true,
  system_key: true,
  name: true,
  person_kind: true,
  phone: true,
  document: true,
  address_zip: true,
  address_street: true,
  address_number: true,
  address_complement: true,
  address_district: true,
  city: true,
  address_state: true,
  delivery_zip: true,
  delivery_street: true,
  delivery_number: true,
  delivery_complement: true,
  delivery_district: true,
  delivery_city: true,
  delivery_state: true,
  fiado_due_days: true,
  fiado_due_day: true,
} as const;

async function prepararVenda(
  db: TenantPrismaClient,
  ator: Ator,
  input: VenderInput,
  /** `vendedorHerdado`: a troca leva o vendedor da venda original, sem revalidá-lo (pode ter sido desativado depois). */
  opts: {
    valorTroca?: number;
    vendedorHerdado?: string | null;
    substituindo?: string | null;
    /** O franqueado da venda que está sendo substituída: aceito mesmo arquivado. */
    franqueadoAtual?: string | null;
  } = {},
): Promise<ActionResult<Preparada>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "vender");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const loja = await acharLojaParaEscrita(db, ator, input?.establishment_id);
  if (!loja.ok) return loja;
  const lojaExtra = await db.establishment.findFirst({
    where: { id: loja.data.id },
    select: { max_discount_pct: true, pix_bank_account_id: true },
  });

  const soldAt = input.sold_at == null ? new Date() : input.sold_at;
  if (!dataValida(soldAt)) return fail("VALIDATION_ERROR", "Informe uma data de venda válida.", 422, "sold_at");

  let freteCent = 0;
  if (input.freight_amount != null) {
    const f = input.freight_amount;
    if (typeof f !== "number" || !Number.isFinite(f) || f < 0) {
      return fail("VALIDATION_ERROR", "O frete não pode ser negativo.", 422, "freight_amount");
    }
    freteCent = centavos(f);
  }
  const origin = input.origin == null ? "balcao" : input.origin;
  if (!(ORIGENS_DA_VENDA as readonly unknown[]).includes(origin)) {
    return fail("VALIDATION_ERROR", "Escolha a origem: balcão ou e-commerce.", 422, "origin");
  }

  // Entrega 4: o orçamento faturado (a troca nunca chega aqui com um).
  let orcamento: OrcamentoAFaturar | null = null;
  if (input.quote_id != null && input.quote_id !== "") {
    const r = await orcamentoAFaturar(db, loja.data.id, input.quote_id, soldAt, opts.substituindo ?? null);
    if (!r.ok) return r;
    orcamento = r.data;
  }

  // Q301, Q309: o franqueado e o crédito. Ausentes no corpo, valem os do orçamento faturado.
  const herdada =
    orcamento && input.franchisee_id === undefined && input.franchisee_credit === undefined ? orcamento : null;
  const franquia = await resolverFranqueadoDoCredito(
    db,
    herdada ? herdada.franchisee_id : input.franchisee_id,
    herdada ? herdada.franchisee_credit : input.franchisee_credit,
    [orcamento?.franchisee_id, opts.franqueadoAtual],
  );
  if (!franquia.ok) return franquia;
  const creditoCent = franquia.data.credit_cent;

  // O vendedor (entrega 3), validado aqui fora da transação como a loja e o cliente.
  // Ao faturar, é o do orçamento, como a troca herda o da venda original.
  const vendedor = await resolverVendedor(
    db,
    ator,
    loja.data.id,
    input.seller_user_id,
    opts.vendedorHerdado ?? orcamento?.vendedor ?? null,
  );
  if (!vendedor.ok) return vendedor;
  const vendedorId = vendedor.data;

  // Toda venda tem cliente (design 2026-11-03-emporio-cliente-nome-menu): quem não quer se
  // identificar entra como Consumidor final, que não toma fiado nem cheque.
  if (input.customer_id == null || input.customer_id === "") {
    return fail(
      "VALIDATION_ERROR",
      "Escolha o cliente da venda. Quem não quer se identificar entra como Consumidor final.",
      422,
      "customer_id",
    );
  }
  const cliente = await db.emporioCustomer.findFirst({
    where: { id: String(input.customer_id) },
    select: CAMPOS_DO_CLIENTE_DA_VENDA,
  });
  if (!cliente || cliente.archived_at) return fail("VALIDATION_ERROR", "Escolha um cliente ativo.", 422, "customer_id");
  const customerId: string = cliente.id;
  const ehConsumidorFinal = cliente.system_key === CONSUMIDOR_FINAL.system_key;

  // Pedido para entrega (D3): ao faturar, o corpo sem `for_delivery` herda do orçamento;
  // no `principal` e no `cadastro_entrega`, o endereço sai do cliente DESTA venda, agora.
  const entrada = input.for_delivery == null && orcamento ? entradaHerdadaDoOrcamento(orcamento.pedido) : input;
  const pedido = resolverPedidoParaEntrega(cliente, entrada);
  if (!pedido.ok) return pedido;

  // Itens
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return fail("VALIDATION_ERROR", "Inclua ao menos um item na venda.", 422, "items");
  }
  // Preço e desconto (Q85): a mesma regra do orçamento, em `precificar.ts`.
  const precificados = await precificarItens(
    db,
    ator,
    { id: loja.data.id, max_discount_pct: lojaExtra?.max_discount_pct ?? null },
    input.items,
    orcamento?.precificacao ? { orcamento: orcamento.precificacao } : {},
  );
  if (!precificados.ok) return precificados;
  const itens: ItemPreparado[] = precificados.data.itens.map((i) => ({
    produto: i.produto,
    apresentacao: i.apresentacao,
    quantity: i.quantity,
    base_qty: i.base_qty,
    suggested: i.suggested_cent === null ? null : i.suggested_cent / 100,
    unit_price: i.unit_cent / 100,
    total: i.total_cent / 100,
  }));
  const netCent = precificados.data.total_cent;
  const net = netCent / 100;
  const descontoCent = precificados.data.desconto_cent;
  const autorizou = precificados.data.autorizou;

  // Pagamentos
  const pagamentosDoCorpo = Array.isArray(input.payments) ? input.payments : [];
  const pagamentos: PagamentoPreparado[] = [];
  let temFiado = false;
  let linhasDaLoja: LinhasDaLoja | null = null;
  for (const p of pagamentosDoCorpo) {
    const kind = p?.kind;
    if (kind === "troca") {
      return fail("VALIDATION_ERROR", "O pagamento por troca só nasce na troca de mercadoria.", 422, "payments");
    }
    if (kind !== "dinheiro" && kind !== "pix" && kind !== "fiado" && kind !== "cheque" && kind !== "boleto" && !ehCartao(kind)) {
      return fail(
        "VALIDATION_ERROR",
        "Escolha a forma de pagamento: dinheiro, PIX, débito, crédito, cheque, boleto ou fiado.",
        422,
        "payments",
      );
    }
    if (!numero(p.amount) || centavos(p.amount) <= 0) {
      return fail("VALIDATION_ERROR", "O valor de cada pagamento deve ser maior que zero.", 422, "payments");
    }
    let contaId: string | null = null;
    let venc: Date | null = null;
    let cartao: PagamentoPreparado["cartao"] = null;
    let cheque: PagamentoPreparado["cheque"] = null;
    let boleto: PagamentoPreparado["boleto"] = null;
    if (ehCartao(kind)) {
      let parcelas = 1;
      let installments: number | null = null;
      if (kind === "credito_parcelado") {
        const n = p.installments;
        if (!numero(n) || !Number.isInteger(n) || n < 2 || n > 12) {
          return fail("VALIDATION_ERROR", "O crédito parcelado precisa de 2 a 12 parcelas.", 422, "payments");
        }
        parcelas = n;
        installments = n;
      }
      const bandeira = p.brand ?? null;
      if (bandeira !== null && !(BANDEIRAS as readonly string[]).includes(bandeira)) {
        return fail("VALIDATION_ERROR", "Escolha uma bandeira válida: Visa/Master, Elo, Hipercard, Amex ou Outra.", 422, "payments");
      }
      if (linhasDaLoja === null) linhasDaLoja = await carregarLinhasDaLoja(db, loja.data.id);
      const dia = hojeEmBrasilia(soldAt).toISOString().slice(0, 10);
      let adquirenteId = typeof p.acquirer_id === "string" && p.acquirer_id.trim() ? p.acquirer_id.trim() : null;
      if (adquirenteId === null) {
        const candidatas = adquirentesComTaxa(
          linhasDaLoja.linhas.filter((l) => l.kind === kind && !linhasDaLoja!.arquivadas.has(l.acquirer_id)),
          dia,
        );
        if (candidatas.length === 0) {
          return fail(
            "VALIDATION_ERROR",
            `Cadastre a taxa de ${NOME_DO_CARTAO[kind]} desta loja em Configurações antes de vender no cartão.`,
            422,
            "payments",
          );
        }
        if (candidatas.length > 1) return fail("VALIDATION_ERROR", "Escolha a adquirente.", 422, "acquirer_id");
        adquirenteId = candidatas[0];
      }
      const nomeDaAdquirente = linhasDaLoja.nomes.get(adquirenteId) ?? null;
      if (nomeDaAdquirente === null) return fail("VALIDATION_ERROR", "Adquirente não encontrada.", 422, "acquirer_id");
      const arquivada = linhasDaLoja.arquivadas.has(adquirenteId);
      // Sem bandeira só vale a linha `qualquer`: o resolvedor recebe só elas.
      const linha = arquivada
        ? null
        : resolverTaxa(
            bandeira === null ? linhasDaLoja.linhas.filter((l) => l.brand === "qualquer") : linhasDaLoja.linhas,
            { acquirer_id: adquirenteId, brand: bandeira ?? "outra", kind, installments: parcelas, dia },
          );
      if (!linha) {
        const forma = kind === "credito_parcelado" ? `crédito parcelado em ${parcelas}x` : NOME_DO_CARTAO[kind];
        let mensagem: string;
        if (arquivada) mensagem = `A adquirente ${nomeDaAdquirente} está arquivada: escolha outra.`;
        else if (bandeira === null) {
          mensagem = `Sem taxa de ${forma} sem bandeira na ${nomeDaAdquirente}: informe a bandeira ou cadastre em Configurações.`;
        } else {
          mensagem = `Sem taxa de ${forma} para ${ROTULO_DA_BANDEIRA[bandeira]} na ${nomeDaAdquirente}: cadastre em Configurações.`;
        }
        return fail("VALIDATION_ERROR", mensagem, 422, "payments");
      }
      if (Math.round(linha.fee_fixed * 100) >= centavos(p.amount)) {
        return fail(
          "VALIDATION_ERROR",
          `A taxa fixa de ${brl(linha.fee_fixed)} não cabe num pagamento de ${brl(arred2(p.amount))}.`,
          422,
          "payments",
        );
      }
      const configDaAdquirente = linhasDaLoja.configs.get(adquirenteId);
      const autoVale =
        (kind === "credito_vista" || kind === "credito_parcelado") &&
        configDaAdquirente?.auto_enabled === true &&
        configDaAdquirente.auto_pct_month !== null &&
        configDaAdquirente.auto_since !== null &&
        configDaAdquirente.auto_since <= dia;
      cartao = {
        regra_dia_util: configDaAdquirente?.business_day_rule ?? REGRA_DIA_UTIL_PADRAO,
        auto:
          autoVale && configDaAdquirente
            ? { pct_mes: configDaAdquirente.auto_pct_month as number, dias_uteis: configDaAdquirente.auto_business_days }
            : null,
        installments,
        parcelas,
        fee_pct: linha.fee_pct,
        fee_amount: taxaDoPagamentoCent(centavos(p.amount), linha) / 100,
        days: linha.days,
        acquirer_id: adquirenteId,
        brand: bandeira,
        fee_fixed_amount: linha.fee_fixed,
        fee_rate_id: linha.id,
      };
      contaId = linha.bank_account_id;
    }
    if (kind === "cheque") {
      const c = p.check;
      const numeroDoCheque = typeof c?.number === "string" ? c.number.trim() : "";
      const banco = typeof c?.bank === "string" ? c.bank.trim() : "";
      const titular = typeof c?.holder_name === "string" ? c.holder_name.trim() : "";
      if (!numeroDoCheque || !banco || !dataValida(c?.good_for)) {
        return fail("VALIDATION_ERROR", "Informe o número, o banco e a data do cheque (bom para).", 422, "payments");
      }
      if (!titular) {
        return fail("VALIDATION_ERROR", "Informe em nome de quem é o cheque.", 422, "payments");
      }
      if (titular.length > 120) {
        return fail("VALIDATION_ERROR", "O nome do titular do cheque aceita até 120 letras.", 422, "payments");
      }
      if (ehConsumidorFinal) {
        return fail("VALIDATION_ERROR", "Cheque precisa do cliente de verdade, não do Consumidor final.", 422, "customer_id");
      }
      cheque = { number: numeroDoCheque, bank: banco, good_for: c?.good_for as Date, holder_name: titular };
    }
    if (kind === "boleto") {
      const b = p.boleto;
      if (!dataValida(b?.due_on)) {
        return fail("VALIDATION_ERROR", "Informe o vencimento do boleto.", 422, "payments");
      }
      // Dia de calendário: o horário que vier junto não conta.
      const vencimento = new Date(b.due_on.toISOString().slice(0, 10));
      if (vencimento.getTime() < hojeEmBrasilia(soldAt).getTime()) {
        return fail("VALIDATION_ERROR", "O vencimento do boleto não pode ser antes do dia da venda.", 422, "payments");
      }
      const numeroDoBoleto = typeof b?.number === "string" && b.number.trim() ? b.number.trim() : null;
      if (ehConsumidorFinal) {
        return fail("VALIDATION_ERROR", "Boleto precisa do cliente de verdade, não do Consumidor final.", 422, "customer_id");
      }
      boleto = { number: numeroDoBoleto, due_on: vencimento };
    }
    if (kind === "fiado") {
      if (temFiado) return fail("VALIDATION_ERROR", "O fiado aparece uma vez só na venda.", 422, "payments");
      temFiado = true;
      if (ehConsumidorFinal) {
        return fail("VALIDATION_ERROR", "Fiado precisa do cliente de verdade, não do Consumidor final.", 422, "customer_id");
      }
      if (p.due_date != null) {
        if (!dataValida(p.due_date)) return fail("VALIDATION_ERROR", "Informe um vencimento válido.", 422, "payments");
        venc = p.due_date;
      } else {
        // Sem vencimento informado: o do cliente, senão o da conta (nunca fica nulo em venda nova).
        const conta = await db.emporioSettings.findFirst({ select: { fiado_due_days: true } });
        venc = sugerirVencimento(
          regraDePrazo(cliente, { fiado_due_days: conta?.fiado_due_days ?? 30 }),
          hojeEmBrasilia(soldAt),
        );
      }
    }
    if (kind === "pix") {
      const escolhida = p.bank_account_id || lojaExtra?.pix_bank_account_id || null;
      const conta = escolhida ? await db.bankAccount.findFirst({ where: { id: escolhida }, select: { id: true, archived_at: true } }) : null;
      if (!conta || conta.archived_at) {
        return fail(
          "VALIDATION_ERROR",
          "Para receber PIX, cadastre uma conta bancária e defina a conta PIX da loja.",
          422,
          "payments",
        );
      }
      contaId = conta.id;
    }
    pagamentos.push({ kind, amount: arred2(p.amount), bank_account_id: contaId, due_date: venc, cartao, cheque, boleto });
  }

  const valorTroca = opts.valorTroca ?? 0;
  const totalCent = netCent + freteCent + creditoCent;
  const trocaCent = Math.min(centavos(valorTroca), totalCent);
  const somaCent = pagamentos.reduce((s, p) => s + centavos(p.amount), 0);
  if (somaCent + trocaCent !== totalCent) {
    const esperado = (totalCent - trocaCent) / 100;
    return fail(
      "VALIDATION_ERROR",
      trocaCent > 0
        ? `Os pagamentos (${brl(somaCent / 100)}) precisam cobrir o que sobra da venda depois da troca (${brl(esperado)}).`
        : freteCent > 0 || creditoCent > 0
          ? `A soma dos pagamentos (${brl(somaCent / 100)}) precisa ser igual ao total da venda com ${
              freteCent > 0 && creditoCent > 0 ? "o frete e o crédito do franqueado" : freteCent > 0 ? "o frete" : "o crédito do franqueado"
            } (${brl(totalCent / 100)}).`
          : `A soma dos pagamentos (${brl(somaCent / 100)}) precisa ser igual ao total da venda (${brl(net)}).`,
      422,
      "payments",
    );
  }

  // Crédito do fiado: o atraso e o limite valem na conta inteira (todas as lojas). A liberação
  // pontual do Gestor, válida nesta loja, dispensa as duas conferências e é consumida na gravação.
  let creditReleaseId: string | null = null;
  const fiadoPreparado = pagamentos.find((x) => x.kind === "fiado");
  if (fiadoPreparado && !ehConsumidorFinal) {
    const conferido = await conferirFiado(db, customerId, loja.data.id, fiadoPreparado.amount, opts.substituindo ?? null);
    if (conferido.recusa) return conferido.recusa;
    creditReleaseId = conferido.liberacao_id;
  }

  return ok({
    loja: { id: loja.data.id, name: loja.data.name, allow_negative_stock: loja.data.allow_negative_stock },
    chave,
    customer_id: customerId,
    sold_at: soldAt,
    itens,
    pagamentos,
    net,
    frete: freteCent / 100,
    franchisee_id: franquia.data.franchisee_id,
    franchisee_credit: creditoCent / 100,
    origin: origin as OrigemDaVenda,
    desconto: descontoCent / 100,
    autorizou,
    troca: trocaCent / 100,
    notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null,
    cash_register_id: pedidoDeCaixa(input.cash_register_id),
    seller_user_id: vendedorId,
    quote: orcamento?.quote ?? null,
    pedido: pedido.data,
    credit_release_id: creditReleaseId,
  });
}

// ---------------------------------------------------------------------------
// Venda: gravação
// ---------------------------------------------------------------------------

type MovimentoPlanejado = {
  product_id: string;
  movement_type: "venda" | "abertura_lacrado" | "abertura_avulso";
  quantity: number;
  package_state: "lacrado" | "avulso" | null;
  presentation_id: string | null;
  unit_cost: number | null;
  created_at: Date;
};

type CustoDoItem = { unit_cost: number | null; cost_estimated: boolean; cost_provisional: boolean };

/**
 * Baixa do estoque de todos os itens, sem escrever: devolve as movimentações
 * planejadas (a saca aberta incluída) e o custo de cada item. Lê o estoque UMA
 * vez por produto e vai somando o que a própria venda já planejou, então duas
 * linhas do mesmo produto enxergam uma à outra.
 */
async function planejarBaixa(tx: Tx, p: Preparada): Promise<{ movs: MovimentoPlanejado[]; custos: CustoDoItem[] }> {
  const lojaId = p.loja.id;
  const porProduto = new Map<string, Movs>();
  for (const pid of new Set(p.itens.map((i) => i.produto.product_id))) {
    porProduto.set(pid, await lerMovimentos(tx, [lojaId], [pid]));
  }
  const planejadas: MovimentoPlanejado[] = [];
  const custos: CustoDoItem[] = [];
  const base = Date.now();
  let seq = 0;

  for (const it of p.itens) {
    const produto = it.produto;
    const pid = produto.product_id;
    const nome = produto.product.name;
    const movs = porProduto.get(pid) as Movs;
    const resumo = custoMedio(movs);
    const custo = resumo.custo_medio === null ? null : arred4(resumo.custo_medio);
    const separa = lacradoEfetivo(produto);

    const emitir = (
      tipo: MovimentoPlanejado["movement_type"],
      quantity: number,
      estado: "lacrado" | "avulso" | null,
      presentationId: string | null,
    ) => {
      const criado = new Date(base + ++seq);
      planejadas.push({
        product_id: pid,
        movement_type: tipo,
        quantity,
        package_state: estado,
        presentation_id: presentationId,
        unit_cost: custo,
        created_at: criado,
      });
      movs.push({
        product_id: pid,
        establishment_id: lojaId,
        movement_type: tipo,
        quantity,
        previous_balance: null,
        corrected_balance: null,
        unit_cost: custo,
        occurred_at: p.sold_at,
        created_at: criado,
        canceled_at: null,
        package_state: estado,
        presentation_id: presentationId,
      });
    };

    const faltou = (dito: string) =>
      new AbortarVenda(fail("INSUFFICIENT_STOCK", dito, 409, "items"));

    if (!separa) {
      if (it.base_qty > resumo.saldo && !p.loja.allow_negative_stock) {
        throw faltou(
          `Falta estoque de "${nome}": há ${descreverQuantidade(resumo.saldo, produto.base_unit)} e a venda pede ${descreverQuantidade(it.base_qty, produto.base_unit)}.`,
        );
      }
      emitir("venda", it.base_qty, null, null);
    } else if (it.apresentacao.is_sealed_package) {
      const lacrado = saldosPorEstado(movs).get(chaveDoEstado(it.apresentacao.id)) ?? 0;
      if (it.base_qty > lacrado) {
        throw faltou(
          `Não há "${nome}" fechado suficiente em ${it.apresentacao.name}: há ${descreverQuantidade(lacrado, produto.base_unit)} lacrados e a venda pede ${descreverQuantidade(it.base_qty, produto.base_unit)}.`,
        );
      }
      emitir("venda", it.base_qty, "lacrado", it.apresentacao.id);
    } else {
      let avulso = saldosPorEstado(movs).get("avulso|-") ?? 0;
      if (avulso < it.base_qty) {
        // Q84: abre a menor embalagem com saldo, uma a uma, passando à maior.
        const fechadas = produto.presentations
          .filter((x) => x.is_sealed_package)
          .map((x) => ({ ap: x, base: decToNum(x.base_qty) ?? 0 }))
          .filter((x) => x.base > 0)
          .sort((a, b) => a.base - b.base);
        for (const f of fechadas) {
          let disponivel = Math.floor(arred3((saldosPorEstado(movs).get(chaveDoEstado(f.ap.id)) ?? 0) / f.base));
          while (avulso < it.base_qty && disponivel > 0) {
            emitir("abertura_lacrado", f.base, "lacrado", f.ap.id);
            emitir("abertura_avulso", f.base, "avulso", null);
            avulso = arred3(avulso + f.base);
            disponivel -= 1;
          }
          if (avulso >= it.base_qty) break;
        }
        if (avulso < it.base_qty && !p.loja.allow_negative_stock) {
          throw faltou(
            `Falta estoque de "${nome}": mesmo abrindo as embalagens, há ${descreverQuantidade(Math.max(0, avulso), produto.base_unit)} e a venda pede ${descreverQuantidade(it.base_qty, produto.base_unit)}.`,
          );
        }
      }
      emitir("venda", it.base_qty, "avulso", null);
    }

    const depois = custoMedio(movs).saldo;
    custos.push({
      unit_cost: custo,
      cost_estimated: resumo.estimado || custo === null,
      cost_provisional: depois < 0,
    });
  }
  return { movs: planejadas, custos };
}

/**
 * Grava a venda inteira dentro de uma transação já aberta, no `turno` resolvido
 * por quem chama (toda venda tem turno, qualquer que seja o pagamento). Devolve
 * o id da venda.
 */
async function gravarVenda(
  tx: Tx,
  ator: Ator,
  p: Preparada,
  turno: TurnoResolvido,
  extra: { exchange_return_id?: string | null; replaces_sale_id?: string | null } = {},
): Promise<string> {
  const { movs, custos } = await planejarBaixa(tx, p);

  const numero = await proximoNumero(tx, "venda");
  const venda = await tx.emporioSale.create({
    data: scoped({
      establishment_id: p.loja.id,
      operation_key: p.chave,
      number: numero,
      customer_id: p.customer_id,
      sold_at: p.sold_at,
      sold_by_user_id: ator.id,
      seller_user_id: p.seller_user_id,
      net_amount: p.net,
      freight_amount: p.frete,
      franchisee_id: p.franchisee_id,
      franchisee_credit: p.franchisee_credit,
      origin: p.origin,
      discount_amount: p.desconto,
      discount_authorized_by_user_id: p.autorizou,
      exchange_return_id: extra.exchange_return_id ?? null,
      replaces_sale_id: extra.replaces_sale_id ?? null,
      cash_session_id: turno.id,
      notes: p.notes,
      quote_id: p.quote?.id ?? null,
      ...p.pedido,
    }),
  });

  // Entrega 4: marca o orçamento faturado só se ninguém o faturou entre a
  // conferência e aqui. Dois balcões ao mesmo tempo: o segundo aborta inteiro.
  if (p.quote) {
    const marcado = await tx.emporioQuote.updateMany({ where: { id: p.quote.id, sale_id: null, canceled_at: null }, data: { sale_id: venda.id } });
    if (marcado.count === 0) {
      const atual = await tx.emporioQuote.findFirst({
        where: { id: p.quote.id },
        select: { canceled_at: true, sale: { select: { number: true } } },
      });
      if (atual?.canceled_at) throw new AbortarVenda(QUOTE_CANCELED());
      throw new AbortarVenda(atual?.sale ? QUOTE_ALREADY_INVOICED(atual.sale.number) : QUOTE_NOT_FOUND());
    }
  }

  // A liberação do fiado: consumida só se ninguém a usou entre o preparo e aqui.
  if (p.credit_release_id) {
    const consumida = await tx.emporioCreditRelease.updateMany({
      where: scoped({ id: p.credit_release_id, consumed_sale_id: null }),
      data: { consumed_sale_id: venda.id, consumed_at: new Date() },
    });
    if (consumida.count === 0) throw new AbortarVenda(FIADO_BLOQUEADO_CONSUMIDA());
  } else if (p.customer_id) {
    // 2.37: duas vendas em fiado ao mesmo tempo liam a mesma dívida no preparo e passavam as duas do limite.
    // Dentro da transação serializável a conferência se repete, e a segunda a perder recusa.
    const fiadoDaVenda = p.pagamentos.find((x) => x.kind === "fiado");
    if (fiadoDaVenda) {
      const conferido = await conferirFiado(tx, p.customer_id, p.loja.id, fiadoDaVenda.amount, extra.replaces_sale_id ?? null);
      if (conferido.recusa) throw new AbortarVenda(conferido.recusa);
    }
  }

  await tx.emporioSaleItem.createMany({
    data: p.itens.map((i, n) =>
      scoped({
        sale_id: venda.id,
        emporio_product_id: i.produto.id,
        presentation_id: i.apresentacao.id,
        quantity: i.quantity,
        base_qty: i.base_qty,
        suggested_price: i.suggested,
        unit_price: i.unit_price,
        total: i.total,
        unit_cost: custos[n].unit_cost,
        cost_estimated: custos[n].cost_estimated,
        cost_provisional: custos[n].cost_provisional,
      }),
    ),
  });

  await tx.stockMovement.createMany({
    data: movs.map((m) =>
      scoped({
        product_id: m.product_id,
        establishment_id: p.loja.id,
        property_id: null,
        movement_type: m.movement_type,
        quantity: m.quantity,
        occurred_at: p.sold_at,
        package_state: m.package_state,
        presentation_id: m.presentation_id,
        unit_cost: m.unit_cost,
        sale_id: venda.id,
        recorded_by_user_id: ator.id,
        created_at: m.created_at,
      }),
    ),
  });

  const fiado = p.pagamentos.find((x) => x.kind === "fiado") ?? null;
  const unico = p.troca === 0 && p.pagamentos.length === 1 ? p.pagamentos[0].kind : null;
  const formaUnica = unico === null || unico === "fiado" ? null : ehCartao(unico) ? ("cartao" as const) : unico;
  const lancamento = await createLinkedEntry(tx, {
    entry_type: "income",
    category: CATEGORIA_VENDAS,
    amount: arred2(p.net + p.frete + p.franchisee_credit),
    related_module: "emporio",
    related_id: venda.id,
    occurred_at: p.sold_at,
    status: "pending",
    due_date: fiado?.due_date ?? p.sold_at,
    emporio_customer_id: p.customer_id,
    establishment_id: p.loja.id,
    payment_method: formaUnica,
  });

  let taxaTotalCent = 0;
  const antecipacaoCustoCent: { id: string; cent: number }[] = [];
  for (const pg of p.pagamentos) {
    if (pg.kind === "fiado") {
      await tx.emporioSalePayment.create({
        data: scoped({ sale_id: venda.id, kind: "fiado" as const, amount: pg.amount, due_date: pg.due_date }),
      });
      continue;
    }
    if (ehCartao(pg.kind) && pg.cartao) {
      // Cartão e cheque não mexem no caixa agora: a parcela É o a receber.
      const fp = await tx.financialPayment.create({
        data: scoped({
          entry_id: lancamento.id,
          amount: pg.amount,
          paid_at: p.sold_at,
          method: "cartao" as const,
          created_by_user_id: ator.id,
        }),
      });
      const sp = await tx.emporioSalePayment.create({
        data: scoped({
          sale_id: venda.id,
          kind: pg.kind,
          amount: pg.amount,
          bank_account_id: pg.bank_account_id,
          financial_payment_id: fp.id,
          installments: pg.cartao.installments,
          fee_pct: pg.cartao.fee_pct,
          fee_amount: pg.cartao.fee_amount,
          acquirer_id: pg.cartao.acquirer_id,
          brand: pg.cartao.brand,
          fee_fixed_amount: pg.cartao.fee_fixed_amount,
          fee_rate_id: pg.cartao.fee_rate_id,
        }),
      });
      const cartaoDoPagamento = pg.cartao;
      const n = pg.cartao.parcelas;
      const brutas = dividirEmParcelas(centavos(pg.amount), n);
      const liquidas = dividirEmParcelas(centavos(pg.amount) - centavos(pg.cartao.fee_amount), n);
      const datas = datasDasParcelas(p.sold_at, pg.cartao.days, n, pg.cartao.regra_dia_util);
      // A antecipação automática: a parcela só antecipa se o dia da operação vier antes do previsto.
      const auto = pg.cartao.auto;
      const operadaEm = auto ? somarDiasUteis(hojeEmBrasilia(p.sold_at), auto.dias_uteis) : null;
      const antecipa = datas.map((d) => operadaEm !== null && operadaEm.getTime() < d.getTime());
      const custosDasParcelas = liquidas.map((liquida, i) =>
        auto && operadaEm && antecipa[i] ? custoAntecipacaoCent(liquida, auto.pct_mes, operadaEm, datas[i]) : 0,
      );
      const custoDoPagamentoCent = custosDasParcelas.reduce((a, b) => a + b, 0);
      let antecipacaoId: string | null = null;
      if (auto && operadaEm && antecipa.some(Boolean)) {
        const brutoAntecipado = brutas.reduce((s, b, i) => (antecipa[i] ? s + b : s), 0);
        const previstoAntecipado = liquidas.reduce((s, l, i) => (antecipa[i] ? s + l : s), 0);
        const antecipacao = await tx.cardAnticipation.create({
          data: scoped({
            acquirer_id: cartaoDoPagamento.acquirer_id,
            bank_account_id: pg.bank_account_id as string,
            operated_on: operadaEm,
            kind: "automatica" as const,
            gross_amount: brutoAntecipado / 100,
            expected_net: previstoAntecipado / 100,
            received_net: (previstoAntecipado - custoDoPagamentoCent) / 100,
            fee_amount: custoDoPagamentoCent / 100,
            created_by_user_id: ator.id,
          }),
        });
        antecipacaoId = antecipacao.id;
        if (custoDoPagamentoCent > 0) antecipacaoCustoCent.push({ id: antecipacao.id, cent: custoDoPagamentoCent });
      }
      await tx.cardReceivable.createMany({
        data: brutas.map((bruta, i) =>
          scoped({
            sale_id: venda.id,
            sale_payment_id: sp.id,
            establishment_id: p.loja.id,
            bank_account_id: pg.bank_account_id as string,
            installment: i + 1,
            installments: n,
            gross_amount: bruta / 100,
            net_amount: liquidas[i] / 100,
            fee_amount: (bruta - liquidas[i]) / 100,
            expected_on: datas[i],
            effective_on: antecipa[i] && operadaEm ? operadaEm : datas[i],
            effective_net: (liquidas[i] - custosDasParcelas[i]) / 100,
            anticipation_fee: antecipa[i] ? custosDasParcelas[i] / 100 : null,
            anticipation_id: antecipa[i] ? antecipacaoId : null,
            acquirer_id: cartaoDoPagamento.acquirer_id,
            brand: cartaoDoPagamento.brand,
          }),
        ),
      });
      taxaTotalCent += centavos(pg.cartao.fee_amount);
      continue;
    }
    if (pg.kind === "cheque" && pg.cheque) {
      const fp = await tx.financialPayment.create({
        data: scoped({
          entry_id: lancamento.id,
          amount: pg.amount,
          paid_at: p.sold_at,
          method: "cheque" as const,
          created_by_user_id: ator.id,
        }),
      });
      const sp = await tx.emporioSalePayment.create({
        data: scoped({ sale_id: venda.id, kind: "cheque" as const, amount: pg.amount, financial_payment_id: fp.id }),
      });
      await tx.emporioCheck.create({
        data: scoped({
          sale_id: venda.id,
          sale_payment_id: sp.id,
          customer_id: p.customer_id as string,
          establishment_id: p.loja.id,
          number: pg.cheque.number,
          holder_name: pg.cheque.holder_name,
          bank: pg.cheque.bank,
          good_for: pg.cheque.good_for,
          amount: pg.amount,
          status: "recebido" as const,
          financial_payment_id: fp.id,
          updated_by_user_id: ator.id,
        }),
      });
      continue;
    }
    if (pg.kind === "boleto" && pg.boleto) {
      const fp = await tx.financialPayment.create({
        data: scoped({
          entry_id: lancamento.id,
          amount: pg.amount,
          paid_at: p.sold_at,
          method: "boleto" as const,
          created_by_user_id: ator.id,
        }),
      });
      const sp = await tx.emporioSalePayment.create({
        data: scoped({ sale_id: venda.id, kind: "boleto" as const, amount: pg.amount, financial_payment_id: fp.id }),
      });
      await tx.emporioBoleto.create({
        data: scoped({
          sale_id: venda.id,
          sale_payment_id: sp.id,
          customer_id: p.customer_id as string,
          establishment_id: p.loja.id,
          number: pg.boleto.number,
          due_on: pg.boleto.due_on,
          amount: pg.amount,
          status: "aberto" as const,
          financial_payment_id: fp.id,
          updated_by_user_id: ator.id,
        }),
      });
      continue;
    }
    if (pg.kind !== "dinheiro" && pg.kind !== "pix") continue;
    const fp = await tx.financialPayment.create({
      data: scoped({
        entry_id: lancamento.id,
        amount: pg.amount,
        paid_at: p.sold_at,
        method: pg.kind,
        created_by_user_id: ator.id,
      }),
    });
    await tx.cashMovement.create({
      data: scoped({
        establishment_id: pg.kind === "dinheiro" ? p.loja.id : null,
        cash_register_id: pg.kind === "dinheiro" ? turno.cash_register_id : null,
        cash_session_id: turno.id,
        bank_account_id: pg.kind === "pix" ? pg.bank_account_id : null,
        direction: "entrada" as const,
        amount: pg.amount,
        origin: "venda" as const,
        occurred_at: p.sold_at,
        sale_id: venda.id,
        financial_payment_id: fp.id,
        created_by_user_id: ator.id,
      }),
    });
    await tx.emporioSalePayment.create({
      data: scoped({
        sale_id: venda.id,
        kind: pg.kind,
        amount: pg.amount,
        bank_account_id: pg.bank_account_id,
        financial_payment_id: fp.id,
      }),
    });
  }

  if (p.troca > 0) {
    const fp = await tx.financialPayment.create({
      data: scoped({
        entry_id: lancamento.id,
        amount: p.troca,
        paid_at: p.sold_at,
        method: "outro" as const,
        notes: "Valor devolvido na troca",
        created_by_user_id: ator.id,
      }),
    });
    await tx.emporioSalePayment.create({
      data: scoped({ sale_id: venda.id, kind: "troca" as const, amount: p.troca, financial_payment_id: fp.id }),
    });
  }

  // A taxa é despesa à parte, no mesmo `related_id` da venda: por isso toda
  // busca do lançamento da venda filtra `entry_type: "income"`.
  if (taxaTotalCent > 0) {
    await createLinkedEntry(tx, {
      entry_type: "expense",
      category: CATEGORIA_TAXAS_CARTAO,
      amount: taxaTotalCent / 100,
      related_module: "emporio",
      related_id: venda.id,
      occurred_at: p.sold_at,
      status: "paid",
      establishment_id: p.loja.id,
      payment_method: "cartao",
    });
  }

  // O custo da antecipação automática: uma despesa por pagamento antecipado, apontando para a operação.
  for (const a of antecipacaoCustoCent) {
    await createLinkedEntry(tx, {
      entry_type: "expense",
      category: CATEGORIA_ANTECIPACAO,
      amount: a.cent / 100,
      related_module: "emporio",
      related_id: a.id,
      occurred_at: p.sold_at,
      status: "paid",
      establishment_id: p.loja.id,
      payment_method: "cartao",
    });
  }

  // O frete cobrado do cliente é repasse à transportadora (Q244, Q246): conta a pagar à parte; a receita já o inclui.
  if (p.frete > 0) {
    await createLinkedEntry(tx, {
      entry_type: "expense",
      category: CATEGORIA_FRETE,
      amount: p.frete,
      related_module: "emporio",
      related_id: venda.id,
      occurred_at: p.sold_at,
      status: "pending",
      due_date: p.sold_at,
      establishment_id: p.loja.id,
    });
  }

  if (!fiado) {
    await tx.financialEntry.update({ where: { id: lancamento.id }, data: { status: "paid", paid_at: p.sold_at } });
  }

  // F4a (Q97, Q98): o "Vendeu, Pagou" entra na mesma transação, depois dos
  // itens e dos pagamentos. A troca conta como parte paga da venda nova.
  await gravarVendeuPagou(tx, ator, {
    sale_id: venda.id,
    establishment_id: p.loja.id,
    sold_at: p.sold_at,
    net: p.net,
    // O crédito do franqueado, como o frete, é cobrado a mais: entra na conta de quanto de cada forma foi
    // paga (os pagamentos fecham net + frete + crédito), nunca na base das regras (Q303).
    frete: arred2(p.frete + p.franchisee_credit),
    itens: p.itens.map((i) => ({
      emporio_product_id: i.produto.id,
      presentation_id: i.apresentacao.id,
      presentation_name: i.apresentacao.name,
      quantity: i.quantity,
      total: i.total,
    })),
    pagamentos: [
      ...p.pagamentos.map((x) => ({ kind: x.kind as string, amount: x.amount })),
      ...(p.troca > 0 ? [{ kind: "troca", amount: p.troca }] : []),
    ],
  });
  return venda.id;
}

export async function venderAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: VenderInput,
): Promise<ActionResult<VendaView & { replayed: boolean }>> {
  const neg = await exigir(db, ator, "vendedor_da_loja", "vender");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  // §23.2: repetir a chave devolve a venda gravada, sem escrever nada.
  const repetida = await db.emporioSale.findFirst({ where: { operation_key: chave }, select: { id: true } });
  if (repetida) {
    const v = await vendaPorId(db, repetida.id);
    if (v && (await lojaVisivel(db, ator, v.establishment_id))) return ok({ ...v, replayed: true });
    return NAO_ACHADO("Venda");
  }

  const prep = await prepararVenda(db, ator, input);
  if (!prep.ok) return prep;

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const turno = await turnoOuAborta(tx, ator, prep.data.loja.id, prep.data.cash_register_id);
      const novaId = await gravarVenda(tx, ator, prep.data, turno);
      await registrarNoHistorico(tx, ator, {
        action: "venda.criar",
        establishment_id: prep.data.loja.id,
        target_type: "venda",
        target_id: novaId,
        summary: `Vendeu ${dinheiro(prep.data.net)} na ${prep.data.loja.name} (${frasItens(prep.data.itens.length)})${
          prep.data.quote ? ` do orçamento nº ${formatarNumero(prep.data.quote.number)}` : ""
        }${prep.data.pedido.for_delivery ? ", para entrega" : ""}${
          prep.data.frete > 0 ? `, com frete ${dinheiro(prep.data.frete)}` : ""
        }${fraseDoCredito(prep.data.franchisee_credit)}`,
      });
      return novaId;
    });
    const v = await vendaPorId(db, id);
    return v ? ok({ ...v, replayed: false }) : NAO_ACHADO("Venda");
  } catch (err) {
    // A mesma chave em paralelo: a outra gravou enquanto esta corria (e o turno
    // pode ter fechado no meio). A recusa só vale se a chave segue sem venda.
    if (err instanceof AbortarVenda || ehErroUnico(err)) {
      const igual = await db.emporioSale.findFirst({ where: { operation_key: chave }, select: { id: true } });
      const v = igual ? await vendaPorId(db, igual.id) : null;
      if (v) return (await lojaVisivel(db, ator, v.establishment_id)) ? ok({ ...v, replayed: true }) : NAO_ACHADO("Venda");
      if (err instanceof AbortarVenda) return err.recusa;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cancelamento total
// ---------------------------------------------------------------------------

type VendaParaCancelar = PedidoParaEntregaColunas & {
  id: string;
  establishment_id: string;
  status: string;
  exchange_return_id: string | null;
  net_amount: Prisma.Decimal;
  sold_at: Date;
  customer_id: string | null;
  seller_user_id: string | null;
  quote_id: string | null;
  franchisee_id: string | null;
  franchisee_credit: Prisma.Decimal;
  establishment: { name: string };
  _count: { returns: number };
};

const COLUNAS_DE_ENTREGA_DA_VENDA = {
  for_delivery: true,
  delivery_address_kind: true,
  delivery_zip: true,
  delivery_street: true,
  delivery_number: true,
  delivery_complement: true,
  delivery_district: true,
  delivery_city: true,
  delivery_state: true,
} as const;

/** As travas de fora da transação do cancelamento, que a edição da venda reaproveita (Q249). */
async function conferirCancelamento(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<VendaParaCancelar>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "cancelar uma venda");
  if (neg) return neg;
  const venda = await db.emporioSale.findFirst({
    where: { id },
    select: {
      id: true,
      establishment_id: true,
      status: true,
      exchange_return_id: true,
      net_amount: true,
      sold_at: true,
      customer_id: true,
      seller_user_id: true,
      ...COLUNAS_DE_ENTREGA_DA_VENDA,
      quote_id: true,
      franchisee_id: true,
      franchisee_credit: true,
      establishment: { select: { name: true } },
      _count: { select: { returns: true } },
    },
  });
  if (!venda || !(await lojaVisivel(db, ator, venda.establishment_id))) return NAO_ACHADO("Venda");
  if (venda.status === "cancelada") return fail("SALE_CANCELED", "Essa venda já foi cancelada.", 409);
  // A venda nova da troca foi paga com o valor devolvido, que não tem gaveta
  // para onde voltar: desfazer é devolver a mercadoria dela.
  if (venda.exchange_return_id) {
    return fail("SALE_IS_EXCHANGE", "Essa venda é de uma troca: devolva os itens em vez de cancelar.", 409);
  }
  if (venda._count.returns > 0) {
    return fail("SALE_HAS_RETURNS", "Essa venda tem devolução: não dá para cancelar a venda inteira.", 409);
  }
  return ok(venda);
}

export async function cancelarVendaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string; cash_register_id?: string | null },
): Promise<ActionResult<VendaView>> {
  const conf = await conferirCancelamento(db, ator, id);
  if (!conf.ok) return conf;
  const venda = conf.data;
  const motivo = String(input?.reason ?? "").trim();
  if (!motivo) return fail("VALIDATION_ERROR", "Diga o motivo do cancelamento.", 422, "reason");

  try {
    await runSerializableTenantTransaction(db, (tx) => cancelarNaTransacao(tx, ator, venda, motivo, input?.cash_register_id));
  } catch (err) {
    if (err instanceof AbortarVenda) return err.recusa;
    throw err;
  }
  const v = await vendaPorId(db, id);
  return v ? ok(v) : NAO_ACHADO("Venda");
}

/** O corpo da transação do cancelamento: a edição o roda antes de gravar a venda nova. */
async function cancelarNaTransacao(
  tx: Tx,
  ator: Ator,
  venda: VendaParaCancelar,
  motivo: string,
  cash_register_id: string | null | undefined,
): Promise<void> {
  const id = venda.id;
  const agora = new Date();
  const emAcordo = await tx.financialEntry.findFirst({
    where: { related_module: "emporio", entry_type: "income", related_id: id, agreement_id: { not: null } },
    select: { agreement: { select: { created_at: true } } },
  });
  if (emAcordo?.agreement) {
    const quando = emAcordo.agreement.created_at.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    throw new AbortarVenda(
      fail(
        "VENDA_EM_ACORDO",
        `Esta venda entrou no acordo de ${quando} com o cliente. Desfaça o acordo antes de cancelar a venda.`,
        409,
        "sale_id",
      ),
    );
  }
  const r = await tx.emporioSale.updateMany({
    where: { id, status: "concluida" },
    data: { status: "cancelada", canceled_at: agora, canceled_by_user_id: ator.id, canceled_reason: motivo },
  });
  if (r.count === 0) throw new AbortarVenda(fail("SALE_CANCELED", "Essa venda já foi cancelada.", 409));
  // Entrega 4: o orçamento que ela faturou volta a aberto (a venda guarda o `quote_id`).
  await tx.emporioQuote.updateMany({ where: { sale_id: id }, data: { sale_id: null } });
  await registrarNoHistorico(tx, ator, {
    action: "venda.cancelar",
    establishment_id: venda.establishment_id,
    target_type: "venda",
    target_id: id,
    summary: `Cancelou a venda de ${dinheiro(decToNum(venda.net_amount) ?? 0)} da ${venda.establishment.name}: ${motivo}`,
  });

  // As aberturas ficam: a saca foi aberta de verdade.
  await tx.stockMovement.updateMany({
    where: { sale_id: id, movement_type: "venda", canceled_at: null },
    data: { canceled_at: agora, canceled_reason: motivo },
  });

  // Cheque (Q94): o que ainda está na carteira volta ao cliente; o que já
  // foi ao banco não se desfaz por aqui.
  const cheques = await tx.emporioCheck.findMany({ where: { sale_id: id }, select: { id: true, status: true } });
  if (cheques.some((c) => c.status === "depositado" || c.status === "compensado")) {
    throw new AbortarVenda(
      fail(
        "SALE_HAS_DEPOSITED_CHECK",
        "Essa venda tem cheque já depositado ou compensado: não dá para cancelar.",
        409,
      ),
    );
  }
  await tx.emporioCheck.updateMany({
    where: { sale_id: id, status: "recebido" },
    data: { status: "devolvido_ao_cliente", updated_by_user_id: ator.id },
  });

  // Boleto (Q281): o aberto some com a venda; o pago já pôs dinheiro na conta e não se desfaz por aqui.
  // O mandado ao fiado (`no_fiado`) fica como está: a dívida dele já é da venda cancelada.
  const boletos = await tx.emporioBoleto.findMany({ where: { sale_id: id }, select: { status: true } });
  if (boletos.some((b) => b.status === "pago")) {
    throw new AbortarVenda(
      fail("SALE_HAS_PAID_BOLETO", "Essa venda tem boleto já pago: não dá para cancelar.", 409),
    );
  }
  await tx.emporioBoleto.updateMany({
    where: { sale_id: id, status: "aberto" },
    data: { status: "cancelado", updated_by_user_id: ator.id },
  });

  // Cartão (Q94, Q261): a parcela que ainda não caiu de fato (data efetiva
  // futura) some; a que já caiu sai da conta pelo líquido EFETIVO (o antecipado
  // entrou menor). A que caiu continua não cancelada, e o estorno a compensa no saldo.
  const hoje = hojeEmBrasilia(agora);
  const parcelas = await tx.cardReceivable.findMany({ where: { sale_id: id, canceled_at: null } });
  for (const parcela of parcelas) {
    if (parcela.effective_on.getTime() > hoje.getTime()) {
      await tx.cardReceivable.update({ where: { id: parcela.id }, data: { canceled_at: agora } });
      continue;
    }
    await tx.cashMovement.create({
      data: scoped({
        establishment_id: null,
        bank_account_id: parcela.bank_account_id,
        direction: "saida" as const,
        amount: decToNum(parcela.effective_net) ?? 0,
        origin: "estorno_cartao" as const,
        occurred_at: agora,
        sale_id: id,
        card_receivable_id: parcela.id,
        notes: motivo,
        created_by_user_id: ator.id,
      }),
    });
  }
  // A taxa (MDR) só some se a adquirente devolve no cancelamento (como a Stone);
  // pagamento sem adquirente cancela, como sempre. A despesa é uma só por venda:
  // se alguma adquirente da venda não devolve, ela fica. A despesa de antecipação
  // (`CATEGORIA_ANTECIPACAO`) nunca é tocada aqui: o custo de antecipar não volta.
  const adquirentes = await tx.emporioSalePayment.findMany({
    where: { sale_id: id, acquirer_id: { not: null } },
    select: { acquirer: { select: { refunds_mdr_on_cancel: true } } },
  });
  if (adquirentes.every((a) => a.acquirer?.refunds_mdr_on_cancel !== false)) {
    await tx.financialEntry.updateMany({
      where: { related_module: "emporio", entry_type: "expense", category: CATEGORIA_TAXAS_CARTAO, related_id: id },
      data: { status: "cancelled" },
    });
  }
  // Frete (Q244): a conta a pagar sem pagamento some; a paga fica. Em aprovação, recusa antes de escrever.
  const contasDoFrete = await tx.financialEntry.findMany({
    where: { related_module: "emporio", entry_type: "expense", category: CATEGORIA_FRETE, related_id: id, status: "pending" },
    select: { id: true },
  });
  if (contasDoFrete.length > 0 && (await contaEmAprovacao(tx, contasDoFrete.map((c) => c.id)))) {
    throw new AbortarVenda(fail("CONTA_EM_APROVACAO", EM_APROVACAO, 409, "sale_id"));
  }
  await tx.financialEntry.updateMany({
    where: { id: { in: contasDoFrete.map((c) => c.id) } },
    data: { status: "cancelled" },
  });
  // F4a (Q99): o "Vendeu, Pagou" não pago some com a venda; o pago fica.
  const vp = await cancelarVendeuPagou(tx, id, agora, motivo);
  if (!vp.ok) throw new AbortarVenda(vp);

  const lancamento = await tx.financialEntry.findFirst({
    where: { related_module: "emporio", entry_type: "income", related_id: id },
    select: { id: true },
  });
  if (!lancamento) return;
  await tx.financialEntry.update({ where: { id: lancamento.id }, data: { status: "cancelled" } });

  // Só o pagamento que pôs dinheiro na gaveta ou na conta tem saída a
  // fazer: cartão e cheque não geraram movimento de entrada. A saída da
  // gaveta cai no turno aberto agora na loja em que o dinheiro entrou, não
  // no caixa de origem (aquele turno pode já ter encerrado). O fiado pode ter
  // sido recebido em outra loja: o turno é resolvido por loja, e o caixa
  // pedido só vale na loja dele.
  const pagamentos = await tx.financialPayment.findMany({ where: { entry_id: lancamento.id }, select: { id: true } });
  const pedido = pedidoDeCaixa(cash_register_id);
  const lojaDoPedido = pedido
    ? ((await tx.cashRegister.findFirst({ where: { id: pedido }, select: { establishment_id: true } }))?.establishment_id ?? null)
    : null;
  const turnos = new Map<string, TurnoResolvido>();
  const turnoDaLoja = async (lojaId: string): Promise<TurnoResolvido> => {
    const ja = turnos.get(lojaId);
    if (ja) return ja;
    // Caixa pedido que não é de nenhuma loja daqui: vai como pedido, e o resolverTurno recusa.
    const t = await turnoOuAborta(tx, ator, lojaId, lojaDoPedido === lojaId || !lojaDoPedido ? pedido : null);
    turnos.set(lojaId, t);
    return t;
  };
  for (const fp of pagamentos) {
    const entrada = await tx.cashMovement.findFirst({
      where: { financial_payment_id: fp.id, direction: "entrada", origin: { in: ["venda", "recebimento_fiado"] } },
    });
    if (!entrada) continue;
    const gaveta = entrada.establishment_id ? await turnoDaLoja(entrada.establishment_id) : null;
    await tx.cashMovement.create({
      data: scoped({
        establishment_id: entrada.establishment_id,
        cash_register_id: gaveta?.cash_register_id ?? null,
        cash_session_id: gaveta?.id ?? null,
        bank_account_id: entrada.bank_account_id,
        direction: "saida" as const,
        amount: decToNum(entrada.amount) ?? 0,
        origin: "cancelamento_venda" as const,
        occurred_at: agora,
        sale_id: id,
        financial_payment_id: fp.id,
        notes: motivo,
        created_by_user_id: ator.id,
      }),
    });
  }
}

// ---------------------------------------------------------------------------
// Editar a venda (Q249): cancela a antiga e registra a nova, numa transação só
// ---------------------------------------------------------------------------

const MOTIVO_PROVISORIO = "Substituída pela venda nº (em edição)";

export type EditarVendaInput = Omit<VenderInput, "establishment_id"> & { reason?: string | null };

/**
 * Não há edição no lugar: a venda antiga é cancelada (estoque, caixa, financeiro
 * e "Vendeu, Pagou" voltam como no cancelamento) e a nova nasce com
 * `replaces_sale_id`. Se qualquer passo recusa, nada muda: a antiga segue
 * concluída. A loja é a da venda antiga; data, vendedor e orçamento herdam dela
 * quando o corpo não os traz.
 */
export async function editarVendaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: EditarVendaInput,
): Promise<ActionResult<VendaView & { replayed: boolean }>> {
  const neg = await exigir(db, ator, "gestor_da_loja", "editar uma venda");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const repetida = await db.emporioSale.findFirst({ where: { operation_key: chave }, select: { id: true } });
  if (repetida) {
    const v = await vendaPorId(db, repetida.id);
    // Só é replay a venda que substitui esta; a chave de outra venda é recusa.
    if (v && v.replaces?.id !== id) return CHAVE_DE_OUTRA_VENDA();
    if (v && (await lojaVisivel(db, ator, v.establishment_id))) return ok({ ...v, replayed: true });
    return NAO_ACHADO("Venda");
  }

  const conf = await conferirCancelamento(db, ator, id);
  if (!conf.ok) return conf;
  const antiga = conf.data;

  // Sem `for_delivery` no corpo, o pedido para entrega é o da antiga; com ele, vale o corpo.
  const entregaDaAntiga =
    input.for_delivery === undefined
      ? {
          for_delivery: antiga.for_delivery,
          delivery_address_kind: antiga.delivery_address_kind,
          delivery_zip: antiga.delivery_zip,
          delivery_street: antiga.delivery_street,
          delivery_number: antiga.delivery_number,
          delivery_complement: antiga.delivery_complement,
          delivery_district: antiga.delivery_district,
          delivery_city: antiga.delivery_city,
          delivery_state: antiga.delivery_state,
        }
      : {};
  const prep = await prepararVenda(
    db,
    ator,
    {
      ...input,
      ...entregaDaAntiga,
      operation_key: chave,
      establishment_id: antiga.establishment_id,
      customer_id: input.customer_id ?? antiga.customer_id,
      sold_at: input.sold_at ?? antiga.sold_at,
      seller_user_id: input.seller_user_id ?? antiga.seller_user_id,
      // `undefined` herda o orçamento da antiga; `null` é "sem orçamento" (o cancelamento já o solta).
      quote_id: input.quote_id === undefined ? antiga.quote_id : input.quote_id,
      // Q305: a nova carrega o franqueado e o crédito da antiga quando o corpo não os traz (a antiga, cancelada, deixa de contar).
      ...(input.franchisee_id === undefined && input.franchisee_credit === undefined
        ? { franchisee_id: antiga.franchisee_id, franchisee_credit: decToNum(antiga.franchisee_credit) ?? 0 }
        : {}),
    },
    { substituindo: id, franqueadoAtual: antiga.franchisee_id },
  );
  if (!prep.ok) return prep;
  const motivo = String(input.reason ?? "").trim();

  try {
    const novaId = await runSerializableTenantTransaction(db, async (tx) => {
      // A antiga primeiro: o estoque dela volta antes de a nova planejar a baixa.
      await cancelarNaTransacao(tx, ator, antiga, MOTIVO_PROVISORIO, input.cash_register_id);
      const turno = await turnoOuAborta(tx, ator, prep.data.loja.id, prep.data.cash_register_id);
      const nova = await gravarVenda(tx, ator, prep.data, turno, { replaces_sale_id: id });
      const numero = await tx.emporioSale.findFirst({ where: { id: nova }, select: { number: true } });
      const rotulo = formatarNumero(numero?.number ?? 0);
      await tx.emporioSale.update({
        where: { id },
        data: { canceled_reason: `Substituída pela venda nº ${rotulo}${motivo ? `: ${motivo}` : ""}` },
      });
      // O texto provisório (o número novo ainda não existia) vira o final onde o cancelamento o gravou.
      const final = `Substituída pela venda nº ${rotulo}`;
      const despesas = await tx.saleVariableExpense.findMany({ where: { sale_id: id }, select: { id: true } });
      await tx.stockMovement.updateMany({
        where: {
          canceled_reason: MOTIVO_PROVISORIO,
          OR: [{ sale_id: id }, { sale_variable_expense_id: { in: despesas.map((d) => d.id) } }],
        },
        data: { canceled_reason: final },
      });
      await tx.cashMovement.updateMany({ where: { sale_id: id, notes: MOTIVO_PROVISORIO }, data: { notes: final } });
      const logCancelar = await tx.emporioAuditLog.findFirst({
        where: { action: "venda.cancelar", target_id: id, summary: { endsWith: MOTIVO_PROVISORIO } },
        select: { id: true, summary: true },
      });
      if (logCancelar) {
        await tx.emporioAuditLog.update({
          where: { id: logCancelar.id },
          data: { summary: logCancelar.summary.slice(0, -MOTIVO_PROVISORIO.length) + final },
        });
      }
      await registrarNoHistorico(tx, ator, {
        action: "venda.editar",
        establishment_id: prep.data.loja.id,
        target_type: "venda",
        target_id: nova,
        summary: `Substituiu a venda nº ${formatarNumero(await numeroDaVenda(tx, id))} pela nº ${rotulo} na ${prep.data.loja.name} (${frasItens(
          prep.data.itens.length,
        )}, total ${dinheiro(prep.data.net + prep.data.frete + prep.data.franchisee_credit)}${fraseDoCredito(prep.data.franchisee_credit)})${motivo ? `: ${motivo}` : ""}`,
      });
      return nova;
    });
    const v = await vendaPorId(db, novaId);
    return v ? ok({ ...v, replayed: false }) : NAO_ACHADO("Venda");
  } catch (err) {
    // A mesma chave em paralelo: a outra gravou enquanto esta corria.
    if (err instanceof AbortarVenda || ehErroUnico(err)) {
      const igual = await db.emporioSale.findFirst({ where: { operation_key: chave }, select: { id: true } });
      const v = igual ? await vendaPorId(db, igual.id) : null;
      if (v && v.replaces?.id !== id) return CHAVE_DE_OUTRA_VENDA();
      if (v) return (await lojaVisivel(db, ator, v.establishment_id)) ? ok({ ...v, replayed: true }) : NAO_ACHADO("Venda");
      if (err instanceof AbortarVenda) return err.recusa;
    }
    throw err;
  }
}

async function numeroDaVenda(tx: Tx, id: string): Promise<number> {
  return (await tx.emporioSale.findFirst({ where: { id }, select: { number: true } }))?.number ?? 0;
}

// ---------------------------------------------------------------------------
// Pedido para entrega depois de fechada (D5)
// ---------------------------------------------------------------------------

const VENDA_CANCELADA_NAO_MUDA = () => fail("VALIDATION_ERROR", "Venda cancelada não muda o pedido para entrega.", 422);
const VENDA_TROCADA_NAO_MUDA = () =>
  fail("VALIDATION_ERROR", "Venda trocada não muda o pedido para entrega: mude na venda da troca.", 422);

const COLUNAS_DO_PEDIDO = [
  "for_delivery",
  "delivery_address_kind",
  "delivery_zip",
  "delivery_street",
  "delivery_number",
  "delivery_complement",
  "delivery_district",
  "delivery_city",
  "delivery_state",
] as const;

/** Venda antiga sem cliente: para entrega, conta como o Consumidor final. */
const SEM_CLIENTE = {
  system_key: CONSUMIDOR_FINAL.system_key,
  name: CONSUMIDOR_FINAL.name,
  person_kind: null,
  phone: null,
  document: null,
  address_zip: null,
  address_street: null,
  address_number: null,
  address_complement: null,
  address_district: null,
  city: null,
  address_state: null,
};

/**
 * Quem fatura muda a marca e o endereço de uma venda fechada. Só as nove
 * colunas e uma linha no Histórico: estoque, caixa e financeiro não mudam. O
 * cliente da venda não muda aqui. A leitura é a de `lerVendaAction`, então quem
 * não enxerga a venda (outra loja, o Caixa numa venda que não é de hoje) recebe
 * 404 antes da permissão.
 */
export async function mudarPedidoParaEntregaAction(
  db: TenantPrismaClient,
  ator: Ator,
  saleId: string,
  input: PedidoParaEntregaInput,
): Promise<ActionResult<VendaView>> {
  const lida = await lerVendaAction(db, ator, saleId);
  if (!lida.ok) return lida;
  const venda = lida.data;
  const neg = await exigir(db, ator, "fatura_na_loja", "mudar o pedido para entrega", venda.establishment_id);
  if (neg) return neg;
  if (venda.status === "cancelada") return VENDA_CANCELADA_NAO_MUDA();
  if (venda.returns.some((r) => r.exchange_sale_id)) return VENDA_TROCADA_NAO_MUDA();
  // Sem a marca no corpo, o pedido não vira retirada por omissão.
  if (typeof input?.for_delivery !== "boolean") {
    return fail("VALIDATION_ERROR", "Marque ou desmarque o pedido para entrega.", 422, "for_delivery");
  }

  const atual = await db.emporioSale.findFirst({
    where: { id: venda.id },
    select: {
      for_delivery: true,
      delivery_address_kind: true,
      delivery_zip: true,
      delivery_street: true,
      delivery_number: true,
      delivery_complement: true,
      delivery_district: true,
      delivery_city: true,
      delivery_state: true,
      customer: { select: CAMPOS_DO_CLIENTE_DA_VENDA },
    },
  });
  if (!atual) return NAO_ACHADO("Venda");
  const resolvido = resolverPedidoParaEntrega(atual.customer ?? SEM_CLIENTE, input);
  if (!resolvido.ok) return resolvido;
  const novo = resolvido.data;
  if (COLUNAS_DO_PEDIDO.every((c) => atual[c] === novo[c])) return ok(venda);

  const linhaAntes = linhaDoEndereco(enderecoDasColunas(atual));
  const linhaDepois = linhaDoEndereco(enderecoDasColunas(novo));
  const numero = formatarNumero(venda.number);
  const summary = !novo.for_delivery
    ? `Mudou a venda nº ${numero} para retirada no balcão`
    : !atual.for_delivery
      ? `Mudou a venda nº ${numero} para entrega (${linhaDepois})`
      : `Mudou o endereço de entrega da venda nº ${numero} (${linhaDepois})`;
  const changes = [
    ...(atual.for_delivery !== novo.for_delivery
      ? [{ campo: "for_delivery", antes: atual.for_delivery, depois: novo.for_delivery }]
      : []),
    ...(linhaAntes !== linhaDepois ? [{ campo: "delivery_address", antes: linhaAntes, depois: linhaDepois }] : []),
  ];

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      // Condicional: quem cancelou entre a leitura e aqui ganha, e esta recusa como cancelada.
      const r = await tx.emporioSale.updateMany({ where: { id: venda.id, status: "concluida" }, data: novo });
      if (r.count === 0) throw new AbortarVenda(VENDA_CANCELADA_NAO_MUDA());
      const trocada = await tx.emporioSaleReturn.findFirst({
        where: { sale_id: venda.id, exchange_sale: { isNot: null } },
        select: { id: true },
      });
      if (trocada) throw new AbortarVenda(VENDA_TROCADA_NAO_MUDA());
      await registrarNoHistorico(tx, ator, {
        action: "venda.pedido_para_entrega",
        establishment_id: venda.establishment_id,
        target_type: "venda",
        target_id: venda.id,
        summary,
        changes,
      });
    });
  } catch (err) {
    if (err instanceof AbortarVenda) return err.recusa;
    throw err;
  }
  const v = await vendaPorId(db, venda.id);
  return v ? ok(v) : NAO_ACHADO("Venda");
}

// ---------------------------------------------------------------------------
// Devolução parcial e troca
// ---------------------------------------------------------------------------

export type DevolucaoItemInput = { sale_item_id: string; quantity: number; loss_reason?: string | null };

const INCLUDE_VENDA_DEVOLUCAO = {
  items: {
    include: {
      return_items: { select: { quantity: true } },
      emporio_product: { include: INCLUDE_PRODUTO },
      presentation: { select: { is_sealed_package: true } },
    },
  },
} as const;

type VendaParaDevolver = NonNullable<Awaited<ReturnType<typeof carregarVendaParaDevolver>>>;

async function carregarVendaParaDevolver(db: TenantPrismaClient, id: string) {
  return db.emporioSale.findFirst({ where: { id }, include: INCLUDE_VENDA_DEVOLUCAO });
}

type LinhaDevolucao = {
  item: VendaParaDevolver["items"][number];
  quantity: number;
  base_qty: number;
  valorCent: number;
  loss_reason: (typeof MOTIVOS_DE_PERDA)[number] | null;
};

function validarItensDevolvidos(venda: VendaParaDevolver, entrada: unknown): ActionResult<{ linhas: LinhaDevolucao[]; totalCent: number }> {
  if (!Array.isArray(entrada) || entrada.length === 0) {
    return fail("VALIDATION_ERROR", "Escolha ao menos um item para devolver.", 422, "items");
  }
  const vistos = new Set<string>();
  const linhas: LinhaDevolucao[] = [];
  for (const raw of entrada as Partial<DevolucaoItemInput>[]) {
    const item = venda.items.find((i) => i.id === raw?.sale_item_id);
    if (!item) return fail("VALIDATION_ERROR", "Um dos itens não pertence a essa venda.", 422, "items");
    if (vistos.has(item.id)) return fail("VALIDATION_ERROR", "O mesmo item aparece mais de uma vez.", 422, "items");
    vistos.add(item.id);
    const nome = item.emporio_product.product.name;
    if (!numero(raw.quantity) || arred3(raw.quantity) <= 0) {
      return fail("VALIDATION_ERROR", `A quantidade devolvida de "${nome}" deve ser maior que zero.`, 422, "items");
    }
    const quantity = arred3(raw.quantity);
    const vendido = decToNum(item.quantity) ?? 0;
    const devolvido = arred3(item.return_items.reduce((t, r) => t + (decToNum(r.quantity) ?? 0), 0));
    const sobra = arred3(vendido - devolvido);
    if (quantity > sobra) {
      return fail(
        "VALIDATION_ERROR",
        `"${nome}": só dá para devolver ${sobra.toLocaleString("pt-BR")} (vendido ${vendido.toLocaleString("pt-BR")}, já devolvido ${devolvido.toLocaleString("pt-BR")}).`,
        422,
        "items",
      );
    }
    const baseVendida = decToNum(item.base_qty) ?? 0;
    const base_qty = arred3((quantity * baseVendida) / vendido);
    const lacrada = item.presentation.is_sealed_package && lacradoEfetivo(item.emporio_product);
    if (lacrada && !Number.isInteger(quantity)) {
      return fail("VALIDATION_ERROR", `A embalagem fechada de "${nome}" só aceita quantidade inteira.`, 422, "items");
    }
    if (item.emporio_product.base_unit === "unidade" && !Number.isInteger(base_qty)) {
      return fail("VALIDATION_ERROR", `"${nome}" é vendido por unidade e só aceita quantidade inteira.`, 422, "items");
    }
    let motivo: LinhaDevolucao["loss_reason"] = null;
    if (raw.loss_reason != null && raw.loss_reason !== "") {
      if (!(MOTIVOS_DE_PERDA as readonly string[]).includes(raw.loss_reason)) {
        return fail("VALIDATION_ERROR", "O motivo da avaria não é válido.", 422, "items");
      }
      motivo = raw.loss_reason as LinhaDevolucao["loss_reason"];
    }
    linhas.push({ item, quantity, base_qty, valorCent: centavos(quantity * (decToNum(item.unit_price) ?? 0)), loss_reason: motivo });
  }
  return ok({ linhas, totalCent: linhas.reduce((s, l) => s + l.valorCent, 0) });
}

/**
 * Grava a devolução dentro de uma transação aberta: a linha da devolução, a
 * mercadoria que volta (e a perda, se avariada) e o dinheiro conforme o
 * `refund_kind`. Na troca (`refund_kind` troca) o valor vira despesa paga sem
 * movimento de caixa; quem chama decide o resto.
 */
async function gravarDevolucao(
  tx: Tx,
  ator: Ator,
  venda: VendaParaDevolver,
  linhas: LinhaDevolucao[],
  d: {
    chave: string;
    refund_kind: "dinheiro" | "abater_fiado" | "troca";
    totalCent: number;
    reason: string | null;
    /** O turno de onde sai o dinheiro: obrigatório quando `refund_kind` é dinheiro. */
    turno?: TurnoResolvido | null;
  },
): Promise<string> {
  const agora = new Date();
  const total = d.totalCent / 100;
  const devolucao = await tx.emporioSaleReturn.create({
    data: scoped({
      sale_id: venda.id,
      operation_key: d.chave,
      refund_kind: d.refund_kind,
      amount: total,
      returned_at: agora,
      returned_by_user_id: ator.id,
      reason: d.reason,
    }),
  });
  await tx.emporioSaleReturnItem.createMany({
    data: linhas.map((l) =>
      scoped({
        return_id: devolucao.id,
        sale_item_id: l.item.id,
        quantity: l.quantity,
        base_qty: l.base_qty,
        loss_reason: l.loss_reason,
      }),
    ),
  });

  for (const l of linhas) {
    const produto = l.item.emporio_product;
    const separa = lacradoEfetivo(produto);
    const lacrada = separa && l.item.presentation.is_sealed_package;
    const estado = separa ? (lacrada ? ("lacrado" as const) : ("avulso" as const)) : null;
    const apresentacao = lacrada ? l.item.presentation_id : null;
    const custo = decToNum(l.item.unit_cost);
    const comum = {
      product_id: produto.product_id,
      establishment_id: venda.establishment_id,
      property_id: null,
      quantity: l.base_qty,
      occurred_at: agora,
      package_state: estado,
      presentation_id: apresentacao,
      unit_cost: custo,
      sale_return_id: devolucao.id,
      recorded_by_user_id: ator.id,
    };
    await tx.stockMovement.create({ data: scoped({ ...comum, movement_type: "devolucao" as const }) });
    if (l.loss_reason) {
      await tx.stockMovement.create({
        data: scoped({ ...comum, movement_type: "perda" as const, loss_reason: l.loss_reason }),
      });
    }
  }

  if (d.refund_kind === "abater_fiado") {
    const lancamento = await tx.financialEntry.findFirst({
      where: { related_module: "emporio", entry_type: "income", related_id: venda.id },
    });
    if (lancamento?.agreement_id) {
      await abaterNoAcordo(tx, lancamento.agreement_id, d.totalCent, total, agora);
      return devolucao.id;
    }
    if (!lancamento || lancamento.status === "cancelled") {
      throw new AbortarVenda(fail("VALIDATION_ERROR", "Essa venda não tem conta a receber para abater.", 422, "amount"));
    }
    const pagos = await tx.financialPayment.aggregate({ where: { entry_id: lancamento.id }, _sum: { amount: true } });
    const valorCent = centavos(decToNum(lancamento.amount) ?? 0);
    const abertoCent = valorCent - centavos(decToNum(pagos._sum.amount) ?? 0);
    if (d.totalCent > abertoCent) {
      throw new AbortarVenda(
        fail(
          "VALIDATION_ERROR",
          abertoCent > 0
            ? `A devolução (${brl(total)}) passa do que o cliente ainda deve nessa venda (${brl(abertoCent / 100)}). Devolva em dinheiro.`
            : "O cliente já pagou essa venda inteira: devolva em dinheiro.",
          422,
          "amount",
        ),
      );
    }
    const novoCent = valorCent - d.totalCent;
    const pagoCent = valorCent - abertoCent;
    await tx.financialEntry.update({
      where: { id: lancamento.id },
      data:
        novoCent === 0
          ? { amount: 0, status: "cancelled" }
          : pagoCent >= novoCent
            ? { amount: novoCent / 100, status: "paid", paid_at: agora }
            : { amount: novoCent / 100 },
    });
    return devolucao.id;
  }

  // Dinheiro e troca devolvem ao cliente o que ele PAGOU: numa venda em fiado
  // ainda não paga, o valor sairia da gaveta sem nunca ter entrado. O teto é o
  // recebido na venda menos o que já voltou por dinheiro ou troca.
  const receita = await tx.financialEntry.findFirst({
    where: { related_module: "emporio", entry_type: "income", related_id: venda.id },
    select: { id: true, amount: true, agreement_id: true },
  });
  const recebido = receita
    ? await tx.financialPayment.aggregate({ where: { entry_id: receita.id }, _sum: { amount: true } })
    : null;
  // Venda em acordo: o acordo é uma dívida só, então o que o cliente pagou no acordo INTEIRO (nas origens
  // de todas as vendas, antes do acordo, e nas parcelas) é devolvível em dinheiro por qualquer venda dele
  // (senão, com o acordo quitado ou com outra venda paga em parte à vista, a devolução não teria saída).
  // O teto continua sendo o valor da própria venda.
  const recebidoNoAcordo = receita?.agreement_id
    ? await tx.financialPayment.aggregate({
        where: { entry: { agreement_id: receita.agreement_id } },
        _sum: { amount: true },
      })
    : null;
  const jaVoltou = await tx.emporioSaleReturn.aggregate({
    where: { sale_id: venda.id, refund_kind: { in: ["dinheiro", "troca"] }, id: { not: devolucao.id } },
    _sum: { amount: true },
  });
  // O recebido das parcelas é do acordo inteiro, então o que já voltou em dinheiro ou troca também é contado no
  // acordo inteiro (todas as vendas que entraram nele): senão duas vendas dividiriam o mesmo recebido em dobro.
  let jaVoltouNoAcordoCent = 0;
  if (receita?.agreement_id) {
    const origensDoAcordo = await tx.financialEntry.findMany({
      where: { agreement_id: receita.agreement_id, related_module: "emporio", entry_type: "income", category: { not: CATEGORIA_ACORDO } },
      select: { related_id: true },
    });
    const vendasDoAcordo = origensDoAcordo.map((o) => o.related_id).filter((x): x is string => !!x);
    const voltouNoAcordo = await tx.emporioSaleReturn.aggregate({
      where: { sale_id: { in: vendasDoAcordo }, refund_kind: { in: ["dinheiro", "troca"] }, id: { not: devolucao.id } },
      _sum: { amount: true },
    });
    jaVoltouNoAcordoCent = centavos(decToNum(voltouNoAcordo._sum.amount) ?? 0);
  }
  // Fora de acordo: o pago nesta venda. Em acordo: o pago em todas as origens e parcelas do acordo (a
  // própria origem desta venda tem `agreement_id`, então já está na soma).
  const recebidoCent = receita?.agreement_id
    ? centavos(decToNum(recebidoNoAcordo?._sum.amount) ?? 0)
    : centavos(decToNum(recebido?._sum.amount) ?? 0);
  // Venda em acordo: teto = min(valor da venda - já voltou desta venda, pago no acordo inteiro - já voltou em TODAS as vendas do acordo).
  const tetoCent = receita?.agreement_id
    ? Math.min(
        centavos(decToNum(receita.amount) ?? 0) - centavos(decToNum(jaVoltou._sum.amount) ?? 0),
        recebidoCent - jaVoltouNoAcordoCent,
      )
    : recebidoCent - centavos(decToNum(jaVoltou._sum.amount) ?? 0);
  if (d.totalCent > tetoCent) {
    throw new AbortarVenda(
      fail(
        "VALIDATION_ERROR",
        tetoCent > 0
          ? `O cliente pagou ${brl(tetoCent / 100)} dessa venda: a devolução (${brl(total)}) passa disso. Abata o resto do fiado.`
          : "O cliente ainda não pagou essa venda: abata do fiado.",
        422,
        "amount",
      ),
    );
  }

  const comDinheiro = d.refund_kind === "dinheiro";
  const despesa = await createLinkedEntry(tx, {
    entry_type: "expense",
    category: CATEGORIA_DEVOLUCOES,
    amount: total,
    related_module: "emporio",
    related_id: devolucao.id,
    occurred_at: agora,
    status: "paid",
    emporio_customer_id: venda.customer_id,
    establishment_id: venda.establishment_id,
    payment_method: comDinheiro ? "dinheiro" : "outro",
  });
  if (comDinheiro) {
    if (!d.turno) throw new Error("devolução em dinheiro sem turno resolvido");
    const fp = await tx.financialPayment.findFirst({ where: { entry_id: despesa.id }, select: { id: true } });
    await tx.cashMovement.create({
      data: scoped({
        establishment_id: venda.establishment_id,
        cash_register_id: d.turno.cash_register_id,
        cash_session_id: d.turno.id,
        bank_account_id: null,
        direction: "saida" as const,
        amount: total,
        origin: "devolucao" as const,
        occurred_at: agora,
        sale_id: venda.id,
        sale_return_id: devolucao.id,
        financial_payment_id: fp?.id ?? null,
        created_by_user_id: ator.id,
      }),
    });
  }
  return devolucao.id;
}

/**
 * A venda entrou num acordo de fiado: o que o cliente devia dela agora está nas parcelas. O
 * abatimento sai da parcela em aberto mais antiga e passa para a seguinte se não couber.
 * Passou do aberto do acordo, recusa como o fiado comum: devolva em dinheiro.
 */
async function abaterNoAcordo(tx: Tx, agreementId: string, totalCent: number, total: number, agora: Date): Promise<void> {
  const parcelas = await tx.financialEntry.findMany({
    where: { agreement_id: agreementId, category: CATEGORIA_ACORDO, status: "pending" },
    orderBy: [{ due_date: "asc" }, { created_at: "asc" }],
  });
  const pagos = await tx.financialPayment.groupBy({
    by: ["entry_id"],
    where: { entry_id: { in: parcelas.map((p) => p.id) } },
    _sum: { amount: true },
  });
  const pagoDe = new Map(pagos.map((p) => [p.entry_id, centavos(decToNum(p._sum.amount) ?? 0)]));
  const abertas = parcelas
    .map((p) => {
      const valor = centavos(decToNum(p.amount) ?? 0);
      return { id: p.id, valor, pago: pagoDe.get(p.id) ?? 0 };
    })
    .filter((p) => p.valor - p.pago > 0);
  const abertoTotal = abertas.reduce((s, p) => s + (p.valor - p.pago), 0);
  if (totalCent > abertoTotal) {
    throw new AbortarVenda(
      fail(
        "VALIDATION_ERROR",
        abertoTotal > 0
          ? `A devolução (${brl(total)}) passa do que o cliente ainda deve no acordo (${brl(abertoTotal / 100)}). Devolva em dinheiro.`
          : "O cliente já pagou o acordo inteiro: devolva em dinheiro.",
        422,
        "amount",
      ),
    );
  }
  let restante = totalCent;
  for (const p of abertas) {
    if (restante <= 0) break;
    const parte = Math.min(restante, p.valor - p.pago);
    restante -= parte;
    const novo = p.valor - parte;
    await tx.financialEntry.update({
      where: { id: p.id },
      // Parcela zerada sem nada pago: cancelada (como o fiado comum), não "paga" de valor 0. Com pagamento, fica paga.
      data:
        novo === 0
          ? { amount: 0, status: "cancelled" }
          : novo === p.pago
            ? { amount: novo / 100, status: "paid", paid_at: agora }
            : { amount: novo / 100 },
    });
  }
}

async function devolucaoPorId(db: TenantPrismaClient, id: string): Promise<DevolucaoView | null> {
  const r = await db.emporioSaleReturn.findFirst({
    where: { id },
    include: { items: true, exchange_sale: { select: { id: true } } },
  });
  return r ? viewDaDevolucao(r) : null;
}

export type DevolverInput = {
  operation_key: string;
  refund_kind: string;
  items: DevolucaoItemInput[];
  reason?: string | null;
  /** Entrega 2: o caixa de onde sai a devolução em dinheiro. */
  cash_register_id?: string | null;
};

export async function devolverAction(
  db: TenantPrismaClient,
  ator: Ator,
  sale_id: string,
  input: DevolverInput,
): Promise<ActionResult<DevolucaoView & { replayed: boolean }>> {
  const neg = await exigir(db, ator, "chave:devolver_trocar", "devolver uma venda");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const venda = await carregarVendaParaDevolver(db, sale_id);
  if (!venda || !(await lojaVisivel(db, ator, venda.establishment_id))) return NAO_ACHADO("Venda");

  const repetida = await db.emporioSaleReturn.findFirst({ where: { operation_key: chave }, select: { id: true, sale_id: true } });
  if (repetida) {
    if (repetida.sale_id !== venda.id) return CHAVE_DE_OUTRA_VENDA();
    const v = await devolucaoPorId(db, repetida.id);
    return v ? ok({ ...v, replayed: true }) : NAO_ACHADO("Devolução");
  }

  if (venda.status === "cancelada") return fail("SALE_CANCELED", "Essa venda foi cancelada.", 409);
  if (input.refund_kind !== "dinheiro" && input.refund_kind !== "abater_fiado") {
    return fail("VALIDATION_ERROR", "Escolha como devolver o valor: dinheiro ou abater do fiado.", 422, "refund_kind");
  }
  const itens = validarItensDevolvidos(venda, input.items);
  if (!itens.ok) return itens;
  const motivo = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : null;

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      // Relê dentro da transação: duas devoluções ao mesmo tempo não passam do vendido.
      const atual = await tx.emporioSale.findFirst({ where: { id: venda.id }, include: INCLUDE_VENDA_DEVOLUCAO });
      if (!atual || atual.status === "cancelada") throw new AbortarVenda(fail("SALE_CANCELED", "Essa venda foi cancelada.", 409));
      const rev = validarItensDevolvidos(atual, input.items);
      if (!rev.ok) throw new AbortarVenda(rev);
      const turno =
        input.refund_kind === "dinheiro"
          ? await turnoOuAborta(tx, ator, atual.establishment_id, pedidoDeCaixa(input.cash_register_id))
          : null;
      const devolucaoId = await gravarDevolucao(tx, ator, atual, rev.data.linhas, {
        chave,
        refund_kind: input.refund_kind as "dinheiro" | "abater_fiado",
        totalCent: rev.data.totalCent,
        reason: motivo,
        turno,
      });
      const emAcordo =
        input.refund_kind === "abater_fiado"
          ? await tx.financialEntry.findFirst({
              where: { related_module: "emporio", entry_type: "income", related_id: atual.id, agreement_id: { not: null } },
              select: { agreement: { select: { created_at: true } } },
            })
          : null;
      await registrarNoHistorico(tx, ator, {
        action: "venda.devolver",
        establishment_id: atual.establishment_id,
        target_type: "venda",
        target_id: atual.id,
        summary: `Devolveu ${dinheiro(rev.data.totalCent / 100)} (${frasItens(rev.data.linhas.length)}) de uma venda da ${await nomeDaLoja(tx, atual.establishment_id)}, ${
          input.refund_kind === "dinheiro"
            ? "em dinheiro"
            : emAcordo?.agreement
              ? `abatendo da parcela do acordo de ${emAcordo.agreement.created_at.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
              : "abatendo do fiado"
        }`,
      });
      return devolucaoId;
    });
    const v = await devolucaoPorId(db, id);
    return v ? ok({ ...v, replayed: false }) : NAO_ACHADO("Devolução");
  } catch (err) {
    // A mesma chave em paralelo: a outra gravou enquanto esta corria. A recusa só vale se a chave segue sem devolução.
    if (err instanceof AbortarVenda || ehErroUnico(err)) {
      const igual = await db.emporioSaleReturn.findFirst({ where: { operation_key: chave }, select: { id: true, sale_id: true } });
      if (igual && igual.sale_id !== venda.id) return CHAVE_DE_OUTRA_VENDA();
      if (igual) {
        const v = await devolucaoPorId(db, igual.id);
        if (v) return ok({ ...v, replayed: true });
      }
      if (err instanceof AbortarVenda) return err.recusa;
    }
    throw err;
  }
}

export type TrocarInput = {
  operation_key: string;
  items_devolvidos: DevolucaoItemInput[];
  reason?: string | null;
  /** Entrega 2: o caixa do turno da venda nova e da diferença devolvida em dinheiro. */
  cash_register_id?: string | null;
  venda: Omit<VenderInput, "operation_key" | "establishment_id"> & {
    operation_key?: string | null;
    establishment_id?: string | null;
  };
};

export type TrocaView = { devolucao: DevolucaoView; venda: VendaView; replayed: boolean };

/**
 * Na troca, `items` é o campo da venda nova; a recusa dos itens devolvidos vai
 * para `items_devolvidos`, senão a tela teria que adivinhar o lado pelo texto.
 */
function paraDevolvidos<T>(r: ActionResult<T>): ActionResult<T> {
  return !r.ok && r.field === "items" ? { ...r, field: "items_devolvidos" } : r;
}

export async function trocarAction(
  db: TenantPrismaClient,
  ator: Ator,
  sale_id: string,
  input: TrocarInput,
): Promise<ActionResult<TrocaView>> {
  const neg = await exigir(db, ator, "chave:devolver_trocar", "trocar uma venda");
  if (neg) return neg;
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const origem = await carregarVendaParaDevolver(db, sale_id);
  if (!origem || !(await lojaVisivel(db, ator, origem.establishment_id))) return NAO_ACHADO("Venda");

  const resposta = async (devolucaoId: string, replayed: boolean): Promise<ActionResult<TrocaView>> => {
    const dev = await devolucaoPorId(db, devolucaoId);
    const novaId = dev?.exchange_sale_id ?? null;
    const nova = novaId ? await vendaPorId(db, novaId) : null;
    return dev && nova ? ok({ devolucao: dev, venda: nova, replayed }) : NAO_ACHADO("Troca");
  };

  const repetida = await db.emporioSaleReturn.findFirst({ where: { operation_key: chave }, select: { id: true, sale_id: true } });
  if (repetida) {
    if (repetida.sale_id !== origem.id) return CHAVE_DE_OUTRA_VENDA();
    return resposta(repetida.id, true);
  }

  if (origem.status === "cancelada") return fail("SALE_CANCELED", "Essa venda foi cancelada.", 409);
  const itens = paraDevolvidos(validarItensDevolvidos(origem, input.items_devolvidos));
  if (!itens.ok) return itens;
  const motivo = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : null;

  const novaVenda: VenderInput = {
    ...(input.venda as VenderInput),
    // O vendedor da troca é o da venda original (`vendedorHerdado`); sem ele, quem registra. O do corpo não vale.
    seller_user_id: null,
    // A venda nova da troca não fatura orçamento, e nasce retirada (D6): quem fatura a marca depois.
    quote_id: null,
    for_delivery: false,
    operation_key: String(input.venda?.operation_key ?? "").trim() || `${chave}:venda`,
    establishment_id: input.venda?.establishment_id || origem.establishment_id,
    cash_register_id: pedidoDeCaixa(input.cash_register_id) ?? pedidoDeCaixa(input.venda?.cash_register_id),
  };
  const prep = await prepararVenda(db, ator, novaVenda, {
    valorTroca: itens.data.totalCent / 100,
    vendedorHerdado: origem.seller_user_id,
  });
  if (!prep.ok) return prep;

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const atual = await tx.emporioSale.findFirst({ where: { id: origem.id }, include: INCLUDE_VENDA_DEVOLUCAO });
      if (!atual || atual.status === "cancelada") throw new AbortarVenda(fail("SALE_CANCELED", "Essa venda foi cancelada.", 409));
      const rev = paraDevolvidos(validarItensDevolvidos(atual, input.items_devolvidos));
      if (!rev.ok) throw new AbortarVenda(rev);
      // A venda nova exige turno, e a diferença devolvida sai dele.
      const turno = await turnoOuAborta(tx, ator, prep.data.loja.id, prep.data.cash_register_id);
      const devolucaoId = await gravarDevolucao(tx, ator, atual, rev.data.linhas, {
        chave,
        refund_kind: "troca",
        totalCent: rev.data.totalCent,
        reason: motivo,
      });
      await gravarVenda(tx, ator, prep.data, turno, { exchange_return_id: devolucaoId });
      await registrarNoHistorico(tx, ator, {
        action: "venda.trocar",
        establishment_id: atual.establishment_id,
        target_type: "venda",
        target_id: atual.id,
        summary: `Trocou itens de uma venda da ${prep.data.loja.name}: devolveu ${dinheiro(rev.data.totalCent / 100)} e vendeu ${dinheiro(prep.data.net)}`,
      });

      // Se o devolvido passa da venda nova, a diferença sai da gaveta.
      const sobraCent = rev.data.totalCent - centavos(prep.data.troca);
      if (sobraCent > 0) {
        await tx.cashMovement.create({
          data: scoped({
            establishment_id: prep.data.loja.id,
            cash_register_id: turno.cash_register_id,
            cash_session_id: turno.id,
            bank_account_id: null,
            direction: "saida" as const,
            amount: sobraCent / 100,
            origin: "devolucao" as const,
            occurred_at: prep.data.sold_at,
            sale_return_id: devolucaoId,
            notes: "Diferença da troca devolvida em dinheiro",
            created_by_user_id: ator.id,
          }),
        });
      }
      return devolucaoId;
    });
    return await resposta(id, false);
  } catch (err) {
    // A mesma chave em paralelo: a outra gravou enquanto esta corria. A recusa só vale se a chave segue sem troca.
    if (err instanceof AbortarVenda || ehErroUnico(err)) {
      const igual = await db.emporioSaleReturn.findFirst({ where: { operation_key: chave }, select: { id: true, sale_id: true } });
      if (igual && igual.sale_id !== origem.id) return CHAVE_DE_OUTRA_VENDA();
      if (igual) return resposta(igual.id, true);
      if (err instanceof AbortarVenda) return err.recusa;
    }
    throw err;
  }
}
