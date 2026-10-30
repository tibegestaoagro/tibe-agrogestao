import { lerNumeroBr } from "@/lib/numero-br";

/** Rótulos do Meu Empório que mais de uma tela usa. Sem estado, vale em server e client. */

export const UNIDADE_BASE_ROTULO: Record<string, string> = {
  quilograma: "Quilo",
  litro: "Litro",
  unidade: "Unidade",
  saca: "Saca",
  fardo: "Fardo",
};

/**
 * Sufixo curto da unidade-base ("kg", "L", "un", "sc", "fd"), para o "vale X
 * kg". Abreviação, como as de `STOCK_UNITS`, porque aparece ao lado de
 * qualquer número: "sacas" saía "1 sacas" no estoque com uma saca só.
 */
export const UNIDADE_BASE_SUFIXO: Record<string, string> = {
  quilograma: "kg",
  litro: "L",
  unidade: "un",
  saca: "sc",
  fardo: "fd",
};

/** "Custo por quilo", "Custo por litro", "Custo por saca". */
export function rotuloCustoBase(baseUnit: string): string {
  return `Custo por ${(UNIDADE_BASE_ROTULO[baseUnit] ?? baseUnit).toLowerCase()}`;
}

/** A unidade do conteúdo, como a API a chama, e o que a tela escreve. */
export const CONTEUDO_UNIDADE_SUFIXO: Record<string, string> = {
  quilograma: "kg",
  litro: "L",
  unidade: "un",
};

/** As unidades que o conteúdo aceita em cada unidade-base (Q123). Quilo e litro não têm conteúdo. */
export const CONTEUDO_UNIDADES_POR_BASE: Record<string, { valor: string; rotulo: string }[]> = {
  saca: [
    { valor: "quilograma", rotulo: "kg" },
    { valor: "litro", rotulo: "L" },
  ],
  fardo: [
    { valor: "quilograma", rotulo: "kg" },
    { valor: "litro", rotulo: "L" },
    { valor: "unidade", rotulo: "unidades" },
  ],
  unidade: [
    { valor: "quilograma", rotulo: "kg" },
    { valor: "litro", rotulo: "L" },
  ],
};

/** "10 kg", "12 un". */
export function textoConteudo(qty: number, unit: string): string {
  return `${numeroBr(qty)} ${CONTEUDO_UNIDADE_SUFIXO[unit] ?? unit}`;
}

/** "Saca de 10 kg"; só o nome da unidade quando o produto não tem conteúdo. */
export function nomeComConteudo(baseUnit: string, qty: number | null, unit: string | null): string {
  const base = UNIDADE_BASE_ROTULO[baseUnit] ?? baseUnit;
  return qty == null || !unit ? base : `${base} de ${textoConteudo(qty, unit)}`;
}

/** "0,1 saca", "1,5 sacas": a conversão que a apresentação por conteúdo mostra. */
export function textoEmUnidadeBase(qty: number, baseUnit: string): string {
  if (baseUnit === "saca" || baseUnit === "fardo") {
    return `${numeroBr(qty)} ${qty > 1 ? UNIDADE_BASE_SUFIXO[baseUnit] : baseUnit}`;
  }
  return `${numeroBr(qty)} ${UNIDADE_BASE_SUFIXO[baseUnit] ?? baseUnit}`;
}

const NUMERO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

/** Número em pt-BR, até 4 casas ("1,5", "1.500"). */
export function numeroBr(n: number): string {
  return NUMERO.format(n);
}

/** "3 × Saca 10 kg" por apresentação fechada; vazio quando não há lacrado. */
export function textoLacrado(sealed: { name: string; packages: number }[]): string {
  const com = sealed.filter((s) => s.packages !== 0);
  if (com.length === 0) return "-";
  return com.map((s) => `${numeroBr(s.packages)} × ${s.name}`).join(", ");
}

export const MOTIVO_PERDA_ROTULO: Record<string, string> = {
  vencido: "Vencido",
  avaria: "Avaria",
  furto: "Furto",
  consumo_proprio: "Consumo próprio",
  outro: "Outro",
};

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
