import type { Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { hasMinRole } from "@/lib/permissions";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { descreverQuantidade } from "@/lib/stock/units";
import { custoMedio } from "@/lib/emporio/custo-medio";
import {
  INCLUDE_PRODUTO,
  lacradoEfetivo,
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

const NEGADO_ADMIN = () => fail("FORBIDDEN", "Só o dono e o administrador podem fazer isso.", 403);
const NEGADO_OPERADOR = () => fail("FORBIDDEN", "Seu perfil só permite consultar o Empório.", 403);
const NAO_ACHADO = (o: string, field?: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404, field);

const ehAdmin = (a: Ator) => hasMinRole(a.role, "ADMIN");
const ehOperador = (a: Ator) => hasMinRole(a.role, "OPERADOR");

const arred2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;
const arred3 = (n: number) => Math.round(Number((n * 1000).toPrecision(14))) / 1000;
const arred4 = (n: number) => Math.round(n * 10000) / 10000;
/** Duas casas em inteiro: a soma de dinheiro se compara em centavos, nunca em float. */
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const dataValida = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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

async function lojaVisivel(db: TenantPrismaClient, ator: Ator, lojaId: string): Promise<boolean> {
  const v = await lojasDoAtor(db, ator);
  return !v || v.has(lojaId);
}

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
  contact_id: string | null;
  contact_name: string | null;
  sold_at: string;
  sold_by_user_id: string | null;
  net_amount: number;
  discount_amount: number;
  discount_pct: number;
  discount_authorized_by_user_id: string | null;
  status: "concluida" | "cancelada";
  canceled_at: string | null;
  canceled_by_user_id: string | null;
  canceled_reason: string | null;
  exchange_return_id: string | null;
  notes: string | null;
  entry_id: string | null;
  entry_amount: number | null;
  paid_amount: number;
  open_amount: number;
  created_at: string;
  items: VendaItemView[];
  payments: VendaPagamentoView[];
  returns: DevolucaoView[];
};

const INCLUDE_VENDA = {
  establishment: { select: { name: true } },
  contact: { select: { name: true } },
  items: {
    include: {
      emporio_product: { include: { product: { select: { name: true } } } },
      presentation: { select: { name: true } },
      return_items: { select: { quantity: true } },
    },
    orderBy: { id: "asc" },
  },
  payments: { orderBy: { created_at: "asc" } },
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
    const desconto = decToNum(s.discount_amount) ?? 0;
    return {
      id: s.id,
      establishment_id: s.establishment_id,
      establishment_name: s.establishment.name,
      operation_key: s.operation_key,
      contact_id: s.contact_id,
      contact_name: s.contact?.name ?? null,
      sold_at: s.sold_at.toISOString(),
      sold_by_user_id: s.sold_by_user_id,
      net_amount: decToNum(s.net_amount) ?? 0,
      discount_amount: desconto,
      discount_pct: denominador > 0 ? arred2((desconto / denominador) * 100) : 0,
      discount_authorized_by_user_id: s.discount_authorized_by_user_id,
      status: s.status,
      canceled_at: isoOrNull(s.canceled_at),
      canceled_by_user_id: s.canceled_by_user_id,
      canceled_reason: s.canceled_reason,
      exchange_return_id: s.exchange_return_id,
      notes: s.notes,
      entry_id: e?.id ?? null,
      entry_amount: valorEntrada,
      paid_amount: pago,
      open_amount: aberto,
      created_at: s.created_at.toISOString(),
      items: itens,
      payments: s.payments.map((p) => ({
        id: p.id,
        kind: p.kind,
        amount: decToNum(p.amount) ?? 0,
        bank_account_id: p.bank_account_id,
        due_date: isoOrNull(p.due_date),
        financial_payment_id: p.financial_payment_id,
      })),
      returns: s.returns.map(viewDaDevolucao),
    };
  });
}

async function vendaPorId(db: TenantPrismaClient, id: string): Promise<VendaView | null> {
  const [v] = await montarVendas(db, await buscarVendas(db, { id }));
  return v ?? null;
}

