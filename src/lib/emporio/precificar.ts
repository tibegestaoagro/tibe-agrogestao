import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { vendedoresDaLoja } from "@/lib/emporio/vendedores";
import { INCLUDE_PRODUTO, lacradoEfetivo, type Ator, type ProdutoRow } from "@/lib/actions/emporio-catalogo";

/**
 * Meu Empório, entrega 4: o preço, o desconto e o vendedor de uma lista de itens,
 * a mesma regra para a venda e para o orçamento (extraída de `prepararVenda`).
 * Validação em TypeScript puro, porque o agente do WhatsApp não passa pelo Zod.
 */

export type VendaItemInput = {
  emporio_product_id: string;
  presentation_id: string;
  quantity: number;
  unit_price?: number | null;
};

export type ItemPrecificado = {
  emporio_product_id: string;
  presentation_id: string;
  /** Na apresentação. */
  quantity: number;
  /** Na unidade-base. */
  base_qty: number;
  /** O preço-base da apresentação na loja (ou o de `precoBase`); nulo sem preço. */
  suggested_cent: number | null;
  unit_cent: number;
  total_cent: number;
  produto: ProdutoRow;
  apresentacao: ProdutoRow["presentations"][number];
};

export type ItensPrecificados = {
  itens: ItemPrecificado[];
  total_cent: number;
  desconto_cent: number;
  /** Quem autorizou o desconto acima do limite da loja (o próprio ator), ou nulo. */
  autorizou: string | null;
};

const arred2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;
const arred3 = (n: number) => Math.round(Number((n * 1000).toPrecision(14))) / 1000;
const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * O preço-base que vale ao faturar um item que está no orçamento, em centavos.
 * Dentro da validade: o menor entre o orçado e o de hoje (o orçado, se hoje não
 * houver preço). Vencido: o de hoje, como numa venda comum (nulo sem preço).
 */
export function precoQueVale(orcadoCent: number, hojeCent: number | null, vencido: boolean): number | null {
  if (vencido) return hojeCent;
  return hojeCent === null ? orcadoCent : Math.min(orcadoCent, hojeCent);
}

/**
 * Quem vendeu (entrega 3, Q168, Q169). `herdado` (a troca, o orçamento faturado)
 * vale sem revalidar: a pessoa pode ter sido desativada depois. Sem pedido, quem
 * registra é o vendedor, exceto o Caixa, que precisa escolher.
 */
export async function resolverVendedor(
  db: TenantPrismaClient,
  ator: Ator,
  lojaId: string,
  sellerUserId?: unknown,
  herdado?: string | null,
): Promise<ActionResult<string>> {
  if (herdado) return ok(herdado);
  if (sellerUserId != null && typeof sellerUserId !== "string") {
    return fail("INVALID_SELLER", "Escolha um vendedor desta loja.", 422, "seller_user_id");
  }
  const pedido = typeof sellerUserId === "string" ? sellerUserId.trim() : "";
  if (pedido) {
    const possiveis = await vendedoresDaLoja(db, lojaId);
    if (!possiveis.some((u) => u.id === pedido)) {
      return fail("INVALID_SELLER", "Escolha um vendedor desta loja.", 422, "seller_user_id");
    }
    return ok(pedido);
  }
  if ((await papelDoEmporio(db, ator)).papel === "caixa") {
    return fail("SELLER_REQUIRED", "Escolha o vendedor que atendeu.", 422, "seller_user_id");
  }
  return ok(ator.id);
}

/**
 * Valida os itens e calcula preço e desconto. O preço sugerido é o da
 * apresentação na loja; `precoBase` (centavos por `presentation_id`) o substitui
 * para as apresentações que trouxer. Sem `unit_price`, vale o sugerido (sem ele,
 * 422). Desconto (Q85): só o que fica abaixo do sugerido; acima do
 * `max_discount_pct` da loja, só o gestor da loja passa, e fica como quem autorizou.
 *
 * Quem chama confere antes que há ao menos um item (a frase diz de quê).
 */
export async function precificarItens(
  db: TenantPrismaClient,
  ator: Ator,
  loja: { id: string; max_discount_pct: unknown },
  items: VendaItemInput[],
  opts: { precoBase?: Map<string, number> } = {},
): Promise<ActionResult<ItensPrecificados>> {
  const produtoIds = [...new Set(items.map((i) => i?.emporio_product_id).filter((x): x is string => typeof x === "string" && !!x))];
  const produtos = await db.emporioProduct.findMany({ where: { id: { in: produtoIds } }, include: INCLUDE_PRODUTO });
  const produtoPorId = new Map<string, ProdutoRow>(produtos.map((p) => [p.id, p]));
  const apresentacaoIds = items.map((i) => i?.presentation_id).filter((x): x is string => typeof x === "string" && !!x);
  const precos = await db.presentationPrice.findMany({
    where: { establishment_id: loja.id, presentation_id: { in: apresentacaoIds } },
    select: { presentation_id: true, price: true },
  });
  const precoPorApresentacao = new Map(precos.map((p) => [p.presentation_id, decToNum(p.price)]));

  // As contas em reais, como a venda sempre fez; a saída vai em centavos.
  type Linha = {
    produto: ProdutoRow;
    apresentacao: ProdutoRow["presentations"][number];
    quantity: number;
    base_qty: number;
    suggested: number | null;
    unit_price: number;
    total: number;
  };
  const linhas: Linha[] = [];
  for (const it of items) {
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
    const base = opts.precoBase?.get(ap.id);
    const sugerido = base !== undefined ? base / 100 : (precoPorApresentacao.get(ap.id) ?? null);
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
    linhas.push({
      produto,
      apresentacao: ap,
      quantity,
      base_qty,
      suggested: sugerido,
      unit_price,
      total: arred2(quantity * unit_price),
    });
  }

  const totalCent = linhas.reduce((s, i) => s + centavos(i.total), 0);

  let descontoCent = 0;
  let baseCent = 0;
  for (const i of linhas) {
    if (i.suggested === null) continue;
    baseCent += centavos(i.suggested * i.quantity);
    if (i.unit_price < i.suggested) descontoCent += centavos((i.suggested - i.unit_price) * i.quantity);
  }
  let autorizou: string | null = null;
  if (descontoCent > 0 && baseCent > 0) {
    const pct = (descontoCent / baseCent) * 100;
    const limite = decToNum(loja.max_discount_pct) ?? 0;
    if (pct > limite + 1e-9) {
      if (!pode(await papelDoEmporio(db, ator), "gestor_da_loja", loja.id)) {
        return fail(
          "DISCOUNT_ABOVE_LIMIT",
          `O desconto de ${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% passa do limite de ${limite.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% desta loja. Peça ao gestor da loja.`,
          403,
          "items",
        );
      }
      autorizou = ator.id;
    }
  }

  return ok({
    itens: linhas.map((i) => ({
      emporio_product_id: i.produto.id,
      presentation_id: i.apresentacao.id,
      quantity: i.quantity,
      base_qty: i.base_qty,
      suggested_cent: i.suggested === null ? null : centavos(i.suggested),
      unit_cent: centavos(i.unit_price),
      total_cent: centavos(i.total),
      produto: i.produto,
      apresentacao: i.apresentacao,
    })),
    total_cent: totalCent,
    desconto_cent: descontoCent,
    autorizou,
  });
}
