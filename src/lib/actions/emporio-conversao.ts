import type { Prisma } from "@/generated/prisma/client";
import type { TenantPrismaClient } from "@/lib/prisma";
import { delegates } from "@/lib/prisma-delegates";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { exigir } from "@/lib/emporio/papel";
import { registrarNoHistorico } from "@/lib/emporio/historico";
import { custoMedio } from "@/lib/emporio/custo-medio";
import { findUnit } from "@/lib/stock/units";
import { lerMovimentos } from "@/lib/actions/emporio-estoque";
import { lerProdutoEmporioAction, type Ator, type EmporioProductDetail } from "@/lib/actions/emporio-catalogo";

/**
 * Meu Empório: "Converter para quilo" (Q320, Q321). O produto estocado em saca
 * ou fardo passa a ser estocado na unidade do conteúdo (quilo, litro, unidade),
 * para vender a granel em qualquer peso.
 *
 * Nada de saldo é gravado: multiplica-se pelo conteúdo (f) tudo o que está na
 * unidade-base e divide-se o que é custo por unidade-base, numa transação só.
 * O saldo, que é a soma das movimentações (invariante 2), sai certo sozinho.
 *
 * Validação em TypeScript puro: o agente do WhatsApp chama estas funções sem o
 * Zod da rota.
 */

const arred3 = (n: number) => Math.round(n * 1000) / 1000;
const arred4 = (n: number) => Math.round(n * 10000) / 10000;

export type PreviaLoja = {
  establishment_id: string;
  name: string;
  balance_before: number;
  balance_after: number;
  average_cost_before: number | null;
  average_cost_after: number | null;
};

export type PreviaApresentacao = {
  id: string;
  name: string;
  sealed: boolean;
  archived: boolean;
  base_qty_before: number;
  base_qty_after: number;
  /** Q321: avulsa cujo valor novo não é múltiplo de 50 g (50 ml; inteiro em unidade). */
  check: boolean;
};

export type PreviaConversao = {
  product_id: string;
  name: string;
  from_unit: string;
  to_unit: string;
  content_qty: number;
  stores: PreviaLoja[];
  reference_cost_before: number | null;
  reference_cost_after: number | null;
  presentations: PreviaApresentacao[];
};

export type ConversaoFeita = {
  content_qty: number;
  from_unit: string;
  to_unit: string;
  product: EmporioProductDetail;
};

/** Múltiplo de 0,05 (em unidade: inteiro), com folga para o ponto flutuante. */
function fechaEmPassos(valor: number, unidade: string): boolean {
  if (unidade === "unidade") return Number.isInteger(arred3(valor));
  const passos = valor / 0.05;
  return Math.abs(passos - Math.round(passos)) < 1e-6;
}

type Tx = Prisma.TransactionClient;

type Elegivel = {
  id: string;
  product_id: string;
  tenant_id: string;
  base_unit: string;
  content_unit: string;
  content_qty: Prisma.Decimal;
  fator: number;
  reference_cost: number | null;
  name: string;
};

async function acharElegivel(c: Tx, id: unknown): Promise<ActionResult<Elegivel>> {
  if (typeof id !== "string" || !id) return fail("NOT_FOUND", "Produto não encontrado.", 404);
  const p = await c.emporioProduct.findFirst({ where: { id }, include: { product: { select: { name: true } } } });
  if (!p) return fail("NOT_FOUND", "Produto não encontrado.", 404);
  if (p.base_unit !== "saca" && p.base_unit !== "fardo") {
    return fail(
      "VALIDATION_ERROR",
      "Só dá para converter produto que conta o estoque em saca ou fardo.",
      422,
      "base_unit",
    );
  }
  const fator = decToNum(p.content_qty);
  if (p.content_qty == null || fator == null || !(fator > 0) || !p.content_unit) {
    return fail(
      "VALIDATION_ERROR",
      "Esse produto não tem o conteúdo da saca informado, então não há como converter.",
      422,
      "content_qty",
    );
  }
  return ok({
    id: p.id,
    product_id: p.product_id,
    tenant_id: p.tenant_id,
    base_unit: p.base_unit,
    content_unit: p.content_unit,
    content_qty: p.content_qty,
    fator,
    reference_cost: decToNum(p.reference_cost),
    name: p.product.name,
  });
}