export async function lerVendaAction(db: TenantPrismaClient, ator: Ator, id: string): Promise<ActionResult<VendaView>> {
  const v = await vendaPorId(db, id);
  if (!v || !(await lojaVisivel(db, ator, v.establishment_id))) return NAO_ACHADO("Venda");
  return ok(v);
}

export async function listarVendasAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: {
    establishment_id?: string;
    contact_id?: string;
    status?: "concluida" | "cancelada";
    de?: Date;
    ate?: Date;
    limit?: number;
  } = {},
): Promise<ActionResult<VendaView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const periodo: Record<string, Date> = {};
  if (dataValida(opts.de)) periodo.gte = opts.de;
  if (dataValida(opts.ate)) periodo.lte = opts.ate;
  const where: Record<string, unknown> = {
    ...(opts.establishment_id
      ? { establishment_id: opts.establishment_id }
      : visiveis
        ? { establishment_id: { in: [...visiveis] } }
        : {}),
    ...(opts.contact_id ? { contact_id: opts.contact_id } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(Object.keys(periodo).length > 0 ? { sold_at: periodo } : {}),
  };
  const limite = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 200;
  return ok(await montarVendas(db, await buscarVendas(db, where, limite)));
}

// ---------------------------------------------------------------------------
// Venda: validação
// ---------------------------------------------------------------------------

export type VendaItemInput = {
  emporio_product_id: string;
  presentation_id: string;
  quantity: number;
  unit_price?: number | null;
};

export type VendaPagamentoInput = {
  kind: string;
  amount: number;
  bank_account_id?: string | null;
  due_date?: Date | null;
};

export type VenderInput = {
  operation_key: string;
  establishment_id: string;
  contact_id?: string | null;
  sold_at?: Date | null;
  items: VendaItemInput[];
  payments?: VendaPagamentoInput[] | null;
  notes?: string | null;
};

const FORMAS_DA_F3B = ["debito", "credito_vista", "credito_parcelado", "cheque"];

type ItemPreparado = {
  produto: ProdutoRow;
  apresentacao: ProdutoRow["presentations"][number];
  quantity: number;
  base_qty: number;
  suggested: number | null;
  unit_price: number;
  total: number;
};

type PagamentoPreparado = {
  kind: "dinheiro" | "pix" | "fiado";
  amount: number;
  bank_account_id: string | null;
  due_date: Date | null;
};

type Preparada = {
  loja: { id: string; name: string; allow_negative_stock: boolean };
  chave: string;
  contact_id: string | null;
  sold_at: Date;
  itens: ItemPreparado[];
  pagamentos: PagamentoPreparado[];
  net: number;
  desconto: number;
  autorizou: string | null;
  /** Parte da venda paga pelo valor devolvido na troca (já limitada ao total). */
  troca: number;
  notes: string | null;
};

