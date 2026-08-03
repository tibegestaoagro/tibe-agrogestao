import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Calagem: necessidade de calcario (NC) pelo metodo da saturacao por
 * bases, corrigida pelo PRNT (Poder Relativo de Neutralizacao Total) do
 * calcario escolhido.
 *
 * Formula: NC (t/ha, para um calcario hipotetico de 100% PRNT) = CTC x (V2
 * - V1) / 100. Dose corrigida (t/ha) = NC x 100 / PRNT. Onde: CTC =
 * capacidade de troca de cations a pH 7, em cmolc/dm3 (vem do laudo de
 * analise de solo); V1 = saturacao por bases atual, % (vem do laudo); V2 =
 * saturacao por bases desejada, % (definida pela cultura e regiao,
 * tipicamente entre 50% e 70% no Brasil, mas deve vir de recomendacao
 * tecnica para a cultura e o estado, nao de um padrao fixo).
 *
 * Fonte: metodo da saturacao por bases, pratica padrao de recomendacao de
 * calagem no Brasil. Agrolink, "Calagem: criterios para a recomendacao"
 * (https://www.agrolink.com.br/fertilizantes/calagem-e-gessagem/calagem---criterios-para-a-recomendacao_454939.html),
 * com exemplo numerico conferido nesta funcao (CTC 14, V1 24%, V2 70%,
 * PRNT 92% -> NC = 6,44 t/ha -> dose corrigida = 7,0 t/ha).
 *
 * Confianca: MEDIA. A formula do NC em si e padrao e nao controversa
 * (ensinada em qualquer curso de fertilidade do solo no Brasil), mas a
 * calculadora depende de 3 numeros que so existem num laudo de analise de
 * solo (CTC e V1) e de uma meta de saturacao (V2) que idealmente vem de
 * uma tabela oficial por cultura/estado ou de recomendacao de agronomo: a
 * ferramenta nao fornece nenhum desses 3, so faz a conta a partir do que o
 * usuario informar. Dose real de calcario tem consequencia pratica
 * (excesso ou falta prejudicam a lavoura): recomenda-se revisao de um
 * agronomo antes de aplicar em escala, especialmente para validar o V2
 * escolhido.
 */
export function calcularCalagem(input: {
  ctc: number;
  saturacaoAtualPercent: number;
  saturacaoDesejadaPercent: number;
  prntPercent: number;
  areaHectares?: number;
}): CalcResult<{
  necessidadeCalagemTHa: number;
  doseCorrigidaTHa: number;
  toneladasTotais: number | null;
}> {
  const { ctc, saturacaoAtualPercent, saturacaoDesejadaPercent, prntPercent, areaHectares } = input;

  if (!isPositiveNumber(ctc)) {
    return { ok: false, error: "CTC deve ser maior que zero." };
  }
  if (!Number.isFinite(saturacaoAtualPercent) || saturacaoAtualPercent < 0 || saturacaoAtualPercent > 100) {
    return { ok: false, error: "Saturacao por bases atual deve estar entre 0 e 100%." };
  }
  if (
    !Number.isFinite(saturacaoDesejadaPercent) ||
    saturacaoDesejadaPercent < 0 ||
    saturacaoDesejadaPercent > 100
  ) {
    return { ok: false, error: "Saturacao por bases desejada deve estar entre 0 e 100%." };
  }
  if (saturacaoDesejadaPercent <= saturacaoAtualPercent) {
    return {
      ok: false,
      error: "Saturacao desejada deve ser maior que a saturacao atual (senao nao ha necessidade de calagem).",
    };
  }
  if (!isPositiveNumber(prntPercent) || prntPercent > 100) {
    return { ok: false, error: "PRNT do calcario deve estar entre 0 e 100%." };
  }

  const necessidadeCalagemTHa = (ctc * (saturacaoDesejadaPercent - saturacaoAtualPercent)) / 100;
  const doseCorrigidaTHa = (necessidadeCalagemTHa * 100) / prntPercent;

  let toneladasTotais: number | null = null;
  if (areaHectares !== undefined) {
    if (!isPositiveNumber(areaHectares)) {
      return { ok: false, error: "Area deve ser maior que zero." };
    }
    toneladasTotais = round(doseCorrigidaTHa * areaHectares, 2);
  }

  return {
    ok: true,
    data: {
      necessidadeCalagemTHa: round(necessidadeCalagemTHa, 2),
      doseCorrigidaTHa: round(doseCorrigidaTHa, 2),
      toneladasTotais,
    },
  };
}
