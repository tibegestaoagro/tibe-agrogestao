import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Divisao de area para pastejo rotacionado (§12 do documento do cliente).
 *
 * A conta central e geometria de calendario, nao agronomia: para um lote
 * ocupar um piquete por `ocupacao` dias e so voltar nele depois de `descanso`
 * dias, sao precisos `descanso / ocupacao + 1` piquetes. O `+ 1` e o piquete
 * onde o lote esta enquanto os outros descansam, e esquece-lo e o erro que faz
 * o rebanho voltar um turno cedo demais.
 *
 * Com mais de um lote, cada lote precisa do seu piquete ocupado ao mesmo
 * tempo, entao o total sobe na mesma proporcao.
 *
 * ⚠️ **Confianca MEDIA, e o §12 manda dizer isso.** O numero de piquetes sai
 * certo; quantos animais cabem em cada um depende da forragem, da chuva e da
 * epoca, e isso esta FORA desta funcao (e a calculadora de lotacao, e ela
 * tambem e estimativa). O periodo de descanso e informado pelo produtor ou
 * pelo tecnico dele: chutar aqui seria a "recomendacao automatica" que o §46
 * proibe.
 */
export function calcularPiquetes(input: {
  areaHectares: number;
  numeroLotes: number;
  diasOcupacao: number;
  diasDescanso?: number;
  /** Quando o produtor ja sabe em quantos piquetes quer dividir. */
  piquetesDesejados?: number;
}): CalcResult<{
  piquetesSugeridos: number;
  piquetesPorLote: number;
  areaMediaPorPiqueteHectares: number;
  areaPorLoteHectares: number;
  /** Verdadeiro quando o numero veio do produtor, nao do descanso. */
  veioDoProdutor: boolean;
  /** Quantos dias de descanso o arranjo entrega de fato. */
  descansoResultanteDias: number;
}> {
  const { areaHectares, numeroLotes, diasOcupacao, diasDescanso, piquetesDesejados } = input;

  if (!isPositiveNumber(areaHectares)) {
    return { ok: false, error: "Area disponivel deve ser maior que zero." };
  }
  if (!isPositiveNumber(numeroLotes)) {
    return { ok: false, error: "Informe pelo menos um lote de animais." };
  }
  if (!isPositiveNumber(diasOcupacao)) {
    return { ok: false, error: "Dias de ocupacao deve ser maior que zero." };
  }
  if (diasDescanso === undefined && piquetesDesejados === undefined) {
    return {
      ok: false,
      error: "Informe os dias de descanso ou em quantos piquetes quer dividir.",
    };
  }
  if (piquetesDesejados !== undefined && !isPositiveNumber(piquetesDesejados)) {
    return { ok: false, error: "Quantidade de piquetes deve ser maior que zero." };
  }
  if (diasDescanso !== undefined && !isPositiveNumber(diasDescanso)) {
    return { ok: false, error: "Dias de descanso deve ser maior que zero." };
  }

  const veioDoProdutor = piquetesDesejados !== undefined;

  /*
   * Piquete e coisa fisica: 6,2 piquetes nao existe. Arredondar para CIMA
   * mantem o descanso prometido; para baixo, o lote volta antes de o capim
   * rebrotar, que e justamente o que o rotacionado quer evitar.
   */
  const porLote = veioDoProdutor
    ? Math.max(1, Math.ceil(piquetesDesejados / numeroLotes))
    : Math.max(2, Math.ceil(diasDescanso! / diasOcupacao) + 1);

  const piquetesSugeridos = veioDoProdutor ? piquetesDesejados! : porLote * numeroLotes;
  const areaPorLote = areaHectares / numeroLotes;

  return {
    ok: true,
    data: {
      piquetesSugeridos,
      piquetesPorLote: porLote,
      areaMediaPorPiqueteHectares: round(areaHectares / piquetesSugeridos, 2),
      areaPorLoteHectares: round(areaPorLote, 2),
      veioDoProdutor,
      descansoResultanteDias: round((porLote - 1) * diasOcupacao, 1),
    },
  };
}