async function prepararVenda(
  db: TenantPrismaClient,
  ator: Ator,
  input: VenderInput,
  opts: { valorTroca?: number } = {},
): Promise<ActionResult<Preparada>> {
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
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

  let contactId: string | null = null;
  if (input.contact_id != null && input.contact_id !== "") {
    const c = await db.contact.findFirst({ where: { id: String(input.contact_id) }, select: { id: true, archived_at: true } });
    if (!c || c.archived_at) return fail("VALIDATION_ERROR", "Escolha um cliente ativo.", 422, "contact_id");
    contactId = c.id;
  }

  // Itens
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return fail("VALIDATION_ERROR", "Inclua ao menos um item na venda.", 422, "items");
  }
  const produtoIds = [...new Set(input.items.map((i) => i?.emporio_product_id).filter((x): x is string => typeof x === "string" && !!x))];
  const produtos = await db.emporioProduct.findMany({ where: { id: { in: produtoIds } }, include: INCLUDE_PRODUTO });
  const produtoPorId = new Map<string, ProdutoRow>(produtos.map((p) => [p.id, p]));
  const apresentacaoIds = input.items.map((i) => i?.presentation_id).filter((x): x is string => typeof x === "string" && !!x);
  const precos = await db.presentationPrice.findMany({
    where: { establishment_id: loja.data.id, presentation_id: { in: apresentacaoIds } },
    select: { presentation_id: true, price: true },
  });
  const precoPorApresentacao = new Map(precos.map((p) => [p.presentation_id, decToNum(p.price)]));

  const itens: ItemPreparado[] = [];
  for (const it of input.items) {
    const produto = typeof it?.emporio_product_id === "string" ? produtoPorId.get(it.emporio_product_id) : undefined;
    if (!produto) return fail("VALIDATION_ERROR", "Escolha o produto de cada item.", 422, "items");
    const nome = produto.product.name;
    if (produto.archived_at) return fail("VALIDATION_ERROR", `O produto "${nome}" está arquivado.`, 422, "items");
    const ap = produto.presentations.find((x) => x.id === it.presentation_id);
    if (!ap || ap.archived_at) {
      return fail("VALIDATION_ERROR", `Escolha uma apresentação ativa de "${nome}".`, 422, "items");
    }
    if (!numero(it.quantity) || arred3(it.quantity) <= 0) {
      return fail("VALIDATION_ERROR", `A quantidade de "${nome}" deve ser maior que zero.`, 422, "items");
    }
    const quantity = arred3(it.quantity);
    const base_qty = arred3(quantity * (decToNum(ap.base_qty) ?? 0));
    if (!(base_qty > 0)) {
      return fail("VALIDATION_ERROR", `A quantidade de "${nome}" é pequena demais.`, 422, "items");
    }
    if (produto.base_unit === "unidade" && !Number.isInteger(base_qty)) {
      return fail("VALIDATION_ERROR", `"${nome}" é vendido por unidade e só aceita quantidade inteira.`, 422, "items");
    }
    if (ap.is_sealed_package && lacradoEfetivo(produto) && !Number.isInteger(quantity)) {
      return fail("VALIDATION_ERROR", `A embalagem fechada de "${nome}" só aceita quantidade inteira.`, 422, "items");
    }
    const sugerido = precoPorApresentacao.get(ap.id) ?? null;
    let unit_price: number;
    if (it.unit_price == null) {
      if (sugerido === null) {
        return fail("VALIDATION_ERROR", `"${nome}" (${ap.name}) não tem preço cadastrado nesta loja. Informe o preço.`, 422, "items");
      }
      unit_price = sugerido;
    } else {
      if (!numero(it.unit_price) || arred2(it.unit_price) <= 0) {
        return fail("VALIDATION_ERROR", `O preço de "${nome}" deve ser maior que zero.`, 422, "items");
      }
      unit_price = arred2(it.unit_price);
    }
    itens.push({
      produto,
      apresentacao: ap,
      quantity,
      base_qty,
      suggested: sugerido,
      unit_price,
      total: arred2(quantity * unit_price),
    });
  }

  const netCent = itens.reduce((s, i) => s + centavos(i.total), 0);
  const net = netCent / 100;

  // Desconto (Q85): só o que fica abaixo do sugerido; acima não compensa.
  let descontoCent = 0;
  let baseCent = 0;
  for (const i of itens) {
    if (i.suggested === null) continue;
    baseCent += centavos(i.suggested * i.quantity);
    if (i.unit_price < i.suggested) descontoCent += centavos((i.suggested - i.unit_price) * i.quantity);
  }
  let autorizou: string | null = null;
  if (descontoCent > 0 && baseCent > 0) {
    const pct = (descontoCent / baseCent) * 100;
    const limite = decToNum(lojaExtra?.max_discount_pct) ?? 0;
    if (pct > limite + 1e-9) {
      if (!ehAdmin(ator)) {
        return fail(
          "DISCOUNT_ABOVE_LIMIT",
          `O desconto de ${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% passa do limite de ${limite.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% desta loja. Peça a um administrador.`,
          403,
          "items",
        );
      }
      autorizou = ator.id;
    }
  }

  // Pagamentos
  const entrada = Array.isArray(input.payments) ? input.payments : [];
  const pagamentos: PagamentoPreparado[] = [];
  let temFiado = false;
  for (const p of entrada) {
    const kind = p?.kind;
    if (kind === "troca") {
      return fail("VALIDATION_ERROR", "O pagamento por troca só nasce na troca de mercadoria.", 422, "payments");
    }
    if (typeof kind === "string" && FORMAS_DA_F3B.includes(kind)) {
      return fail("VALIDATION_ERROR", "Cartão e cheque ainda não estão disponíveis. Use dinheiro, PIX ou fiado.", 422, "payments");
    }
    if (kind !== "dinheiro" && kind !== "pix" && kind !== "fiado") {
      return fail("VALIDATION_ERROR", "Escolha a forma de pagamento: dinheiro, PIX ou fiado.", 422, "payments");
    }
    if (!numero(p.amount) || centavos(p.amount) <= 0) {
      return fail("VALIDATION_ERROR", "O valor de cada pagamento deve ser maior que zero.", 422, "payments");
    }
    let contaId: string | null = null;
    let venc: Date | null = null;
    if (kind === "fiado") {
      if (temFiado) return fail("VALIDATION_ERROR", "O fiado aparece uma vez só na venda.", 422, "payments");
      temFiado = true;
      if (!contactId) return fail("VALIDATION_ERROR", "O fiado precisa de um cliente.", 422, "contact_id");
      if (p.due_date != null) {
        if (!dataValida(p.due_date)) return fail("VALIDATION_ERROR", "Informe um vencimento válido.", 422, "payments");
        venc = p.due_date;
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
    pagamentos.push({ kind, amount: arred2(p.amount), bank_account_id: contaId, due_date: venc });
  }

  const valorTroca = opts.valorTroca ?? 0;
  const trocaCent = Math.min(centavos(valorTroca), netCent);
  const somaCent = pagamentos.reduce((s, p) => s + centavos(p.amount), 0);
  if (somaCent + trocaCent !== netCent) {
    const esperado = (netCent - trocaCent) / 100;
    return fail(
      "VALIDATION_ERROR",
      trocaCent > 0
        ? `Os pagamentos (${brl(somaCent / 100)}) precisam cobrir o que sobra da venda depois da troca (${brl(esperado)}).`
        : `A soma dos pagamentos (${brl(somaCent / 100)}) precisa ser igual ao total da venda (${brl(net)}).`,
      422,
      "payments",
    );
  }

  return ok({
    loja: { id: loja.data.id, name: loja.data.name, allow_negative_stock: loja.data.allow_negative_stock },
    chave,
    contact_id: contactId,
    sold_at: soldAt,
    itens,
    pagamentos,
    net,
    desconto: descontoCent / 100,
    autorizou,
    troca: trocaCent / 100,
    notes: typeof input.notes === "string" && input.notes.trim() ? input.notes.trim() : null,
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

/** Grava a venda inteira dentro de uma transação já aberta. Devolve o id da venda. */
async function gravarVenda(
  tx: Tx,
  ator: Ator,
  p: Preparada,
  extra: { exchange_return_id?: string | null } = {},
): Promise<string> {
  const { movs, custos } = await planejarBaixa(tx, p);

  const venda = await tx.emporioSale.create({
    data: scoped({
      establishment_id: p.loja.id,
      operation_key: p.chave,
      contact_id: p.contact_id,
      sold_at: p.sold_at,
      sold_by_user_id: ator.id,
      net_amount: p.net,
      discount_amount: p.desconto,
      discount_authorized_by_user_id: p.autorizou,
      exchange_return_id: extra.exchange_return_id ?? null,
      notes: p.notes,
    }),
  });

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
  const formaUnica =
    p.troca === 0 && p.pagamentos.length === 1 && p.pagamentos[0].kind !== "fiado" ? p.pagamentos[0].kind : null;
  const lancamento = await createLinkedEntry(tx, {
    entry_type: "income",
    category: CATEGORIA_VENDAS,
    amount: p.net,
    related_module: "emporio",
    related_id: venda.id,
    occurred_at: p.sold_at,
    status: "pending",
    due_date: fiado?.due_date ?? p.sold_at,
    contact_id: p.contact_id,
    establishment_id: p.loja.id,
    payment_method: formaUnica,
  });

  for (const pg of p.pagamentos) {
    if (pg.kind === "fiado") {
      await tx.emporioSalePayment.create({
        data: scoped({ sale_id: venda.id, kind: "fiado" as const, amount: pg.amount, due_date: pg.due_date }),
      });
      continue;
    }
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

  if (!fiado) {
    await tx.financialEntry.update({ where: { id: lancamento.id }, data: { status: "paid", paid_at: p.sold_at } });
  }
  return venda.id;
}

export async function venderAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: VenderInput,
): Promise<ActionResult<VendaView & { replayed: boolean }>> {
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
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
    const id = await runSerializableTenantTransaction(db, (tx) => gravarVenda(tx, ator, prep.data));
    const v = await vendaPorId(db, id);
    return v ? ok({ ...v, replayed: false }) : NAO_ACHADO("Venda");
  } catch (err) {
    if (err instanceof AbortarVenda) return err.recusa;
    if (ehErroUnico(err)) {
      const igual = await db.emporioSale.findFirst({ where: { operation_key: chave }, select: { id: true } });
      const v = igual ? await vendaPorId(db, igual.id) : null;
      if (v) return ok({ ...v, replayed: true });
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Cancelamento total
// ---------------------------------------------------------------------------

export async function cancelarVendaAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string },
): Promise<ActionResult<VendaView>> {
  if (!ehAdmin(ator)) return NEGADO_ADMIN();
  const venda = await db.emporioSale.findFirst({
    where: { id },
    select: {
      id: true,
      establishment_id: true,
      status: true,
      exchange_return_id: true,
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
  const motivo = String(input?.reason ?? "").trim();
  if (!motivo) return fail("VALIDATION_ERROR", "Diga o motivo do cancelamento.", 422, "reason");
  if (venda._count.returns > 0) {
    return fail("SALE_HAS_RETURNS", "Essa venda tem devolução: não dá para cancelar a venda inteira.", 409);
  }

  try {
    await runSerializableTenantTransaction(db, async (tx) => {
      const agora = new Date();
      const r = await tx.emporioSale.updateMany({
        where: { id, status: "concluida" },
        data: { status: "cancelada", canceled_at: agora, canceled_by_user_id: ator.id, canceled_reason: motivo },
      });
      if (r.count === 0) throw new AbortarVenda(fail("SALE_CANCELED", "Essa venda já foi cancelada.", 409));

      // As aberturas ficam: a saca foi aberta de verdade.
      await tx.stockMovement.updateMany({
        where: { sale_id: id, movement_type: "venda", canceled_at: null },
        data: { canceled_at: agora, canceled_reason: motivo },
      });

      const lancamento = await tx.financialEntry.findFirst({
        where: { related_module: "emporio", entry_type: "income", related_id: id },
        select: { id: true },
      });
      if (!lancamento) return;
      await tx.financialEntry.update({ where: { id: lancamento.id }, data: { status: "cancelled" } });

      const pagamentos = await tx.financialPayment.findMany({ where: { entry_id: lancamento.id }, select: { id: true } });
      for (const fp of pagamentos) {
        const entrada = await tx.cashMovement.findFirst({
          where: { financial_payment_id: fp.id, direction: "entrada" },
        });
        if (!entrada) continue;
        await tx.cashMovement.create({
          data: scoped({
            establishment_id: entrada.establishment_id,
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
    });
  } catch (err) {
    if (err instanceof AbortarVenda) return err.recusa;
    throw err;
  }
  const v = await vendaPorId(db, id);
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
  d: { chave: string; refund_kind: "dinheiro" | "abater_fiado" | "troca"; totalCent: number; reason: string | null },
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
    select: { id: true },
  });
  const recebido = receita
    ? await tx.financialPayment.aggregate({ where: { entry_id: receita.id }, _sum: { amount: true } })
    : null;
  const jaVoltou = await tx.emporioSaleReturn.aggregate({
    where: { sale_id: venda.id, refund_kind: { in: ["dinheiro", "troca"] }, id: { not: devolucao.id } },
    _sum: { amount: true },
  });
  const tetoCent =
    centavos(decToNum(recebido?._sum.amount) ?? 0) - centavos(decToNum(jaVoltou._sum.amount) ?? 0);
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
    contact_id: venda.contact_id,
    establishment_id: venda.establishment_id,
    payment_method: comDinheiro ? "dinheiro" : "outro",
  });
  if (comDinheiro) {
    const fp = await tx.financialPayment.findFirst({ where: { entry_id: despesa.id }, select: { id: true } });
    await tx.cashMovement.create({
      data: scoped({
        establishment_id: venda.establishment_id,
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
};

export async function devolverAction(
  db: TenantPrismaClient,
  ator: Ator,
  sale_id: string,
  input: DevolverInput,
): Promise<ActionResult<DevolucaoView & { replayed: boolean }>> {
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const venda = await carregarVendaParaDevolver(db, sale_id);
  if (!venda || !(await lojaVisivel(db, ator, venda.establishment_id))) return NAO_ACHADO("Venda");

  const repetida = await db.emporioSaleReturn.findFirst({ where: { operation_key: chave }, select: { id: true, sale_id: true } });
  if (repetida) {
    if (repetida.sale_id !== venda.id) {
      return fail("DUPLICATE_OPERATION_KEY", "Essa chave de operação já foi usada em outra venda.", 409, "operation_key");
    }
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
      return gravarDevolucao(tx, ator, atual, rev.data.linhas, {
        chave,
        refund_kind: input.refund_kind as "dinheiro" | "abater_fiado",
        totalCent: rev.data.totalCent,
        reason: motivo,
      });
    });
    const v = await devolucaoPorId(db, id);
    return v ? ok({ ...v, replayed: false }) : NAO_ACHADO("Devolução");
  } catch (err) {
    if (err instanceof AbortarVenda) return err.recusa;
    if (ehErroUnico(err)) {
      const igual = await db.emporioSaleReturn.findFirst({ where: { operation_key: chave }, select: { id: true } });
      const v = igual ? await devolucaoPorId(db, igual.id) : null;
      if (v) return ok({ ...v, replayed: true });
    }
    throw err;
  }
}

export type TrocarInput = {
  operation_key: string;
  items_devolvidos: DevolucaoItemInput[];
  reason?: string | null;
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
  if (!ehOperador(ator)) return NEGADO_OPERADOR();
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
    if (repetida.sale_id !== origem.id) {
      return fail("DUPLICATE_OPERATION_KEY", "Essa chave de operação já foi usada em outra venda.", 409, "operation_key");
    }
    return resposta(repetida.id, true);
  }

  if (origem.status === "cancelada") return fail("SALE_CANCELED", "Essa venda foi cancelada.", 409);
  const itens = paraDevolvidos(validarItensDevolvidos(origem, input.items_devolvidos));
  if (!itens.ok) return itens;
  const motivo = typeof input.reason === "string" && input.reason.trim() ? input.reason.trim() : null;

  const novaVenda: VenderInput = {
    ...(input.venda as VenderInput),
    operation_key: String(input.venda?.operation_key ?? "").trim() || `${chave}:venda`,
    establishment_id: input.venda?.establishment_id || origem.establishment_id,
  };
  const prep = await prepararVenda(db, ator, novaVenda, { valorTroca: itens.data.totalCent / 100 });
  if (!prep.ok) return prep;

  try {
    const id = await runSerializableTenantTransaction(db, async (tx) => {
      const atual = await tx.emporioSale.findFirst({ where: { id: origem.id }, include: INCLUDE_VENDA_DEVOLUCAO });
      if (!atual || atual.status === "cancelada") throw new AbortarVenda(fail("SALE_CANCELED", "Essa venda foi cancelada.", 409));
      const rev = paraDevolvidos(validarItensDevolvidos(atual, input.items_devolvidos));
      if (!rev.ok) throw new AbortarVenda(rev);
      const devolucaoId = await gravarDevolucao(tx, ator, atual, rev.data.linhas, {
        chave,
        refund_kind: "troca",
        totalCent: rev.data.totalCent,
        reason: motivo,
      });
      await gravarVenda(tx, ator, prep.data, { exchange_return_id: devolucaoId });

      // Se o devolvido passa da venda nova, a diferença sai da gaveta.
      const sobraCent = rev.data.totalCent - centavos(prep.data.troca);
      if (sobraCent > 0) {
        await tx.cashMovement.create({
          data: scoped({
            establishment_id: prep.data.loja.id,
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
    if (err instanceof AbortarVenda) return err.recusa;
    if (ehErroUnico(err)) {
      const igual = await db.emporioSaleReturn.findFirst({ where: { operation_key: chave }, select: { id: true } });
      if (igual) return resposta(igual.id, true);
    }
    throw err;
  }
}
