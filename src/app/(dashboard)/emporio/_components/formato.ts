import { lerNumeroBr } from "@/lib/numero-br";

/** Rótulos do Meu Empório que mais de uma tela usa. Sem estado, vale em server e client. */

export const UNIDADE_BASE_ROTULO: Record<string, string> = {
  quilograma: "Quilo",
  litro: "Litro",
  unidade: "Unidade",
};

/** Sufixo curto da unidade-base ("kg", "L", "un"), para o "vale X kg". */
export const UNIDADE_BASE_SUFIXO: Record<string, string> = {
  quilograma: "kg",
  litro: "L",
  unidade: "un",
};

/** "Custo por quilo", "Custo por litro", "Custo por unidade". */
export function rotuloCustoBase(baseUnit: string): string {
  return `Custo por ${(UNIDADE_BASE_ROTULO[baseUnit] ?? baseUnit).toLowerCase()}`;
}

export const TIPO_LOJA_ROTULO: Record<string, string> = {
  central: "Central",
  ponto_venda: "Ponto de venda",
};

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

/** Número em pt-BR, até 4 casas ("1,5", "1.500"). */
export function numeroBr(n: number): string {
  return NUMERO.format(n);
}

/** Percentual com vírgula ("12,5%"). */
export function pctBr(n: number): string {
  return `${NUMERO.format(n)}%`;
}

/** Número vindo do servidor para o texto de um campo (vírgula, sem milhar). */
export function paraCampo(n: number | null | undefined): string {
  if (n == null) return "";
  return String(n).replace(".", ",");
}

/**
 * Lê um campo numérico opcional: vazio vira `null`, ilegível vira "invalido".
 * Distinguir os dois evita gravar "apagar" quando a pessoa só digitou errado.
 */
export function lerOpcional(bruto: string): number | null | "invalido" {
  if (bruto.trim() === "") return null;
  const n = lerNumeroBr(bruto);
  return n === null ? "invalido" : n;
}
