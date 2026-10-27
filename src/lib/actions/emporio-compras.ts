import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { hasMinRole } from "@/lib/permissions";
import { createLinkedEntry } from "@/lib/financial";
import { lacradoEfetivo, lojasDoAtor, type Ator } from "@/lib/actions/emporio-catalogo";

/**
 * Meu Empório, F2a: compras (Módulo 39, Q38, Q39, Q61 a Q63, Q70).
 *
 * O estoque só entra no recebimento, e o saldo continua sendo a soma das
 * movimentações (invariante 2): aqui só nascem `StockMovement` do tipo
 * `compra`. O dinheiro é sempre `FinancialEntry` via `createLinkedEntry`.
 * A validação é em TypeScript puro: o agente do WhatsApp chama estas funções
 * sem passar pelo Zod da rota.
 */

export const CATEGORIA_MERCADORIAS = "Mercadorias para revenda";
export const PAYMENT_KINDS = ["a_vista", "a_prazo", "parcelada"] as const;
type PaymentKind = (typeof PAYMENT_KINDS)[number];

const NEGADO_OPERADOR = () =>
  fail("FORBIDDEN", "Seu perfil só permite consultar o Empório.", 403);
const NEGADO_ADMIN = () =>
  fail("FORBIDDEN", "Só o dono e o administrador podem fazer isso.", 403);
const NAO_ACHADO = (o: string, field?: string) => fail("NOT_FOUND", `${o} não encontrado.`, 404, field);

const centavos = (v: number) => Math.round(v * 100);
const dataValida = (d: unknown): d is Date => d instanceof Date && !Number.isNaN(d.getTime());
const arred = (v: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round(v * f) / f;
};

function ehErroUnico(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "P2002";
}

/** Aborta a transação com uma recusa de negócio (o rollback desfaz o que já foi escrito). */
class AbortarCompra extends Error {
  constructor(public recusa: ActionResult<never>) {
    super("compra abortada");
  }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type CompraItemView = {
  id: string;
  emporio_product_id: string;
  product_name: string;
  base_unit: string;
  presentation_id: string | null;
  presentation_name: string | null;
  quantity: number;
  base_quantity: number;
  item_total: number;
  freight_share: number;
  unit_cost: number;
};

export type CompraLancamentoView = {
  id: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
};

export type CompraView = {
  id: string;
  establishment_id: string;
  establishment_name: string;
  contact_id: string | null;
  contact_name: string | null;
  operation_key: string;
  purchased_at: string;
  received_at: string | null;
  status: "pendente" | "recebida" | "cancelada";
  freight: number;
  items_total: number;
  total: number;
  payment_kind: string;
  notes: string | null;
  canceled_at: string | null;
  canceled_reason: string | null;
  created_at: string;
  items: CompraItemView[];
  entries: CompraLancamentoView[];
};

const INCLUDE_COMPRA = {
  establishment: { select: { name: true } },
  contact: { select: { name: true } },
  items: {
    include: { emporio_product: { include: { product: { select: { name: true } } } }, presentation: { select: { name: true } } },
    orderBy: { created_at: "asc" },
  },
} as const;

type CompraRow = Awaited<ReturnType<typeof buscarCompras>>[number];

async function buscarCompras(db: TenantPrismaClient, where: Record<string, unknown>, take?: number) {
  return db.emporioPurchase.findMany({
    where,
    include: INCLUDE_COMPRA,
    orderBy: [{ purchased_at: "desc" }, { created_at: "desc" }],
    ...(take ? { take } : {}),
  });
}

async function montarViews(db: TenantPrismaClient, linhas: CompraRow[]): Promise<CompraView[]> {
  if (linhas.length === 0) return [];
  const lancs = await db.financialEntry.findMany({
    where: { related_module: "emporio", related_id: { in: linhas.map((c) => c.id) } },
    orderBy: [{ due_date: "asc" }, { created_at: "asc" }],
  });
  return linhas.map((c) => {
    const itens = c.items.map((i) => ({
      id: i.id,
      emporio_product_id: i.emporio_product_id,
      product_name: i.emporio_product.product.name,
      base_unit: i.emporio_product.base_unit,
      presentation_id: i.presentation_id,
      presentation_name: i.presentation?.name ?? null,
      quantity: decToNum(i.quantity) ?? 0,
      base_quantity: decToNum(i.base_quantity) ?? 0,
      item_total: decToNum(i.item_total) ?? 0,
      freight_share: decToNum(i.freight_share) ?? 0,
      unit_cost: decToNum(i.unit_cost) ?? 0,
    }));
    const itemsTotal = itens.reduce((s, i) => s + centavos(i.item_total), 0) / 100;
    const frete = decToNum(c.freight) ?? 0;
    return {
      id: c.id,
      establishment_id: c.establishment_id,
      establishment_name: c.establishment.name,
      contact_id: c.contact_id,
      contact_name: c.contact?.name ?? null,
      operation_key: c.operation_key,
      purchased_at: c.purchased_at.toISOString(),
      received_at: isoOrNull(c.received_at),
      status: c.canceled_at ? "cancelada" : c.received_at ? "recebida" : "pendente",
      freight: frete,
      items_total: itemsTotal,
      total: (centavos(itemsTotal) + centavos(frete)) / 100,
      payment_kind: c.payment_kind,
      notes: c.notes,
      canceled_at: isoOrNull(c.canceled_at),
      canceled_reason: c.canceled_reason,
      created_at: c.created_at.toISOString(),
      items: itens,
      entries: lancs
        .filter((l) => l.related_id === c.id)
        .map((l) => ({
          id: l.id,
          amount: decToNum(l.amount) ?? 0,
          status: l.status,
          due_date: isoOrNull(l.due_date),
          paid_at: isoOrNull(l.paid_at),
        })),
    };
  });
}

async function viewDaCompra(db: TenantPrismaClient, id: string): Promise<CompraView | null> {
  const [c] = await buscarCompras(db, { id });
  if (!c) return null;
  const [v] = await montarViews(db, [c]);
  return v;
}

export async function lerCompraAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
): Promise<ActionResult<CompraView>> {
  const visiveis = await lojasDoAtor(db, ator);
  const v = await viewDaCompra(db, id);
  if (!v || (visiveis && !visiveis.has(v.establishment_id))) return NAO_ACHADO("Compra");
  return ok(v);
}

