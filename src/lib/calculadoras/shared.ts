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
