/**
 * Utilitarios compartilhados pelas 12 calculadoras da "Calculadora Pecuaria"
 * (Onda 3, agente C2, docs/arquitetura/onda-3-briefings.md). Nenhuma
 * calculadora grava dado nenhum no banco: sao funcoes puras (entrada ->
 * saida), chamadas direto pelos componentes client de
 * `src/app/(dashboard)/calculadoras/**`.
 *
 * Todas as fontes citadas nos comentarios de cada arquivo desta pasta foram
 * pesquisadas na web durante o desenvolvimento (nao vieram de memoria), com
 * preferencia por publicacoes da Embrapa. Onde nao havia uma fonte tecnica
 * unica e confiavel, a calculadora exige que o proprio usuario informe o
 * numero (nunca um valor padrao inventado): ver o comentario de cada funcao
 * para o nivel de confianca declarado.
 */

export type CalcResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Arredonda para N casas decimais sem herdar erro de ponto flutuante visivel. */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function isPositiveNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * De "quantos quilos" para "quantas sacas, e quanto custa".
 *
 * O §41 do documento do cliente pede exatamente isto: dizer "voce precisara de
 * aproximadamente 248 kg" e, logo em seguida, "isso corresponde a 5 sacas de
 * 50 kg". Sementes, sal, racao e adubo terminam todos nesse mesmo par, e a
 * conta mora aqui para nao existir em quatro versoes que divergem no dia em
 * que alguem arredondar diferente.
 *
 * ⚠️ **Saca arredonda para CIMA.** Ninguem compra 4,8 sacas, e faltar adubo no
 * meio da area custa uma segunda viagem a cidade. A sobra sai junto porque e
 * ela que o produtor guarda.
 *
 * ⚠️ **Preco por saca cobra a COMPRA inteira, com a sobra dentro; preco por
 * quilo cobra so o que vai ao solo.** Os dois estao certos, e quem escolhe e
 * quem informou o preco.
 */
export function emSacasECusto(input: {
  quantidadeKg: number;
  pesoSacaKg?: number;
  precoPorKg?: number;
  precoPorSaca?: number;
}): { sacas: number | null; sobraKg: number | null; custoTotal: number | null } {
  const { quantidadeKg, pesoSacaKg, precoPorKg, precoPorSaca } = input;

  const temSaca = pesoSacaKg !== undefined && isPositiveNumber(pesoSacaKg);
  const sacas = temSaca ? Math.ceil(quantidadeKg / pesoSacaKg!) : null;
  const sobraKg = sacas !== null ? round(sacas * pesoSacaKg! - quantidadeKg, 2) : null;

  let custoTotal: number | null = null;
  if (precoPorSaca !== undefined && isPositiveNumber(precoPorSaca) && sacas !== null) {
    custoTotal = round(sacas * precoPorSaca, 2);
  } else if (precoPorKg !== undefined && isPositiveNumber(precoPorKg)) {
    custoTotal = round(quantidadeKg * precoPorKg, 2);
  }

  return { sacas, sobraKg, custoTotal };
}