export async function listarComprasAction(
  db: TenantPrismaClient,
  ator: Ator,
  opts: { establishment_id?: string; status?: "pendente" | "recebida" | "cancelada"; contact_id?: string; limit?: number } = {},
): Promise<ActionResult<CompraView[]>> {
  const visiveis = await lojasDoAtor(db, ator);
  if (opts.establishment_id && visiveis && !visiveis.has(opts.establishment_id)) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const where: Record<string, unknown> = {
    ...(opts.establishment_id
      ? { establishment_id: opts.establishment_id }
      : visiveis
        ? { establishment_id: { in: [...visiveis] } }
        : {}),
    ...(opts.contact_id ? { contact_id: opts.contact_id } : {}),
    ...(opts.status === "cancelada"
      ? { canceled_at: { not: null } }
      : opts.status === "recebida"
        ? { canceled_at: null, received_at: { not: null } }
        : opts.status === "pendente"
          ? { canceled_at: null, received_at: null }
          : {}),
  };
  const limite = opts.limit && opts.limit > 0 ? Math.min(Math.floor(opts.limit), 500) : 200;
  return ok(await montarViews(db, await buscarCompras(db, where, limite)));
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export type CompraItemInput = {
  emporio_product_id: string;
  presentation_id?: string | null;
  quantity: number;
  item_total: number;
};

export type CompraInput = {
  operation_key: string;
  establishment_id: string;
  contact_id?: string | null;
  purchased_at: Date;
  received: boolean;
  freight?: number | null;
  items: CompraItemInput[];
  payment: {
    kind: PaymentKind;
    due_date?: Date | null;
    down_payment?: number | null;
    installments?: { amount: number; due_date: Date }[] | null;
  };
  notes?: string | null;
};

type ProdutoDaCompra = {
  id: string;
  product_id: string;
  base_unit: string;
  archived_at: Date | null;
  track_sealed: boolean | null;
  presentations: { id: string; name: string; base_qty: unknown; is_sealed_package: boolean; archived_at: Date | null }[];
};

type ItemPlanejado = {
  emporio_product_id: string;
  presentation_id: string | null;
  quantity: number;
  base_quantity: number;
  item_total: number;
  freight_share: number;
  unit_cost: number;
};

type Lancamento = { amount: number; due_date: Date; paid: boolean };

/** Frete rateado pelo valor do item, em centavos; a sobra do arredondamento vai para o último (Q61). */
function ratearFrete(totaisEmCentavos: number[], freteEmCentavos: number): number[] {
  const soma = totaisEmCentavos.reduce((s, v) => s + v, 0);
  const partes = totaisEmCentavos.map((t) => (soma > 0 ? Math.floor((freteEmCentavos * t) / soma) : 0));
  const usado = partes.slice(0, -1).reduce((s, v) => s + v, 0);
  partes[partes.length - 1] = freteEmCentavos - usado;
  return partes;
}

export async function criarCompraAction(
  db: TenantPrismaClient,
  ator: Ator,
  input: CompraInput,
): Promise<ActionResult<CompraView & { replayed: boolean }>> {
  if (!hasMinRole(ator.role, "OPERADOR")) return NEGADO_OPERADOR();

  const chave = String(input?.operation_key ?? "").trim();
  if (!chave) return fail("VALIDATION_ERROR", "Falta a chave da operação.", 422, "operation_key");

  const visiveis = await lojasDoAtor(db, ator);

  // Q70: repetir a chave devolve a compra gravada, sem escrever nada.
  const repetida = await db.emporioPurchase.findFirst({ where: { operation_key: chave }, select: { id: true } });
  if (repetida) {
    const v = await viewDaCompra(db, repetida.id);
    if (v && (!visiveis || visiveis.has(v.establishment_id))) return ok({ ...v, replayed: true });
    return NAO_ACHADO("Compra");
  }

  if (!input.establishment_id || (visiveis && !visiveis.has(input.establishment_id))) {
    return NAO_ACHADO("Estabelecimento", "establishment_id");
  }
  const loja = await db.establishment.findFirst({ where: { id: input.establishment_id } });
  if (!loja) return NAO_ACHADO("Estabelecimento", "establishment_id");
  if (loja.archived_at) {
    return fail("VALIDATION_ERROR", "Esse estabelecimento está arquivado.", 422, "establishment_id");
  }

  if (input.contact_id) {
    const c = await db.contact.findFirst({ where: { id: input.contact_id } });
    if (!c) return NAO_ACHADO("Fornecedor", "contact_id");
  }

  if (!dataValida(input.purchased_at)) {
    return fail("VALIDATION_ERROR", "Informe a data da compra.", 422, "purchased_at");
  }
  if (typeof input.received !== "boolean") {
    return fail("VALIDATION_ERROR", "Informe se a mercadoria já chegou.", 422, "received");
  }
  const frete = input.freight ?? 0;
  if (typeof frete !== "number" || !Number.isFinite(frete) || frete < 0) {
    return fail("VALIDATION_ERROR", "O frete não pode ser negativo.", 422, "freight");
  }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return fail("VALIDATION_ERROR", "Inclua ao menos um item.", 422, "items");
  }

  // Itens: produto, apresentação, quantidade na unidade-base.
  const ids = [...new Set(input.items.map((i) => i?.emporio_product_id))];
  const produtos = await db.emporioProduct.findMany({
    where: { id: { in: ids.filter((x): x is string => typeof x === "string") } },
    include: { presentations: true },
  });
  const porId = new Map<string, ProdutoDaCompra>(produtos.map((p) => [p.id, p]));

  const parciais: Omit<ItemPlanejado, "freight_share" | "unit_cost">[] = [];
  for (const it of input.items) {
    const p = porId.get(it?.emporio_product_id);
    if (!p) return NAO_ACHADO("Produto", "items");
    if (p.archived_at) return fail("VALIDATION_ERROR", "Um dos produtos está arquivado.", 422, "items");
    if (typeof it.quantity !== "number" || !Number.isFinite(it.quantity) || it.quantity <= 0) {
      return fail("VALIDATION_ERROR", "A quantidade de cada item deve ser maior que zero.", 422, "items");
    }
    if (typeof it.item_total !== "number" || !Number.isFinite(it.item_total) || it.item_total < 0) {
      return fail("VALIDATION_ERROR", "O valor de cada item não pode ser negativo.", 422, "items");
    }
    let fator = 1;
    if (it.presentation_id) {
      const ap = p.presentations.find((x) => x.id === it.presentation_id);
      if (!ap) {
        return fail("VALIDATION_ERROR", "A apresentação não pertence ao produto.", 422, "items");
      }
      if (ap.archived_at) return fail("VALIDATION_ERROR", "Uma das apresentações está arquivada.", 422, "items");
      fator = decToNum(ap.base_qty) ?? 0;
    }
    const base = arred(it.quantity * fator, 3);
    if (!(base > 0)) {
      return fail("VALIDATION_ERROR", "A quantidade de cada item deve ser maior que zero.", 422, "items");
    }
    if (p.base_unit === "unidade" && !Number.isInteger(base)) {
      return fail("VALIDATION_ERROR", "Produto vendido por unidade só aceita quantidade inteira.", 422, "items");
    }
    parciais.push({
      emporio_product_id: p.id,
      presentation_id: it.presentation_id ?? null,
      quantity: arred(it.quantity, 3),
      base_quantity: base,
      item_total: centavos(it.item_total) / 100,
    });
  }

  const totaisC = parciais.map((i) => centavos(i.item_total));
  const freteC = centavos(frete);
  const partes = ratearFrete(totaisC, freteC);
  const itens: ItemPlanejado[] = parciais.map((i, idx) => ({
    ...i,
    freight_share: partes[idx] / 100,
    unit_cost: arred((totaisC[idx] + partes[idx]) / 100 / i.base_quantity, 4),
  }));
  const totalC = totaisC.reduce((s, v) => s + v, 0) + freteC;

  // Pagamento: os lançamentos que vão nascer (Q39, Q62).
  const pg = input.payment;
  const lancamentos: Lancamento[] = [];
  if (!pg || !(PAYMENT_KINDS as readonly string[]).includes(pg.kind)) {
    return fail("VALIDATION_ERROR", "Escolha como a compra foi paga: à vista, a prazo ou parcelada.", 422, "payment");
  }
  if (pg.kind === "a_vista") {
    if (totalC > 0) lancamentos.push({ amount: totalC / 100, due_date: input.purchased_at, paid: true });
  } else if (pg.kind === "a_prazo") {
    if (!dataValida(pg.due_date)) {
      return fail("VALIDATION_ERROR", "Informe o vencimento da conta a pagar.", 422, "due_date");
    }
    if (totalC > 0) lancamentos.push({ amount: totalC / 100, due_date: pg.due_date, paid: false });
  } else {
    const entrada = pg.down_payment ?? 0;
    if (typeof entrada !== "number" || !Number.isFinite(entrada) || entrada < 0) {
      return fail("VALIDATION_ERROR", "A entrada não pode ser negativa.", 422, "down_payment");
    }
    const parcelas = pg.installments ?? [];
    if (!Array.isArray(parcelas) || parcelas.length === 0) {
      return fail("VALIDATION_ERROR", "Informe as parcelas.", 422, "installments");
    }
    for (const p of parcelas) {
      if (typeof p?.amount !== "number" || !Number.isFinite(p.amount) || p.amount <= 0 || !dataValida(p.due_date)) {
        return fail("VALIDATION_ERROR", "Cada parcela precisa de valor maior que zero e vencimento.", 422, "installments");
      }
    }
    const somaC = parcelas.reduce((s, p) => s + centavos(p.amount), 0);
    if (somaC + centavos(entrada) !== totalC) {
      return fail(
        "VALIDATION_ERROR",
        "As parcelas, somadas à entrada, não fecham o total da compra com o frete.",
        422,
        "installments",
      );
    }
    if (centavos(entrada) > 0) lancamentos.push({ amount: centavos(entrada) / 100, due_date: input.purchased_at, paid: true });
    for (const p of parcelas) lancamentos.push({ amount: centavos(p.amount) / 100, due_date: p.due_date, paid: false });
  }

  // A categoria nasce sob demanda (Q62). skipDuplicates cobre duas compras simultâneas.
  if (lancamentos.length > 0) {
    const cat = await db.financialCategory.findFirst({
      where: { name: { equals: CATEGORIA_MERCADORIAS, mode: "insensitive" }, entry_type: "expense" },
    });
    if (!cat) {
      await db.financialCategory.createMany({
        data: [scoped({ name: CATEGORIA_MERCADORIAS, entry_type: "expense" as const })],
        skipDuplicates: true,
      });
    }
  }

  const recebidaEm = input.received ? input.purchased_at : null;

  try {
    const id = await db.$transaction(async (tx) => {
      const compra = await tx.emporioPurchase.create({
        data: scoped({
          establishment_id: loja.id,
          contact_id: input.contact_id ?? null,
          operation_key: chave,
          purchased_at: input.purchased_at,
          received_at: recebidaEm,
          freight: freteC / 100,
          payment_kind: pg.kind,
          notes: input.notes?.trim() || null,
          created_by_user_id: ator.id,
        }),
      });
      await tx.emporioPurchaseItem.createMany({
        data: itens.map((i) => scoped({ ...i, purchase_id: compra.id })),
      });
      for (const l of lancamentos) {
        await createLinkedEntry(tx, {
          entry_type: "expense",
          category: CATEGORIA_MERCADORIAS,
          amount: l.amount,
          related_module: "emporio",
          related_id: compra.id,
          occurred_at: l.paid ? l.due_date : input.purchased_at,
          due_date: l.due_date,
          status: l.paid ? "paid" : "pending",
          contact_id: input.contact_id ?? null,
          establishment_id: loja.id,
        });
      }
      if (recebidaEm) {
        await entrarNoEstoque(tx, ator, compra.id, loja.id, recebidaEm, itens, porId);
      }
      return compra.id;
    });
    const v = await viewDaCompra(db, id);
    return v ? ok({ ...v, replayed: false }) : NAO_ACHADO("Compra");
  } catch (err) {
    if (err instanceof AbortarCompra) return err.recusa;
    if (ehErroUnico(err)) {
      // Duas requisições com a mesma chave ao mesmo tempo: a perdedora devolve a gravada.
      const igual = await db.emporioPurchase.findFirst({ where: { operation_key: chave }, select: { id: true } });
      const v = igual ? await viewDaCompra(db, igual.id) : null;
      if (v) return ok({ ...v, replayed: true });
    }
    throw err;
  }
}

