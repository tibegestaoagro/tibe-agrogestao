import { type CalcResult, isPositiveNumber, round } from "./shared";

const KG_POR_UNIDADE_ANIMAL = 450;

/**
 * Taxa de Lotacao: quantas Unidades Animais (UA) o rebanho representa por
 * hectare de pastagem, no momento atual (nao e capacidade de suporte ao
 * longo do ano: para isso, ver a calculadora de Pastagem, que usa a mesma
 * convencao de UA).
 *
 * Formula: TL (UA/ha) = peso vivo total do rebanho (kg) / 450 / area (ha),
 * onde 1 UA = 450 kg de peso vivo, a convencao zootecnica padrao no Brasil.
 *
 * Fontes: Embrapa Gado de Corte (CNPGC), "Area de Piquete e Taxa de Lotacao
 * no Pastejo Rotacionado" (Comunicado Tecnico 101)
 * (https://www.infoteca.cnptia.embrapa.br/bitstream/doc/569854/1/comtec101.pdf);
 * Embrapa, "Metodos de calculo de taxa de lotacao em pastagens com
 * suplementacao"
 * (https://www.embrapa.br/en/busca-de-publicacoes/-/publicacao/47626/metodos-de-calculo-de-taxa-lotacao-em-pastagens-com-suplementacao).
 *
 * Confianca: ALTA. Formula fixa e amplamente citada; o unico parametro fixo
 * (450 kg = 1 UA) e convencao nacional, nao estimativa do agente.
 */
export function calcularTaxaLotacao(input: {
  numeroAnimais: number;
  pesoMedioKg: number;
  areaHectares: number;
}): CalcResult<{
  pesoVivoTotalKg: number;
  unidadesAnimais: number;
  taxaLotacaoUaHa: number;
  cabecasPorHectare: number;
}> {
  const { numeroAnimais, pesoMedioKg, areaHectares } = input;

  if (!isPositiveNumber(numeroAnimais)) {
    return { ok: false, error: "Numero de animais deve ser maior que zero." };
  }
  if (!isPositiveNumber(pesoMedioKg)) {
    return { ok: false, error: "Peso medio deve ser maior que zero." };
  }
  if (!isPositiveNumber(areaHectares)) {
    return { ok: false, error: "Area deve ser maior que zero." };
  }

  const pesoVivoTotalKg = numeroAnimais * pesoMedioKg;
  const unidadesAnimais = pesoVivoTotalKg / KG_POR_UNIDADE_ANIMAL;
  const taxaLotacaoUaHa = unidadesAnimais / areaHectares;
  const cabecasPorHectare = numeroAnimais / areaHectares;

  return {
    ok: true,
    data: {
      pesoVivoTotalKg: round(pesoVivoTotalKg, 0),
      unidadesAnimais: round(unidadesAnimais, 2),
      taxaLotacaoUaHa: round(taxaLotacaoUaHa, 2),
      cabecasPorHectare: round(cabecasPorHectare, 2),
    },
  };
}
