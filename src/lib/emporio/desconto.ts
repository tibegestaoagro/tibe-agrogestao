/**
 * Meu Empório: desconto no preço e no total do pedido. Módulo PURO, em centavos inteiros: a tela
 * do balcão importa daqui, então não pode arrastar Prisma nem nada de servidor.
 */

/** Preço unitário com o desconto percentual (0 a 100) aplicado, em centavos. */
export function precoComDesconto(precoCent: number, pct: number): number {
  return Math.round(precoCent * (1 - pct / 100));
}

/**
 * Reparte `descontoCent` nas linhas, proporcional ao valor de cada uma (arredondado para baixo).
 * Linha de valor zero recebe 0. A sobra de centavos vai para a MAIOR linha, para a soma fechar
 * exata e nenhuma linha ficar negativa. Lança se o desconto passar da soma das linhas.
 */
export function ratearDescontoNosItens(totaisCent: number[], descontoCent: number): number[] {
  if (descontoCent <= 0) return totaisCent.map(() => 0);
  const soma = totaisCent.reduce((s, t) => s + t, 0);
  if (descontoCent > soma) throw new Error("O desconto não pode passar do valor dos itens.");
  const partes = totaisCent.map((t) => (t > 0 ? Math.floor((descontoCent * t) / soma) : 0));
  const sobra = descontoCent - partes.reduce((s, p) => s + p, 0);
  let maior = 0;
  for (let i = 1; i < totaisCent.length; i++) if (totaisCent[i] > totaisCent[maior]) maior = i;
  partes[maior] += sobra;
  return partes;
}

/** Percentual que o desconto representa sobre a base, com 2 casas. Base zero devolve 0. */
export function pctDoDesconto(descontoCent: number, baseCent: number): number {
  if (!(baseCent > 0)) return 0;
  return Math.round((descontoCent / baseCent) * 10000) / 100;
}