type TxLike = Parameters<Parameters<TenantPrismaClient["$transaction"]>[0]>[0];

/** Uma `StockMovement` `compra` por item, lacrada ou avulsa conforme Q65 e Q31. */
async function entrarNoEstoque(
  tx: TxLike,
  ator: Ator,
  purchaseId: string,
  establishmentId: string,
  ocorreuEm: Date,
  itens: Pick<ItemPlanejado, "emporio_product_id" | "presentation_id" | "base_quantity" | "unit_cost">[],
  produtos: Map<string, ProdutoDaCompra>,
): Promise<void> {
  for (const i of itens) {
    const p = produtos.get(i.emporio_product_id);
    if (!p) throw new Error("produto da compra sumiu");
    let estado: "lacrado" | "avulso" | null = null;
    let presentationId: string | null = null;
    if (lacradoEfetivo(p)) {
      const ap = i.presentation_id ? p.presentations.find((x) => x.id === i.presentation_id) : undefined;
      if (ap?.is_sealed_package) {
        estado = "lacrado";
        presentationId = ap.id;
      } else {
        estado = "avulso";
      }
    }
    await tx.stockMovement.create({
      data: scoped({
        product_id: p.product_id,
        establishment_id: establishmentId,
        property_id: null,
        movement_type: "compra" as const,
        quantity: i.base_quantity,
        occurred_at: ocorreuEm,
        package_state: estado,
        presentation_id: presentationId,
        unit_cost: i.unit_cost,
        purchase_id: purchaseId,
        recorded_by_user_id: ator.id,
      }),
    });
  }
}

