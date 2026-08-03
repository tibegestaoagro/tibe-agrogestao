import { type CalcResult, isPositiveNumber, round } from "./shared";

const KG_POR_UNIDADE_ANIMAL = 450;
const CONSUMO_DIARIO_PASTEJO_PERCENT = 0.11;

/**
 * Pastagem (capacidade de suporte): quantas Unidades Animais (UA) por
 * hectare uma pastagem aguenta ao longo do ano, a partir da producao de
 * forragem; e, opcionalmente, quantos hectares um rebanho precisa.
 *
 * Formula: Capacidade de suporte (UA/ha/ano) = producao anual de forragem
 * (kg de materia seca/ha) / (peso de 1 UA x 11% ao dia x 365 dias), onde 1
 * UA = 450 kg. O fator de 11% ao dia e maior que o consumo real do animal
 * (2,5% a 3% do peso vivo, ver calculadora de Racao) porque incorpora
 * perdas por pisoteio, selecao de pastejo e material que envelhece sem ser
 * pastejado: e a propria Embrapa que usa esse fator na formula de
 * capacidade de suporte.
 *
 * Fonte: Embrapa Gado de Corte (CNPGC), Central de Atendimento ao Cidadao,
 * "Como se calcula a capacidade de suporte de uma pastagem?"
 * (https://cloud.cnpgc.embrapa.br/sac/2016/06/15/como-se-calcula-a-capacidade-de-suporte-de-uma-pastagem/).
 * Exemplo da propria Embrapa conferido nesta funcao: producao de 25.000 kg
 * MS/ha/ano resulta em 1,38 UA/ha/ano.
 *
 * Confianca: ALTA. Formula publicada diretamente pela Embrapa Gado de
 * Corte, com exemplo numerico batendo com o resultado desta funcao. O
 * unico dado que o usuario precisa trazer de fora (producao de forragem em
 * kg MS/ha/ano) normalmente vem de uma analise de pastagem ou de tabela por
 * especie forrageira: nao e inventado aqui.
 */
export function calcularCapacidadeSuportePastagem(input: {
  producaoForragemKgMsHaAno: number;
  areaHectares?: number;
  numeroAnimaisRebanho?: number;
  pesoMedioKg?: number;
}): CalcResult<{
  capacidadeUaHaAno: number;
  capacidadeTotalUa: number | null;
  areaNecessariaHectares: number | null;
}> {
  const { producaoForragemKgMsHaAno, areaHectares, numeroAnimaisRebanho, pesoMedioKg } = input;

  if (!isPositiveNumber(producaoForragemKgMsHaAno)) {
    return { ok: false, error: "Producao de forragem deve ser maior que zero." };
  }

  const consumoAnualPorUa = KG_POR_UNIDADE_ANIMAL * CONSUMO_DIARIO_PASTEJO_PERCENT * 365;
  const capacidadeUaHaAno = producaoForragemKgMsHaAno / consumoAnualPorUa;

  let capacidadeTotalUa: number | null = null;
  if (areaHectares !== undefined) {
    if (!isPositiveNumber(areaHectares)) {
      return { ok: false, error: "Area deve ser maior que zero." };
    }
    capacidadeTotalUa = round(capacidadeUaHaAno * areaHectares, 2);
  }

  let areaNecessariaHectares: number | null = null;
  if (numeroAnimaisRebanho !== undefined || pesoMedioKg !== undefined) {
    if (!isPositiveNumber(numeroAnimaisRebanho ?? NaN) || !isPositiveNumber(pesoMedioKg ?? NaN)) {
      return {
        ok: false,
        error: "Informe numero de animais e peso medio (ambos maiores que zero) para calcular a area necessaria.",
      };
    }
    const uaRebanho = (numeroAnimaisRebanho! * pesoMedioKg!) / KG_POR_UNIDADE_ANIMAL;
    areaNecessariaHectares = round(uaRebanho / capacidadeUaHaAno, 2);
  }

  return {
    ok: true,
    data: {
      capacidadeUaHaAno: round(capacidadeUaHaAno, 2),
      capacidadeTotalUa,
      areaNecessariaHectares,
    },
  };
}
