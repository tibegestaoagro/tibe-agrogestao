/**
 * Balcão rápido (Q358): código de barras da apresentação. Funções puras, sem
 * banco: servem à action (validar e gravar), ao balcão (busca do leitor) e ao
 * desenho das barras da etiqueta.
 */

export const MENSAGEM_TAMANHO_DO_CODIGO = "O código de barras tem 8 ou 13 números.";
export const MENSAGEM_DIGITO_DO_CODIGO = "O código de barras não confere: verifique os números.";

/**
 * Dígito verificador do EAN: do dígito mais à direita do corpo para a esquerda,
 * pesos 3, 1, 3, 1... Vale para o corpo de 7 (EAN-8), 11 (UPC-A) e 12 (EAN-13).
 */
export function digitoVerificadorEan(semDigito: string): number {
  let soma = 0;
  for (let i = 0; i < semDigito.length; i++) {
    const d = semDigito.charCodeAt(semDigito.length - 1 - i) - 48;
    soma += d * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (soma % 10)) % 10;
}

/**
 * Aparado, só dígitos, 8, 12 ou 13 com o verificador conferido. Vazio vira
 * `null` (sem código); o de 12 (UPC-A) ganha o "0" na frente e fica EAN-13.
 */
export function normalizarCodigoDeBarras(
  bruto: string | null | undefined,
): { ok: true; codigo: string | null } | { ok: false; mensagem: string } {
  const texto = String(bruto ?? "").trim();
  if (!texto) return { ok: true, codigo: null };
  if (!/^\d+$/.test(texto) || ![8, 12, 13].includes(texto.length)) {
    return { ok: false, mensagem: MENSAGEM_TAMANHO_DO_CODIGO };
  }
  const codigo = texto.length === 12 ? `0${texto}` : texto;
  const corpo = codigo.slice(0, -1);
  if (digitoVerificadorEan(corpo) !== Number(codigo[codigo.length - 1])) {
    return { ok: false, mensagem: MENSAGEM_DIGITO_DO_CODIGO };
  }
  return { ok: true, codigo };
}

const TABELA_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const TABELA_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const TABELA_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
/** Paridade dos 6 dígitos da esquerda do EAN-13, pelo primeiro dígito. */
const PARIDADE = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/**
 * Os módulos do EAN-13 (95) ou do EAN-8 (67), guardas incluídas: "1" é barra,
 * "0" é espaço. Devolve "" para código que não tem 8 ou 13 dígitos.
 */
export function modulosEan(codigo: string): string {
  if (!/^\d+$/.test(codigo)) return "";
  const d = [...codigo].map(Number);
  if (codigo.length === 13) {
    const paridade = PARIDADE[d[0]];
    let esquerda = "";
    for (let i = 0; i < 6; i++) esquerda += (paridade[i] === "L" ? TABELA_L : TABELA_G)[d[i + 1]];
    const direita = d.slice(7).map((n) => TABELA_R[n]).join("");
    return `101${esquerda}01010${direita}101`;
  }
  if (codigo.length === 8) {
    const esquerda = d.slice(0, 4).map((n) => TABELA_L[n]).join("");
    const direita = d.slice(4).map((n) => TABELA_R[n]).join("");
    return `101${esquerda}01010${direita}101`;
  }
  return "";
}

/**
 * O que o leitor digitou na busca do balcão: só dígitos, 8 a 14; o de 12 vira
 * 13 com o "0". Qualquer outra coisa não é leitura de código (`null`).
 */
export function codigoParaBusca(texto: string): string | null {
  const t = String(texto ?? "").trim();
  if (!/^\d{8,14}$/.test(t)) return null;
  return t.length === 12 ? `0${t}` : t;
}