// ---------------------------------------------------------------------------
// Recebimento e cancelamento
// ---------------------------------------------------------------------------

async function compraVisivel(db: TenantPrismaClient, ator: Ator, id: string) {
  const visiveis = await lojasDoAtor(db, ator);
  const c = await db.emporioPurchase.findFirst({ where: { id } });
  if (!c || (visiveis && !visiveis.has(c.establishment_id))) return null;
  return c;
}

export async function receberCompraAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { received_at?: Date | null } = {},
): Promise<ActionResult<CompraView>> {
  if (!hasMinRole(ator.role, "OPERADOR")) return NEGADO_OPERADOR();
  const compra = await compraVisivel(db, ator, id);
  if (!compra) return NAO_ACHADO("Compra");
  if (compra.canceled_at) return fail("PURCHASE_CANCELED", "Essa compra foi cancelada.", 409);
  if (compra.received_at) return fail("ALREADY_RECEIVED", "Essa compra já foi recebida.", 409);

  const quando = input.received_at ?? new Date();
  if (!dataValida(quando)) {
    return fail("VALIDATION_ERROR", "Informe uma data de recebimento válida.", 422, "received_at");
  }

  const itens = await db.emporioPurchaseItem.findMany({ where: { purchase_id: id } });
  const produtos = await db.emporioProduct.findMany({
    where: { id: { in: [...new Set(itens.map((i) => i.emporio_product_id))] } },
    include: { presentations: true },
  });
  const porId = new Map<string, ProdutoDaCompra>(produtos.map((p) => [p.id, p]));

  try {
    await db.$transaction(async (tx) => {
      // O filtro no update é o que impede o recebimento em dobro por duas chamadas simultâneas.
      const r = await tx.emporioPurchase.updateMany({
        where: { id, received_at: null, canceled_at: null },
        data: { received_at: quando },
      });
      if (r.count === 0) {
        throw new AbortarCompra(fail("ALREADY_RECEIVED", "Essa compra já foi recebida ou cancelada.", 409));
      }
      await entrarNoEstoque(
        tx,
        ator,
        id,
        compra.establishment_id,
        quando,
        itens.map((i) => ({
          emporio_product_id: i.emporio_product_id,
          presentation_id: i.presentation_id,
          base_quantity: decToNum(i.base_quantity) ?? 0,
          unit_cost: decToNum(i.unit_cost) ?? 0,
        })),
        porId,
      );
    });
  } catch (err) {
    if (err instanceof AbortarCompra) return err.recusa;
    throw err;
  }
  return lerCompraAction(db, ator, id);
}