/** Lê o produto e simula a conversão: o "depois" sai das movimentações já convertidas, com o mesmo arredondamento da gravação. */
async function montarPrevia(c: Tx, e: Elegivel): Promise<PreviaConversao> {
  const f = e.fator;
  const lojas = await c.establishment.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const movs = await lerMovimentos(c, lojas.map((l) => l.id), [e.product_id]);
  const stores: PreviaLoja[] = [];
  for (const loja of lojas) {
    const dela = movs.filter((m) => m.establishment_id === loja.id);
    if (dela.length === 0) continue;
    const antes = custoMedio(dela);
    const depois = custoMedio(
      dela.map((m) => ({
        ...m,
        quantity: arred3(m.quantity * f),
        previous_balance: m.previous_balance == null ? null : arred3(m.previous_balance * f),
        corrected_balance: m.corrected_balance == null ? null : arred3(m.corrected_balance * f),
        unit_cost: m.unit_cost == null ? null : arred4(m.unit_cost / f),
      })),
    );
    stores.push({
      establishment_id: loja.id,
      name: loja.name,
      balance_before: antes.saldo,
      balance_after: depois.saldo,
      average_cost_before: antes.saldo > 0 && antes.custo_medio !== null ? arred4(antes.custo_medio) : null,
      average_cost_after: depois.saldo > 0 && depois.custo_medio !== null ? arred4(depois.custo_medio) : null,
    });
  }
  const apresentacoes = await c.productPresentation.findMany({
    where: { emporio_product_id: e.id },
    orderBy: { name: "asc" },
  });
  return {
    product_id: e.id,
    name: e.name,
    from_unit: e.base_unit,
    to_unit: e.content_unit,
    content_qty: f,
    stores,
    reference_cost_before: e.reference_cost,
    reference_cost_after: e.reference_cost === null ? null : arred4(e.reference_cost / f),
    presentations: apresentacoes.map((a) => {
      const antes = decToNum(a.base_qty) ?? 0;
      const depois = arred3(antes * f);
      return {
        id: a.id,
        name: a.name,
        sealed: a.is_sealed_package,
        archived: a.archived_at !== null,
        base_qty_before: antes,
        base_qty_after: depois,
        check: !a.is_sealed_package && !fechaEmPassos(depois, e.content_unit),
      };
    }),
  };
}

export async function lerPreviaConversaoAction(
  db: TenantPrismaClient,
  ator: Ator,
  emporio_product_id: string,
): Promise<ActionResult<PreviaConversao>> {
  const neg = await exigir(db, ator, "chave:cadastrar_produto", "converter a unidade do produto");
  if (neg) return neg;
  const e = await acharElegivel(delegates(db), emporio_product_id);
  if (!e.ok) return e;
  return ok(await montarPrevia(delegates(db), e.data));
}

export type ConverterUnidadeInput = { content_qty: number };

const rotuloUnidade = (id: string, plural: boolean): string => {
  const u = findUnit(id);
  if (!u) return id;
  if (id === "quilograma") return "quilo";
  return plural ? u.plural : u.label.toLowerCase();
};

