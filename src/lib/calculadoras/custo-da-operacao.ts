import { type CalcResult, isPositiveNumber, round } from "./shared";
import { UNIDADES } from "./conversoes";

/**
 * Custo por hectare (§32) e servico terceirizado (§33) do documento do
 * cliente. Duas contas de multiplicacao e divisao; o valor da ferramenta nao
 * esta na matematica, esta em o produtor NAO errar a unidade.
 *
 * Confianca: ALTA. Nao ha coeficiente tecnico nenhum aqui: tudo o que entra
 * veio do produtor ou do orcamento que ele recebeu.
 */

export function calcularCustoPorHectare(input: {
  custoTotal: number;
  areaHectares: number;
  /** Opcional: quando a operacao e medida em hora, o rendimento tambem sai. */
  horasTotais?: number;
}): CalcResult<{
  custoPorHectare: number;
  horasPorHectare: number | null;
  custoPorHora: number | null;
}> {
  const { custoTotal, areaHectares, horasTotais } = input;

  if (!isPositiveNumber(custoTotal)) {
    return { ok: false, error: "Custo total deve ser maior que zero." };
  }
  if (!isPositiveNumber(areaHectares)) {
    return { ok: false, error: "Area deve ser maior que zero." };
  }
  if (horasTotais !== undefined && !isPositiveNumber(horasTotais)) {
    return { ok: false, error: "Horas totais deve ser maior que zero." };
  }

  return {
    ok: true,
    data: {
      custoPorHectare: round(custoTotal / areaHectares, 2),
      horasPorHectare: horasTotais !== undefined ? round(horasTotais / areaHectares, 2) : null,
      custoPorHora: horasTotais !== undefined ? round(custoTotal / horasTotais, 2) : null,
    },
  };
}

/**
 * Unidades em que um servico contratado costuma ser cobrado (§33): trator por
 * hora, gradagem por hectare, cerca por metro, colheita por saca.
 */
export const UNIDADES_DE_SERVICO = [
  "hora",
  "hectare",
  "metro",
  "quilometro",
  "saca",
  "animal",
  "diaria",
] as const;

export type UnidadeDeServico = (typeof UNIDADES_DE_SERVICO)[number];

const LABEL_DE_SERVICO: Record<UnidadeDeServico, string> = {
  hora: "hora",
  hectare: UNIDADES.hectare.label,
  metro: UNIDADES.metro.label,
  quilometro: UNIDADES.quilometro.label,
  saca: UNIDADES.saca.label,
  animal: "animal",
  diaria: "diaria",
};

export function calcularServicoTerceirizado(input: {
  precoPorUnidade: number;
  quantidade: number;
  unidade: UnidadeDeServico;
  /** §32: quando o servico e cobrado por outra unidade mas cobre uma area. */
  areaHectares?: number;
}): CalcResult<{
  custoTotal: number;
  /** O texto repete a unidade escolhida, que e o ponto da ferramenta. */
  unidadeLabel: string;
  custoPorHectare: number | null;
}> {
  const { precoPorUnidade, quantidade, unidade, areaHectares } = input;

  if (!isPositiveNumber(precoPorUnidade)) {
    return { ok: false, error: "Preco por unidade deve ser maior que zero." };
  }
  if (!isPositiveNumber(quantidade)) {
    return { ok: false, error: "Tamanho da operacao deve ser maior que zero." };
  }
  if (areaHectares !== undefined && !isPositiveNumber(areaHectares)) {
    return { ok: false, error: "Area deve ser maior que zero." };
  }

  const custoTotal = round(precoPorUnidade * quantidade, 2);

  return {
    ok: true,
    data: {
      custoTotal,
      unidadeLabel: LABEL_DE_SERVICO[unidade],
      custoPorHectare: areaHectares !== undefined ? round(custoTotal / areaHectares, 2) : null,
    },
  };
}
