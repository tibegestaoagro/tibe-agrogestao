/**
 * Frete na venda e origem da venda (Q244, Q248). Constantes compartilhadas
 * pela action da venda, pelo Resultado e pelo A pagar.
 */

/** Categoria do lançamento do frete cobrado do cliente. */
export const CATEGORIA_FRETE = "Frete de entrega";

export const ORIGENS_DA_VENDA = ["balcao", "ecommerce"] as const;
export type OrigemDaVenda = (typeof ORIGENS_DA_VENDA)[number];

export const ROTULO_DA_ORIGEM: Record<OrigemDaVenda, string> = { balcao: "Balcão", ecommerce: "E-commerce" };
