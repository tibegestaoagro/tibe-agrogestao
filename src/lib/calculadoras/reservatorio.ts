import { calcularAgua } from "./agua";
import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Reservatorio de agua (§23 do documento do cliente): quanto armazenar para
 * aguentar N dias sem reposicao.
 *
 * O consumo vem de `calcularAgua`, nunca recalculado aqui: e a mesma formula,
 * e duas copias divergiriam no dia em que a referencia da Embrapa mudar. O
 * produtor escolhe quantos dias de autonomia quer, que e o que o §23 pede.
 *
 * Confianca: herda a MEDIA de `calcularAgua`, que e quem tem a estimativa. A
 * folga de seguranca e opcional e escolhida pelo produtor: dimensionamento
 * hidraulico avancado esta fora da primeira versao pelo §50.
 */
export function calcularReservatorio(input: {
  pesoMedioKg: number;
  numeroAnimais: number;
  diasAutonomia: number;
  /** Folga sobre o volume calculado, em porcentagem. */
  margemSegurancaPercent?: number;
}): CalcResult<{
  consumoLitrosDiaRebanho: number;
  volumeMinimoLitros: number;
  volumeComMargemLitros: number | null;
  volumeMinimoMetrosCubicos: number;
}> {
  const { pesoMedioKg, numeroAnimais, diasAutonomia, margemSegurancaPercent } = input;

  if (!isPositiveNumber(diasAutonomia)) {
    return { ok: false, error: "Dias de autonomia deve ser maior que zero." };
  }
  if (margemSegurancaPercent !== undefined && margemSegurancaPercent < 0) {
    return { ok: false, error: "Margem de seguranca nao pode ser negativa." };
  }

  const agua = calcularAgua({ pesoMedioKg, numeroAnimais, diasPeriodo: diasAutonomia });
  if (!agua.ok) return agua;

  const volumeMinimoLitros = agua.data.consumoLitrosPeriodoRebanho ?? 0;

  return {
    ok: true,
    data: {
      consumoLitrosDiaRebanho: agua.data.consumoLitrosDiaRebanho,
      volumeMinimoLitros,
      volumeComMargemLitros:
        margemSegurancaPercent !== undefined
          ? round(volumeMinimoLitros * (1 + margemSegurancaPercent / 100), 0)
          : null,
      volumeMinimoMetrosCubicos: round(volumeMinimoLitros / 1_000, 2),
    },
  };
}