function numeroBR(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

export async function converterUnidadeAction(
  db: TenantPrismaClient,
  ator: Ator,
  emporio_product_id: string,
  input: ConverterUnidadeInput,
): Promise<ActionResult<ConversaoFeita>> {
  const neg = await exigir(db, ator, "chave:cadastrar_produto", "converter a unidade do produto");
  if (neg) return neg;
  const qtd = input?.content_qty;
  if (typeof qtd !== "number" || !Number.isFinite(qtd) || qtd <= 0) {
    return fail("VALIDATION_ERROR", "Informe o conteúdo mostrado na prévia.", 422, "content_qty");
  }

  const resultado = await runSerializableTenantTransaction(db, async (tx) => {
    const e = await acharElegivel(tx, emporio_product_id);
    if (!e.ok) return e;
    const p = e.data;
    if (Math.abs(qtd - p.fator) > 1e-9) {
      return fail(
        "VALIDATION_ERROR",
        "O conteúdo da saca mudou desde a prévia. Abra a prévia de novo.",
        422,
        "content_qty",
      );
    }
    const f = p.content_qty;
    const antes = await montarPrevia(tx, p);

    // O produto.
    await tx.emporioProduct.update({
      where: { id: p.id },
      data: {
        base_unit: p.content_unit,
        content_qty: null,
        content_unit: null,
        updated_by_user_id: ator.id,
        ...(p.reference_cost === null ? {} : { reference_cost: { divide: f } }),
      },
    });
    await tx.productPresentation.updateMany({
      where: { emporio_product_id: p.id },
      data: { base_qty: { multiply: f } },
    });

    // O livro-razão da loja. Movimentação de propriedade (fazenda) fica de fora: ela é na unidade do `Product.unit`.
    await tx.stockMovement.updateMany({
      where: { product_id: p.product_id, establishment_id: { not: null } },
      data: {
        quantity: { multiply: f },
        previous_balance: { multiply: f },
        corrected_balance: { multiply: f },
        unit_cost: { divide: f },
      },
    });

    // Compras (a quantidade sem apresentação já é na unidade-base).
    await tx.emporioPurchaseItem.updateMany({
      where: { emporio_product_id: p.id },
      data: { base_quantity: { multiply: f }, unit_cost: { divide: f } },
    });
    await tx.emporioPurchaseItem.updateMany({
      where: { emporio_product_id: p.id, presentation_id: null },
      data: { quantity: { multiply: f } },
    });
    // Vendas e devoluções.
    await tx.emporioSaleItem.updateMany({
      where: { emporio_product_id: p.id },
      data: { base_qty: { multiply: f }, unit_cost: { divide: f } },
    });
    await tx.emporioSaleReturnItem.updateMany({
      where: { sale_item: { emporio_product_id: p.id } },
      data: { base_qty: { multiply: f } },
    });
    // Transferências e limites.
    await tx.stockTransferItem.updateMany({
      where: { emporio_product_id: p.id },
      data: { sent_qty: { multiply: f }, received_qty: { multiply: f }, unit_cost: { divide: f } },
    });
    await tx.stockLimit.updateMany({
      where: { emporio_product_id: p.id },
      data: { min_qty: { multiply: f }, max_qty: { multiply: f } },
    });
    // Composição, como produto e como componente.
    await tx.composition.updateMany({
      where: { emporio_product_id: p.id },
      data: { reference_qty: { multiply: f } },
    });
    await tx.compositionItem.updateMany({
      where: { component_emporio_product_id: p.id },
      data: { quantity: { multiply: f } },
    });
    // Produção, e a cópia da composição guardada nela.
    await tx.productionEntry.updateMany({
      where: { emporio_product_id: p.id },
      data: { produced_qty: { multiply: f }, unit_cost: { divide: f } },
    });
    const producoes = await tx.productionEntry.findMany({
      where: {
        OR: [
          { emporio_product_id: p.id },
          { composition_snapshot: { path: ["items"], array_contains: [{ component_emporio_product_id: p.id }] } },
        ],
      },
      select: { id: true, emporio_product_id: true, composition_snapshot: true },
    });
    for (const pr of producoes) {
      const snap = pr.composition_snapshot as { reference_qty?: number; items?: Record<string, unknown>[] } & Record<
        string,
        unknown
      >;
      const novo: Record<string, unknown> = { ...snap };
      if (pr.emporio_product_id === p.id && typeof snap.reference_qty === "number") {
        novo.reference_qty = arred3(snap.reference_qty * p.fator);
      }
      if (Array.isArray(snap.items)) {
        novo.items = snap.items.map((it) => {
          if (it.component_emporio_product_id !== p.id) return it;
          return {
            ...it,
            base_unit: p.content_unit,
            quantity: typeof it.quantity === "number" ? arred3(it.quantity * p.fator) : it.quantity,
            consumed_qty: typeof it.consumed_qty === "number" ? arred3(it.consumed_qty * p.fator) : it.consumed_qty,
          };
        });
      }
      await tx.productionEntry.update({
        where: { id: pr.id },
        data: { composition_snapshot: novo as unknown as Prisma.InputJsonValue },
      });
    }
    // Despesa variável "embalagem": a quantidade por unidade vendida é na unidade-base da embalagem.
    await tx.variableExpenseRule.updateMany({
      where: { kind: "embalagem", packaging_emporio_product_id: p.id },
      data: { value: { multiply: f } },
    });
    const despesas = await tx.saleVariableExpense.findMany({
      where: { rule_snapshot: { path: ["packaging_emporio_product_id"], equals: p.id } },
      select: { id: true, rule_snapshot: true },
    });
    for (const d of despesas) {
      const snap = { ...(d.rule_snapshot as Record<string, unknown>) };
      if (snap.kind !== "embalagem") continue;
      for (const k of ["value", "quantity"]) {
        if (typeof snap[k] === "number") snap[k] = arred4((snap[k] as number) * p.fator);
      }
      if (typeof snap.unit_cost === "number") snap.unit_cost = arred4(snap.unit_cost / p.fator);
      await tx.saleVariableExpense.update({ where: { id: d.id }, data: { rule_snapshot: snap as Prisma.InputJsonValue } });
    }
    // Reposição pendente na Lista de uma loja: a quantidade estava na unidade antiga.
    await tx.shoppingItem.updateMany({
      where: {
        product_id: p.product_id,
        establishment_id: { not: null },
        status: "pendente",
        unit: p.base_unit,
      },
      data: { quantity: { multiply: f }, unit: p.content_unit },
    });

    const fatorTxt = `1 ${rotuloUnidade(p.base_unit, false)} = ${numeroBR(p.fator)} ${findUnit(p.content_unit)?.abbr ?? p.content_unit}`;
    await registrarNoHistorico(tx, ator, {
      action: "produto.converter_unidade",
      target_type: "produto",
      target_id: p.id,
      summary: `Converteu ${p.name} de ${rotuloUnidade(p.base_unit, false)} para ${rotuloUnidade(p.content_unit, false)} (${fatorTxt})`,
      changes: [
        { campo: "Unidade-base", antes: p.base_unit, depois: p.content_unit },
        { campo: "Conteúdo", antes: p.fator, depois: null },
        { campo: "Custo de referência", antes: antes.reference_cost_before, depois: antes.reference_cost_after },
        ...antes.stores.map((s) => ({
          campo: `Saldo em ${s.name}`,
          antes: s.balance_before,
          depois: s.balance_after,
        })),
        ...antes.presentations.map((a) => ({ campo: `Apresentação ${a.name}`, antes: a.base_qty_before, depois: a.base_qty_after })),
      ],
    });
    return ok({ fator: p.fator, from: p.base_unit, to: p.content_unit, id: p.id });
  });
  if (!resultado.ok) return resultado;

  const produto = await lerProdutoEmporioAction(db, ator, resultado.data.id);
  if (!produto.ok) return produto;
  return ok({
    content_qty: resultado.data.fator,
    from_unit: resultado.data.from,
    to_unit: resultado.data.to,
    product: produto.data,
  });
}
