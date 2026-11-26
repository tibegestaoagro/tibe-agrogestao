/** O endereço de uma tela do Dinheiro, levando a loja escolhida junto. */
export const enderecoDaAba = (href: string, loja: string) =>
  loja ? `${href}?loja=${encodeURIComponent(loja)}` : href;
