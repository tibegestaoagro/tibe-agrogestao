import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { decToNum } from "@/lib/serialize";
import { papelDoEmporio, pode } from "@/lib/emporio/papel";
import { vendedoresDaLoja } from "@/lib/emporio/vendedores";
import { precoComDesconto, ratearDescontoNosItens, pctDoDesconto } from "@/lib/emporio/desconto";
import { conferirAutorizacao } from "@/lib/emporio/autorizacao-desconto";
import { podeAutorizarNaLoja } from "@/lib/emporio/autorizadores";
import { dinheiro } from "@/lib/emporio/historico";
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
  /** Só vale igual ou abaixo do preço da linha (desconto à moda antiga); acima, 422. Não vem junto de `discount_pct`. */
  unit_price?: number | null;
  /** Desconto da linha, em % (0 a 100), sobre o preço da linha. */
  discount_pct?: number | null;
};

export type ItemPrecificado = {
  emporio_product_id: string;
  presentation_id: string;
  /** Na apresentação. */
  quantity: number;
  /** Na unidade-base. */
  base_qty: number;
  /** O preço de referência: o da apresentação na loja (ou o do orçamento faturado); nulo sem preço. */
  suggested_cent: number | null;
  unit_cent: number;
  /** Quantidade vezes `unit_cent`, já sem a parte do desconto do total que coube à linha. */
  total_cent: number;
  produto: ProdutoRow;
  apresentacao: ProdutoRow["presentations"][number];
};

export type ItensPrecificados = {
  itens: ItemPrecificado[];
  /** O valor dos itens depois dos dois descontos (o `net_amount`): sempre maior que zero. */
  total_cent: number;
  /** O desconto das linhas mais o do total, contra o preço de referência. */
  desconto_cent: number;
  /** O desconto dado no total (Q329), já incluído em `desconto_cent` e rateado nas linhas. */
  order_discount_cent: number;
  /** Quem autorizou o desconto acima do limite da loja (o próprio ator, o que autorizou o orçamento ou a venda original, ou o gestor do PIN), ou nulo. */
  autorizou: string | null;
  /** O nome de quem autorizou, só quando não é quem registra (para o Histórico); senão nulo. */
  autorizou_nome: string | null;
};

export const arred2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;
export const arred3 = (n: number) => Math.round(Number((n * 1000).toPrecision(14))) / 1000;
/** Duas casas em inteiro: a soma de dinheiro se compara em centavos, nunca em float. */
export const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const numero = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * O preço que vale ao faturar um item que está no orçamento, em centavos: o que
 * o balcão cobra e o piso que o orçamento garante. Dentro da validade: o menor
 * entre o orçado (o `unit_price` do orçamento) e o de hoje (o orçado, se hoje não
 * houver preço). Vencido: o de hoje, como numa venda comum (nulo sem preço).
 */
export function precoQueVale(orcadoCent: number, hojeCent: number | null, vencido: boolean): number | null {
  if (vencido) return hojeCent;
  return hojeCent === null ? orcadoCent : Math.min(orcadoCent, hojeCent);
}

/**
 * O preço de referência ao faturar um item que está no orçamento, em centavos:
 * é o `suggested_price` da venda, contra o qual se mede o desconto (Q85). Dentro
 * da validade: o menor entre o de hoje e o sugerido quando se orçou (o sugerido
 * do orçamento, se hoje não houver preço; o orçado, se ele também faltar).
 * Vencido: o de hoje. Assim o desconto dado no orçamento aparece na venda, e o
 * limite da loja vale sobre o desconto inteiro, não sobre o que se soma ao faturar.
 */
export function precoDeReferencia(
  orcadoCent: number,
  sugeridoNoOrcamentoCent: number | null,
  hojeCent: number | null,
  vencido: boolean,
): number | null {
  if (vencido) return hojeCent;
  if (hojeCent === null) return sugeridoNoOrcamentoCent ?? orcadoCent;
  return sugeridoNoOrcamentoCent === null ? hojeCent : Math.min(hojeCent, sugeridoNoOrcamentoCent);
}

/**
 * O orçamento faturado, como `precificarItens` o enxerga (só dentro da validade;
 * vencido, a venda segue a regra normal e isto não vem).
 */
export type OrcamentoNaPrecificacao = {
  /**
   * Centavos por `presentation_id`: `referencia` faz o papel do preço da loja, e
   * `vale` é o preço do item sem `unit_price` e o piso da autorização herdada.
   */
  linhas: Map<string, { referencia: number; vale: number }>;
  /** Quem autorizou o desconto do orçamento acima do limite; nulo se ninguém. */
  autorizou: string | null;
  /** O desconto no total do orçamento, em centavos: a venda herda quando o corpo o omite, e a autorização herdada não cobre mais que ele. */
  order_discount_cent: number;
};

/** A venda que a edição substitui (Q249): a linha igual à dela é a mesma linha, mesmo acima do cadastro de hoje. */
export type OriginalNaPrecificacao = {
  /** Por `presentation_id`: o preço cobrado e o de referência (o sugerido) que a venda original tinha. */
  linhas: Map<string, { unit_cent: number; suggested_cent: number | null }[]>;
  autorizou: string | null;
  /** O % de desconto da original (linhas e total sobre a referência, sem arredondar). */
  pct: number;
};

