import type { LactationEntryType, MilkShift } from "@/generated/prisma/client";

/**
 * Rótulos em português dos enums da Área Leite.
 *
 * `Record<Enum, string>` e NÃO `Record<string, string>`: quando o enum cresce,
 * o `Record<string, ...>` continua compilando e a tela passa a mostrar o nome
 * cru do valor novo. Foi a causa comum de três dos quatro defeitos de tela do
 * Confinamento, em 31/08. Ver
 * docs/conhecimento/record-string-e-onde-o-enum-cresce-sem-avisar.md.
 */

export const TIPO_LACTACAO_LABEL: Record<LactationEntryType, string> = {
  definir: "Contagem informada",
  entrada: "Entraram na lactação",
  saida: "Saíram da lactação",
};

/** O verbo que descreve o registro numa frase, para o histórico. */
export const TIPO_LACTACAO_SINAL: Record<LactationEntryType, string> = {
  definir: "=",
  entrada: "+",
  saida: "-",
};

export const TURNO_LABEL: Record<MilkShift, string> = {
  dia: "Dia inteiro",
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

/** Litros como o brasileiro lê, com no máximo duas casas e sem casa à toa. */
export function litros(valor: number): string {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} L`;
}
