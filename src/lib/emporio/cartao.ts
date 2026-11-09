import { inicioDoDiaEmSaoPaulo } from "@/lib/dia-calendario";
import { proximoDiaUtil } from "@/lib/emporio/dia-util";

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

/** As bandeiras da venda (Q251). O coringa `qualquer` só existe na tabela de taxas. */
export const BANDEIRAS = ["visa_master", "elo", "hipercard", "amex", "outra"] as const;
export type Bandeira = (typeof BANDEIRAS)[number];

export const ROTULO_DA_BANDEIRA: Record<Bandeira | "qualquer", string> = {
  visa_master: "Visa/Master",
  elo: "Elo",
  hipercard: "Hipercard",
  amex: "Amex",
  outra: "Outra",
  qualquer: "Qualquer bandeira",
};

/** `valid_from` das linhas migradas da regra antiga (decisão 1). */
export const VIGENCIA_DESDE_SEMPRE = "2020-01-01";

export type LinhaDeTaxa = {
  id: string;
  acquirer_id: string;
  brand: Bandeira | "qualquer";
  kind: "debito" | "credito_vista" | "credito_parcelado";
  installments_from: number;
  installments_to: number;
  fee_pct: number;
  fee_fixed: number;
  days: number;
  bank_account_id: string;
  valid_from: string;
  valid_to: string | null;
};

function vigenteEm(l: LinhaDeTaxa, dia: string): boolean {
  return l.valid_from <= dia && (l.valid_to === null || dia <= l.valid_to);
}

/**
 * Decisão 2 e Q252. `dia` é AAAA-MM-DD em Brasília. Primeiro a bandeira (exata
 * vence `qualquer`), depois a faixa (a mais estreita vence). Devolve null sem
 * linha. Não consulta banco: recebe as linhas da loja.
 */
export function resolverTaxa(
  linhas: LinhaDeTaxa[],
  q: { acquirer_id: string; brand: Bandeira; kind: LinhaDeTaxa["kind"]; installments: number; dia: string },
): LinhaDeTaxa | null {
  let melhor: LinhaDeTaxa | null = null;
  let chave: [number, number, string] | null = null;
  for (const l of linhas) {
    if (l.acquirer_id !== q.acquirer_id || l.kind !== q.kind) continue;
    if (l.brand !== q.brand && l.brand !== "qualquer") continue;
    if (q.installments < l.installments_from || q.installments > l.installments_to) continue;
    if (!vigenteEm(l, q.dia)) continue;
    const k: [number, number, string] = [
      l.brand === q.brand ? 0 : 1,
      l.installments_to - l.installments_from,
      l.valid_from,
    ];
    // Menor é melhor nos dois primeiros; empate (não deveria existir, a action recusa sobreposição): a vigência mais recente.
    if (!chave || k[0] < chave[0] || (k[0] === chave[0] && (k[1] < chave[1] || (k[1] === chave[1] && k[2] > chave[2])))) {
      melhor = l;
      chave = k;
    }
  }
  return melhor;
}

/** Os ids das adquirentes com alguma linha vigente em `dia` (para o fallback e para o balcão). */
export function adquirentesComTaxa(linhas: LinhaDeTaxa[], dia: string): string[] {
  return [...new Set(linhas.filter((l) => vigenteEm(l, dia)).map((l) => l.acquirer_id))];
}

/** Q254: `round(valor * pct / 100) + centavos(fee_fixed)`. */
export function taxaDoPagamentoCent(valorCent: number, linha: Pick<LinhaDeTaxa, "fee_pct" | "fee_fixed">): number {
  return Math.round((valorCent * linha.fee_pct) / 100) + Math.round(linha.fee_fixed * 100);
}

export type RegraDiaUtil = "proximo_dia_util" | "dias_corridos";

export const CATEGORIA_ANTECIPACAO = "Antecipação de recebíveis";

/**
 * Datas previstas: a 1ª em `vendidoEm` + `dias`, cada seguinte 30 dias depois da 1ª (corridos,
 * sem encadear). Com `proximo_dia_util`, cada data que cai em fim de semana ou feriado vai
 * para o próximo dia útil; o padrão `dias_corridos` mantém o comportamento antigo.
 */
export function datasDasParcelas(vendidoEm: Date, dias: number, n: number, regra: RegraDiaUtil = "dias_corridos"): Date[] {
  const primeira = somarDias(inicioDoDiaEmSaoPaulo(vendidoEm), dias);
  return Array.from({ length: n }, (_, i) => {
    const dia = somarDias(primeira, 30 * i);
    return regra === "proximo_dia_util" ? proximoDiaUtil(dia) : dia;
  });
}

const DIA_MS = 86_400_000;

/** Custo da antecipação de uma parcela: `líquido * pct%/mês * dias corridos / 30`, em centavos. */
export function custoAntecipacaoCent(liquidoCent: number, pctMes: number, efetivo: Date, previsto: Date): number {
  const dias = Math.max(0, Math.round((previsto.getTime() - efetivo.getTime()) / DIA_MS));
  return Math.round((liquidoCent * pctMes * dias) / 3000);
}

/** Reparte `custoCent` proporcional aos líquidos; o resto de centavos vai para a última. */
export function ratearCustoCent(custoCent: number, liquidosCent: number[]): number[] {
  const total = liquidosCent.reduce((a, b) => a + b, 0);
  if (liquidosCent.length === 0) return [];
  const partes = liquidosCent.map((l) => (total > 0 ? Math.floor((custoCent * l) / total) : 0));
  partes[partes.length - 1] += custoCent - partes.reduce((a, b) => a + b, 0);
  return partes;
}