export async function cancelarCompraAction(
  db: TenantPrismaClient,
  ator: Ator,
  id: string,
  input: { reason: string },
): Promise<ActionResult<CompraView>> {
  if (!hasMinRole(ator.role, "ADMIN")) return NEGADO_ADMIN();
  const compra = await compraVisivel(db, ator, id);
  if (!compra) return NAO_ACHADO("Compra");
  if (compra.canceled_at) return fail("ALREADY_CANCELED", "Essa compra já foi cancelada.", 409);
  const motivo = String(input?.reason ?? "").trim();
  if (!motivo) return fail("VALIDATION_ERROR", "Diga o motivo do cancelamento.", 422, "reason");

  try {
    await db.$transaction(async (tx) => {
      const lancs = await tx.financialEntry.findMany({
        where: { related_module: "emporio", related_id: id, status: { not: "cancelled" } },
        select: { id: true, status: true },
      });
      const comPagamento = lancs.some((l) => l.status === "paid");
      const pagos = lancs.length
        ? await tx.financialPayment.count({ where: { entry_id: { in: lancs.map((l) => l.id) } } })
        : 0;
      if (comPagamento || pagos > 0) {
        throw new AbortarCompra(
          fail("PURCHASE_HAS_PAYMENT", "Essa compra tem pagamento registrado. Desfaça os pagamentos antes de cancelar.", 409),
        );
      }
      const agora = new Date();
      const r = await tx.emporioPurchase.updateMany({
        where: { id, canceled_at: null },
        data: { canceled_at: agora, canceled_reason: motivo },
      });
      if (r.count === 0) {
        throw new AbortarCompra(fail("ALREADY_CANCELED", "Essa compra já foi cancelada.", 409));
      }
      if (lancs.length > 0) {
        await tx.financialEntry.updateMany({
          where: { id: { in: lancs.map((l) => l.id) } },
          data: { status: "cancelled" },
        });
      }
      await tx.stockMovement.updateMany({
        where: { purchase_id: id, canceled_at: null },
        data: { canceled_at: agora, canceled_reason: motivo },
      });
    });
  } catch (err) {
    if (err instanceof AbortarCompra) return err.recusa;
    throw err;
  }
  return lerCompraAction(db, ator, id);
}
