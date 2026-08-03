import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Cerca: quantidade de mouroes e de arame para uma cerca retilinea simples
 * (nao cobre cantos, porteiras ou esticadores extras, que exigem reforco a
 * parte e variam demais entre propriedades para ter uma formula fixa).
 *
 * Formulas (padrao de dimensionamento do setor de material de construcao
 * rural, nao e formula zootecnica: um erro aqui e de compra de material,
 * nao afeta a saude do rebanho):
 * - mouroes = ceil(comprimento / espacamento) + 1 (um mourao a mais no
 *   inicio da linha, alem dos que fecham cada vao)
 * - arame = comprimento x numero de fios x 1,05 (folga de 5% para
 *   esticamento, perdas de corte e amarracao nas pontas)
 *
 * Fontes: Calculadora Rural, "Calculadora de Cerca Rural: Arame Farpado,
 * Liso e Mouroes" (https://calculadorarural.com.br/ferramentas/dimensionamento-cerca);
 * Casa das Cercas, "Como calcular cerca por tipo de propriedade e criacao"
 * (https://blog.casadascercas.com.br/telas-rurais/como-calcular-cerca-por-propriedade-e-animal/).
 *
 * Confianca: ALTA. E geometria e regra de compra de material, nao dosagem
 * biologica: o risco de errar aqui e financeiro/logistico (comprar material
 * a mais ou a menos), nao ha risco pratico ao rebanho ou a lavoura.
 */
export function calcularCerca(input: {
  comprimentoMetros: number;
  espacamentoMetros: number;
  numeroFios: number;
  metrosPorRoloArame?: number;
}): CalcResult<{
  mouroesNecessarios: number;
  metrosDeArameNecessarios: number;
  rolosDeArameNecessarios: number | null;
}> {
  const { comprimentoMetros, espacamentoMetros, numeroFios, metrosPorRoloArame } = input;

  if (!isPositiveNumber(comprimentoMetros)) {
    return { ok: false, error: "Comprimento da cerca deve ser maior que zero." };
  }
  if (!isPositiveNumber(espacamentoMetros)) {
    return { ok: false, error: "Espacamento entre mouroes deve ser maior que zero." };
  }
  if (!isPositiveNumber(numeroFios) || !Number.isInteger(numeroFios)) {
    return { ok: false, error: "Numero de fios deve ser um numero inteiro maior que zero." };
  }

  const mouroesNecessarios = Math.ceil(comprimentoMetros / espacamentoMetros) + 1;
  const metrosDeArameNecessarios = round(comprimentoMetros * numeroFios * 1.05, 1);
  const rolosDeArameNecessarios =
    metrosPorRoloArame !== undefined && isPositiveNumber(metrosPorRoloArame)
      ? Math.ceil(metrosDeArameNecessarios / metrosPorRoloArame)
      : null;

  return {
    ok: true,
    data: { mouroesNecessarios, metrosDeArameNecessarios, rolosDeArameNecessarios },
  };
}
