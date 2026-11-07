/**
 * Telefone do Empório: regra pura, sem servidor, usada pela busca e pela tela.
 * O telefone é gravado como o cliente digitou (com máscara, com +55, com zero de
 * operadora), então a busca e a exibição comparam o "número local" e nunca o texto.
 */

/**
 * Só os dígitos, sem zeros à esquerda; com 12 ou 13 e começando em 55, sem o DDI;
 * com 10 ou 11, sem o DDD. Outro tamanho fica com todos os dígitos, para a busca por
 * pedaço não perder ninguém. Nulo quando não sobra dígito.
 */
export function telefoneLocal(texto: string | null | undefined): string | null {
  if (!texto) return null;
  let d = texto.replace(/\D/g, "").replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = d.slice(2);
  return d === "" ? null : d;
}

/** Telefone para exibir: "(34) 99876-1234", "(34) 3333-5678", "99876-1234", "3333-5678". */
export function formatarTelefone(texto: string | null | undefined): string {
  if (!texto) return "sem telefone";
  let d = texto.replace(/\D/g, "").replace(/^0+/, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return texto;
}
