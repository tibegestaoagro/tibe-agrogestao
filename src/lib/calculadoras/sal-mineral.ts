import { type CalcResult, isPositiveNumber, round } from "./shared";

const CONSUMO_MIN_G_POR_100KG = 20;
const CONSUMO_MAX_G_POR_100KG = 30;

/**
 * Sal Mineral: consumo diario estimado por animal e total do rebanho, por
 * um periodo de dias, usando a faixa de formulacao comercial mais comum no
 * Brasil.
 *
 * Formula: as misturas minerais comerciais no Brasil sao formuladas, em
 * geral, para um consumo entre 20 g e 30 g por 100 kg de peso vivo/dia.
 * Ex.: um animal de 450 kg consome entre 90 g e 135 g/dia.
 *
 * Fonte: Embrapa Gado de Corte (CNPGC), Central de Atendimento ao Cidadao,
 * "Qual e o consumo diario de sal mineral de um bovino adulto?"
 * (https://cloud.cnpgc.embrapa.br/sac/2012/07/13/290-qual-e-o-consumo-diario-de-sal-mineral-de-um-bovino-adulto/).
 *
 * Confianca: ALTA para a faixa (citada pela propria Embrapa como padrao de
 * mercado). Atencao: a mesma fonte recomenda sempre conferir o consumo
 * indicado no ROTULO do produto especifico comprado, que pode ter uma
 * formulacao diferente dessa faixa (existem no mercado produtos formulados
 * para 10 g/100 kg PV, por exemplo): esta calculadora e um ponto de
 * partida, nao substitui o rotulo do produto real.
 */
export function calcularSalMineral(input: {
  pesoMedioKg: number;
  numeroAnimais: number;
  diasPeriodo: number;
}): CalcResult<{
  consumoMinGDiaPorAnimal: number;
  consumoMaxGDiaPorAnimal: number;
  consumoMinKgDiaRebanho: number;
  consumoMaxKgDiaRebanho: number;
  consumoMinKgPeriodoRebanho: number;
  consumoMaxKgPeriodoRebanho: number;
}> {
  const { pesoMedioKg, numeroAnimais, diasPeriodo } = input;

  if (!isPositiveNumber(pesoMedioKg)) {
    return { ok: false, error: "Peso medio deve ser maior que zero." };
  }
  if (!isPositiveNumber(numeroAnimais)) {
    return { ok: false, error: "Numero de animais deve ser maior que zero." };
  }
  if (!isPositiveNumber(diasPeriodo)) {
    return { ok: false, error: "Numero de dias deve ser maior que zero." };
  }

  const consumoMinGDiaPorAnimal = (pesoMedioKg / 100) * CONSUMO_MIN_G_POR_100KG;
  const consumoMaxGDiaPorAnimal = (pesoMedioKg / 100) * CONSUMO_MAX_G_POR_100KG;
  const consumoMinKgDiaRebanho = (consumoMinGDiaPorAnimal * numeroAnimais) / 1000;
  const consumoMaxKgDiaRebanho = (consumoMaxGDiaPorAnimal * numeroAnimais) / 1000;

  return {
    ok: true,
    data: {
      consumoMinGDiaPorAnimal: round(consumoMinGDiaPorAnimal, 1),
      consumoMaxGDiaPorAnimal: round(consumoMaxGDiaPorAnimal, 1),
      consumoMinKgDiaRebanho: round(consumoMinKgDiaRebanho, 2),
      consumoMaxKgDiaRebanho: round(consumoMaxKgDiaRebanho, 2),
      consumoMinKgPeriodoRebanho: round(consumoMinKgDiaRebanho * diasPeriodo, 2),
      consumoMaxKgPeriodoRebanho: round(consumoMaxKgDiaRebanho * diasPeriodo, 2),
    },
  };
}