export type OpcoesDePrecificacao = {
  orcamento?: OrcamentoNaPrecificacao | null;
  /** O desconto no total, em R$. `undefined` herda (do orçamento faturado, ou de `orderDiscountHerdadoCent`); `null` é zero. */
  orderDiscountAmount?: number | null;
  /** Quanto herdar quando o corpo omite o desconto no total e não há orçamento valendo (a edição da venda), em centavos. */
  orderDiscountHerdadoCent?: number | null;
  /** A autorização assinada do gestor (`discount_authorization`). */
  authorization?: unknown;
  original?: OriginalNaPrecificacao | null;
};

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
 * Valida os itens e calcula preço e desconto. O preço vem do cadastro (Q327): o da
 * apresentação na loja; com `orcamento` (a venda que fatura um orçamento dentro da
 * validade), o `vale` dele. Sem preço, 422 (Q328; nulo é "sem preço", nunca R$ 0,
 * e R$ 0,00 cadastrado é o brinde, Q334). O desconto entra por `discount_pct` na
 * linha, por `unit_price` abaixo do preço da linha, e por `order_discount_amount`
 * no total (rateado nas linhas, Q329). O % somado é medido contra a referência
 * (`suggested`) e, acima do `max_discount_pct` da loja, passa: a venda original
 * da edição (se o desconto não cresceu), o gestor da loja (fica como quem
 * autorizou), o orçamento faturado que já tinha autorização (se nada ficou abaixo
 * do orçado) ou a `discount_authorization` do gestor do PIN (Q330, Q331).
 *
 * Quem chama confere antes que há ao menos um item (a frase diz de quê).
 */
