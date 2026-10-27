/**
 * Formação de preço do Meu Empório (Módulo 39, F1, Q53). Puras: nada daqui
 * toca o banco, e nada do que devolvem é gravado.
 */

/**
 * Preço sugerido = custo × (1 + despesas/100) × (1 + lucro/100), em centavos
 * arredondados. Sem custo, nulo (não há o que sugerir).
 */
export function precoSugerido(
  custo: number | null,
  despesasPct: number,
  lucroPct: number,
): number | null {
  if (custo == null || !Number.isFinite(custo)) return null;
  const bruto = custo * (1 + despesasPct / 100) * (1 + lucroPct / 100);
  // O epsilon evita que 1.005 * 100 = 100.49999 perca o centavo.
  return Math.round((bruto + Number.EPSILON) * 100) / 100;
}

/**
 * Percentual efetivo (vale para despesas e para lucro, cada um por si):
 * exceção da apresentação na loja, senão a do produto, senão o padrão da
 * loja, senão 0.
 */
export function percentualEfetivo(
  apresentacaoNaLoja: number | null,
  produto: number | null,
  loja: number | null,
): number {
  return apresentacaoNaLoja ?? produto ?? loja ?? 0;
}
