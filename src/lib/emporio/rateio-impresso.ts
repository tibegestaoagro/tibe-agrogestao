/**
 * Q308: o crédito do franqueado é interno e nunca sai no papel do cliente. Para o impresso somar o
 * que o cliente paga, o crédito é rateado nos itens pelo valor. Função pura, em centavos inteiros.
 */

/**
 * Reparte `creditoCent` nos totais de linha, proporcional ao valor de cada uma (arredondado para
 * baixo); o que sobrar de centavo vai para a ÚLTIMA linha com valor, para a soma fechar exata
 * (60 e 40 com crédito 10 saem 66 e 44). Sem linhas ou sem crédito devolve os totais como vieram.
 * Se todas as linhas valerem zero, o crédito inteiro cai na última.
 */
export function ratearCreditoNosItens(totaisCent: number[], creditoCent: number): number[] {
  if (totaisCent.length === 0 || creditoCent <= 0) return [...totaisCent];
  const soma = totaisCent.reduce((s, t) => s + t, 0);
  const partes = totaisCent.map((t) => (soma > 0 ? Math.floor((creditoCent * t) / soma) : 0));
  const sobra = creditoCent - partes.reduce((s, p) => s + p, 0);
  // A sobra vai para a última linha que vale algo: brinde (zero) não ganha centavo.
  let alvo = totaisCent.length - 1;
  while (alvo > 0 && totaisCent[alvo] <= 0) alvo--;
  if (totaisCent[alvo] <= 0) alvo = totaisCent.length - 1;
  partes[alvo] += sobra;
  return totaisCent.map((t, i) => t + partes[i]);
}

/** Preço unitário de exibição a partir do total da linha rateado: arredondado, só para mostrar. */
export function precoUnitarioDoRateio(totalCent: number, quantidade: number): number {
  if (!(quantidade > 0)) return totalCent / 100;
  return Math.round(totalCent / quantidade) / 100;
}