export async function precificarItens(
  db: TenantPrismaClient,
  ator: Ator,
  loja: { id: string; max_discount_pct: unknown },
  items: VendaItemInput[],
  opts: OpcoesDePrecificacao = {},
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
    /** O piso da autorização herdada do orçamento: o `vale` na linha dele, o sugerido fora. */
    piso: number | null;
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
    const doOrcamento = opts.orcamento?.linhas.get(ap.id);
    const cadastro = precoPorApresentacao.get(ap.id) ?? null;
    let sugerido = doOrcamento ? doOrcamento.referencia / 100 : cadastro;
    const piso = doOrcamento ? doOrcamento.vale / 100 : cadastro;

    const temPreco = it.unit_price != null;
    const temPct = it.discount_pct != null;
    if (temPreco && temPct) {
      return fail("VALIDATION_ERROR", `Em "${nome}", informe o preço com desconto ou o percentual de desconto, não os dois.`, 422, "items");
    }
    if (temPct && (!numero(it.discount_pct) || it.discount_pct < 0 || it.discount_pct > 100)) {
      return fail("VALIDATION_ERROR", `O desconto de "${nome}" deve ficar entre 0% e 100%.`, 422, "items");
    }
    // A edição da venda (Q249): a linha com o mesmo preço da original é a mesma linha, mesmo acima do
    // cadastro de hoje ou sem preço hoje; o que vale como referência é o que a original tinha.
    const daOriginal = temPreco && numero(it.unit_price)
      ? opts.original?.linhas.get(ap.id)?.find((o) => o.unit_cent === centavos(it.unit_price as number))
      : undefined;

    let unit_price: number;
    if (daOriginal) {
      unit_price = arred2(it.unit_price as number);
      sugerido = daOriginal.suggested_cent === null ? unit_price : daOriginal.suggested_cent / 100;
    } else {
      if (piso === null) {
        return fail("VALIDATION_ERROR", `Cadastre o preço de ${nome} (${ap.name}) nesta loja antes de vender.`, 422, "items");
      }
      if (temPreco) {
        if (!numero(it.unit_price) || arred2(it.unit_price) < 0 || (arred2(it.unit_price) === 0 && centavos(piso) !== 0)) {
          return fail("VALIDATION_ERROR", `O preço de "${nome}" deve ser maior que zero.`, 422, "items");
        }
        unit_price = arred2(it.unit_price);
        if (centavos(unit_price) > centavos(piso)) {
          return fail(
            "VALIDATION_ERROR",
            `O preço vem do cadastro: ${nome} (${ap.name}) custa ${dinheiro(piso)} nesta loja. Para vender por menos, dê desconto.`,
            422,
            "items",
          );
        }
      } else if (temPct && (it.discount_pct as number) > 0) {
        unit_price = precoComDesconto(centavos(piso), it.discount_pct as number) / 100;
      } else {
        unit_price = piso;
      }
    }
    linhas.push({
      produto,
      apresentacao: ap,
      quantity,
      base_qty,
      suggested: sugerido,
      unit_price,
      total: arred2(quantity * unit_price),
      piso: daOriginal ? unit_price : piso,
    });
  }

  const totaisCent = linhas.map((i) => centavos(i.total));
  const somaCent = totaisCent.reduce((s, t) => s + t, 0);

  // Q329: o desconto no total, em R$, de 0 até o valor dos itens; rateado nas linhas pelo valor.
  let totalDescontoCent = 0;
  if (opts.orderDiscountAmount === undefined) {
    totalDescontoCent = Math.min(opts.orderDiscountHerdadoCent ?? opts.orcamento?.order_discount_cent ?? 0, somaCent);
  } else if (opts.orderDiscountAmount !== null) {
    const v = opts.orderDiscountAmount;
    if (!numero(v) || v < 0) {
      return fail("VALIDATION_ERROR", "O desconto no total não pode ser negativo.", 422, "order_discount_amount");
    }
    totalDescontoCent = centavos(v);
    if (totalDescontoCent > somaCent) {
      return fail("VALIDATION_ERROR", "O desconto no total não pode passar do valor dos itens.", 422, "order_discount_amount");
    }
  }
  const partes = ratearDescontoNosItens(totaisCent, totalDescontoCent);
  const totaisFinais = totaisCent.map((t, n) => t - partes[n]);
  const totalCent = somaCent - totalDescontoCent;

  // Q334: um brinde acompanha uma venda.
  if (totalCent <= 0) {
    return fail("VALIDATION_ERROR", "Um brinde acompanha uma venda: inclua ao menos um produto pago.", 422, "items");
  }

  let linhasDescontoCent = 0;
  let baseCent = 0;
  for (const i of linhas) {
    if (i.suggested === null) continue;
    baseCent += centavos(i.suggested * i.quantity);
    if (i.unit_price < i.suggested) linhasDescontoCent += centavos((i.suggested - i.unit_price) * i.quantity);
  }
  const descontoCent = linhasDescontoCent + totalDescontoCent;

  let autorizou: string | null = null;
  if (descontoCent > 0 && baseCent > 0) {
    const pct = (descontoCent / baseCent) * 100;
    const limite = decToNum(loja.max_discount_pct) ?? 0;
    if (pct > limite + 1e-9) {
      // O orçamento autorizado acima do limite vale ao faturar, se nada ficar abaixo do que ele garantiu
      // (nem linha abaixo do `vale`, nem desconto no total acima do orçado).
      const herdada = opts.orcamento?.autorizou
        ? linhas.every((i) => i.piso === null || centavos(i.unit_price) >= centavos(i.piso)) &&
          totalDescontoCent <= opts.orcamento.order_discount_cent
          ? opts.orcamento.autorizou
          : null
        : null;
      // A edição da venda: o desconto que não cresceu segue autorizado por quem autorizou a original.
      const daVendaOriginal =
        opts.original?.autorizou && pct <= opts.original.pct + 1e-9 ? opts.original.autorizou : null;
      if (daVendaOriginal) {
        autorizou = daVendaOriginal;
      } else if (pode(await papelDoEmporio(db, ator), "gestor_da_loja", loja.id)) {
        autorizou = ator.id;
      } else if (herdada) {
        autorizou = herdada;
      } else if (opts.authorization == null || opts.authorization === "") {
        return fail(
          "DISCOUNT_ABOVE_LIMIT",
          `O desconto de ${pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% passa do limite de ${limite.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% desta loja. Peça ao gestor da loja.`,
          403,
          "items",
        );
      } else {
        // Q331, Q333: a autorização assinada vale para esta loja, para quem pede, até este %, e o autorizador ainda manda na loja.
        const p = typeof opts.authorization === "string" ? conferirAutorizacao(opts.authorization) : null;
        const vale =
          !!p &&
          p.establishment_id === loja.id &&
          p.requester_user_id === ator.id &&
          p.max_pct + 1e-9 >= pctDoDesconto(descontoCent, baseCent) &&
          (await podeAutorizarNaLoja(db, p.authorizer_user_id, loja.id));
        if (!p || !vale) {
          return fail(
            "DISCOUNT_AUTHORIZATION_INVALID",
            "A autorização do gestor não vale para este desconto. Peça de novo ao gestor.",
            403,
            "discount_authorization",
          );
        }
        autorizou = p.authorizer_user_id;
      }
    }
  }

  let autorizouNome: string | null = null;
  if (autorizou && autorizou !== ator.id) {
    autorizouNome = (await db.user.findFirst({ where: { id: autorizou }, select: { name: true } }))?.name ?? null;
  }

  return ok({
    itens: linhas.map((i, n) => ({
      emporio_product_id: i.produto.id,
      presentation_id: i.apresentacao.id,
      quantity: i.quantity,
      base_qty: i.base_qty,
      suggested_cent: i.suggested === null ? null : centavos(i.suggested),
      unit_cent: centavos(i.unit_price),
      total_cent: totaisFinais[n],
      produto: i.produto,
      apresentacao: i.apresentacao,
    })),
    total_cent: totalCent,
    desconto_cent: descontoCent,
    order_discount_cent: totalDescontoCent,
    autorizou,
    autorizou_nome: autorizouNome,
  });
}

/** A frase do Histórico: vazia quando ninguém autorizou ou quem autorizou é quem registra. Nunca leva PIN, hash nem o token. */
export const fraseDoAutorizador = (nome: string | null): string => (nome ? `, desconto autorizado por ${nome}` : "");
