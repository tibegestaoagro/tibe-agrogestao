import { type CalcResult, isPositiveNumber, round } from "./shared";

/**
 * Sementes para formacao ou reforma de pastagem (§8 do documento do cliente).
 *
 * ⚠️ Esta ferramenta NAO existia, apesar de o §51 cobrar "calcular sementes" e
 * de o §52 lista-la. A calculadora de "pastagem" que ja estava no ar responde
 * outra pergunta: quantos animais a forragem sustenta. Sao duas contas
 * diferentes com a mesma palavra em cima.
 *
 * ⚠️ **Arredondar saca para CIMA nao e detalhe.** O §41 manda dizer "isso
 * corresponde a 5 sacas de 50 kg", e ninguem compra 4,8 sacas. A sobra sai
 * junto, porque e ela que o produtor guarda para replantio.
 *
 * Confianca: ALTA na conta (area vezes taxa). A TAXA e do produtor: ela muda
 * com a especie, o valor cultural da semente, o metodo de plantio e a
 * qualidade do lote, e o §46 e explicito que "quanto devo usar" depende de
 * recomendacao tecnica, nao de formula generica. As faixas abaixo sao
 * sugestao de partida, e a tela as apresenta como referencia.
 */

/**
 * Faixas de uso corrente para as forrageiras mais plantadas no Brasil, em kg
 * de semente por hectare.
 *
 * ⚠️ Sao valores de SEMENTE COMERCIAL, e variam com o valor cultural (VC) do
 * lote: a mesma cultivar pode pedir o dobro de semente se o VC for metade. Por
 * isso a taxa continua sendo campo obrigatorio, e estes numeros so preenchem o
 * campo como ponto de partida.
 *
 * Fonte: faixas de recomendacao correntes na literatura tecnica brasileira de
 * forragicultura para semeadura a lanco. A equipe TIBE valida e atualiza por
 * deploy, como as outras referencias (decisao 17).
 */
export const TAXAS_SUGERIDAS: { variedade: string; kgPorHectare: number }[] = [
  { variedade: "Mombaca", kgPorHectare: 12 },
  { variedade: "Tanzania", kgPorHectare: 12 },
  { variedade: "Marandu (braquiarao)", kgPorHectare: 10 },
  { variedade: "Brachiaria decumbens", kgPorHectare: 10 },
  { variedade: "Piata", kgPorHectare: 10 },
  { variedade: "Xaraes", kgPorHectare: 10 },
  { variedade: "Massai", kgPorHectare: 8 },
  { variedade: "Humidicola", kgPorHectare: 8 },
];

export function calcularSementes(input: {
  areaHectares: number;
  taxaKgPorHectare: number;
  /** §8: o peso da embalagem e o que transforma kg em saca. */
  pesoEmbalagemKg?: number;
  precoPorKg?: number;
  precoPorSaca?: number;
}): CalcResult<{
  totalKg: number;
  sacas: number | null;
  sobraKg: number | null;
  custoTotal: number | null;
}> {
  const { areaHectares, taxaKgPorHectare, pesoEmbalagemKg, precoPorKg, precoPorSaca } = input;

  if (!isPositiveNumber(areaHectares)) {
    return { ok: false, error: "Area deve ser maior que zero." };
  }
  if (!isPositiveNumber(taxaKgPorHectare)) {
    return { ok: false, error: "Informe quantos quilos de semente por hectare." };
  }
  if (pesoEmbalagemKg !== undefined && !isPositiveNumber(pesoEmbalagemKg)) {
    return { ok: false, error: "Peso da embalagem deve ser maior que zero." };
  }

  const totalKg = round(areaHectares * taxaKgPorHectare, 2);

  let sacas: number | null = null;
  let sobraKg: number | null = null;
  if (pesoEmbalagemKg !== undefined) {
    sacas = Math.ceil(totalKg / pesoEmbalagemKg);
    sobraKg = round(sacas * pesoEmbalagemKg - totalKg, 2);
  }

  /*
   * O preco por saca so vale quando se sabe quantas sacas serao COMPRADAS, e
   * ai o custo e o da compra inteira, com a sobra dentro. O preco por quilo
   * cobra exatamente o que vai ao solo. Os dois estao certos; o produtor
   * escolhe qual informa.
   */
  let custoTotal: number | null = null;
  if (precoPorSaca !== undefined && sacas !== null && isPositiveNumber(precoPorSaca)) {
    custoTotal = round(sacas * precoPorSaca, 2);
  } else if (precoPorKg !== undefined && isPositiveNumber(precoPorKg)) {
    custoTotal = round(totalKg * precoPorKg, 2);
  }

  return { ok: true, data: { totalKg, sacas, sobraKg, custoTotal } };
}
