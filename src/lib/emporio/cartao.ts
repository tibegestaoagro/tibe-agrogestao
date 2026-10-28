import { inicioDoDiaEmSaoPaulo } from "@/lib/dia-calendario";

/**
 * Meu Empório, F3b (Q89, Q90): contas de data e de parcela do cartão.
 *
 * `CardReceivable.expected_on` é coluna `@db.Date`: o Prisma a lê e a grava
 * como a meia-noite UTC do dia. Por isso "hoje" tem que ser a meia-noite UTC do
 * dia de calendário em Brasília, nos dois lados da comparação. Comparar com
 * `new Date()` faria a parcela de hoje parecer futura (ou cair um dia antes à
 * noite, na Vercel em UTC).
 */

export const CATEGORIA_TAXAS_CARTAO = "Taxas de cartão";
export const CATEGORIA_DIFERENCA_CAIXA = "Diferença de caixa";

/** A meia-noite UTC do dia de hoje em Brasília: o valor que `expected_on` tem para "hoje". */
export function hojeEmBrasilia(agora: Date = new Date()): Date {
  return inicioDoDiaEmSaoPaulo(agora);
}

export function somarDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * 86_400_000);
}

/** Parte `totalCent` em `n` partes iguais; o que sobra em centavos fica na primeira. */
export function dividirEmParcelas(totalCent: number, n: number): number[] {
  const base = Math.floor(totalCent / n);
  const sobra = totalCent - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + sobra : base));
}

/** Datas previstas: a 1ª em `vendidoEm` + `dias`, cada seguinte 30 dias depois da anterior. */
export function datasDasParcelas(vendidoEm: Date, dias: number, n: number): Date[] {
  const primeira = somarDias(inicioDoDiaEmSaoPaulo(vendidoEm), dias);
  return Array.from({ length: n }, (_, i) => somarDias(primeira, 30 * i));
}
