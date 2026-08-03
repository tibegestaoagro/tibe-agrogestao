import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Adubacao: conversao de uma recomendacao de adubacao (kg/ha de um
 * nutriente, vinda de analise de solo e de um agronomo) para quantidade de
 * produto formulado a comprar e aplicar.
 *
 * Formula (regra de tres de conversao pelo teor garantido do produto):
 * kg de produto por hectare = dose recomendada do nutriente (kg/ha) / (teor
 * do nutriente garantido no produto, % / 100)
 * kg de produto total = kg de produto por hectare x area (ha)
 * numero de sacos = kg de produto total / peso do saco (kg)
 *
 * Fontes: metodo padrao de conversao de recomendacao de nutriente em dose
 * de adubo formulado, descrito de forma consistente em multiplas
 * referencias tecnicas brasileiras: Portal Agriconline, "Como calcular a
 * adubacao formulada"
 * (https://agriconline.com.br/portal/artigo/como-calcular-a-adubacao-formulada/);
 * Agrolink, "Fertilizantes NPK: o que sao, tipos, formulas e calculo".
 *
 * Confianca: ALTA para a conversao em si: e apenas regra de tres a partir
 * do teor garantido no rotulo do produto, sem nenhuma dose agronomica
 * inventada pelo agente. Importante: esta calculadora NAO recomenda quanto
 * nutriente aplicar por hectare, isso depende de analise de solo e de um
 * agronomo responsavel pela cultura: o usuario informa a dose recomendada
 * (que ja deve ter vindo de outra fonte tecnica) e a calculadora so
 * converte isso em quantidade de produto a comprar.
 */
export function calcularAdubacao(input: {
  doseNutrienteKgHa: number;
  teorNutrientePercent: number;
  areaHectares: number;
  pesoSacoKg?: number;
}): CalcResult<{
  kgProdutoPorHectare: number;
  kgProdutoTotal: number;
  numeroSacos: number | null;
}> {
  const { doseNutrienteKgHa, teorNutrientePercent, areaHectares, pesoSacoKg } = input;

  if (!isPositiveNumber(doseNutrienteKgHa)) {
    return { ok: false, error: "Dose recomendada do nutriente deve ser maior que zero." };
  }
  if (!isPositiveNumber(teorNutrientePercent) || teorNutrientePercent > 100) {
    return { ok: false, error: "Teor do nutriente no produto deve estar entre 0 e 100%." };
  }
  if (!isPositiveNumber(areaHectares)) {
    return { ok: false, error: "Area deve ser maior que zero." };
  }

  const kgProdutoPorHectare = doseNutrienteKgHa / (teorNutrientePercent / 100);
  const kgProdutoTotal = kgProdutoPorHectare * areaHectares;
  const numeroSacos =
    pesoSacoKg !== undefined && isPositiveNumber(pesoSacoKg) ? Math.ceil(kgProdutoTotal / pesoSacoKg) : null;

  return {
    ok: true,
    data: {
      kgProdutoPorHectare: round(kgProdutoPorHectare, 1),
      kgProdutoTotal: round(kgProdutoTotal, 1),
      numeroSacos,
    },
  };
}
