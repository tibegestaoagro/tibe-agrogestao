import { type CalcResult, isPositiveNumber, round } from "./shared";

const CONSUMO_PERCENT_PV = 0.1;

/**
 * Agua: estimativa de consumo diario de agua por bovino, e total do rebanho
 * por dia e por periodo.
 *
 * Formula: consumo diario de agua e aproximadamente 10% do peso vivo (regra
 * pratica de campo usada na pecuaria de corte brasileira). Consistente com
 * um levantamento da Embrapa em confinamentos comerciais no Brasil: consumo
 * medio observado de 37,8 litros/animal/dia para uma ingestao de materia
 * seca de 10 kg/dia (proximo dos 10% do peso vivo de um animal nessa faixa
 * de consumo).
 *
 * Fontes: regra pratica citada de forma recorrente na literatura tecnica de
 * pecuaria de corte brasileira (ex.: Giro do Boi, "Qual o consumo diario de
 * agua por bovino?"); estudo em confinamentos, "Estudos indicam pegada
 * hidrica de bovinos em confinamento no Brasil", Portal Embrapa
 * (https://www.embrapa.br/en/busca-de-noticias/-/noticia/21518151/estudos-indicam-pegada-hidrica-de-bovinos-em-confinamento-no-brasil).
 *
 * Confianca: MEDIA. A regra de 10% do peso vivo e consistente com o estudo
 * Embrapa citado, mas nao e um coeficiente fixo publicado formalmente pela
 * Embrapa como norma tecnica: o consumo real varia bastante com
 * temperatura ambiente, categoria animal (lactacao aumenta muito o
 * consumo, por exemplo) e sistema de producao. Use como estimativa de
 * dimensionamento de bebedouro, nao como valor de precisao.
 */
export function calcularAgua(input: {
  pesoMedioKg: number;
  numeroAnimais: number;
  diasPeriodo?: number;
}): CalcResult<{
  consumoLitrosDiaPorAnimal: number;
  consumoLitrosDiaRebanho: number;
  consumoLitrosPeriodoRebanho: number | null;
}> {
  const { pesoMedioKg, numeroAnimais, diasPeriodo } = input;

  if (!isPositiveNumber(pesoMedioKg)) {
    return { ok: false, error: "Peso medio deve ser maior que zero." };
  }
  if (!isPositiveNumber(numeroAnimais)) {
    return { ok: false, error: "Numero de animais deve ser maior que zero." };
  }

  const consumoLitrosDiaPorAnimal = pesoMedioKg * CONSUMO_PERCENT_PV;
  const consumoLitrosDiaRebanho = consumoLitrosDiaPorAnimal * numeroAnimais;

  let consumoLitrosPeriodoRebanho: number | null = null;
  if (diasPeriodo !== undefined) {
    if (!isPositiveNumber(diasPeriodo)) {
      return { ok: false, error: "Numero de dias deve ser maior que zero." };
    }
    consumoLitrosPeriodoRebanho = round(consumoLitrosDiaRebanho * diasPeriodo, 0);
  }

  return {
    ok: true,
    data: {
      consumoLitrosDiaPorAnimal: round(consumoLitrosDiaPorAnimal, 1),
      consumoLitrosDiaRebanho: round(consumoLitrosDiaRebanho, 0),
      consumoLitrosPeriodoRebanho,
    },
  };
}
