import { ehDataCalendario, inicioDoDiaEmSaoPaulo } from "@/lib/dia-calendario";

/**
 * A data da baixa (Q370, Q371): o dia em que o dinheiro caiu na conta, para o extrato do
 * Tibé bater com o do banco. Vai de hoje menos 31 a hoje mais 31 dias (dias de calendário
 * em Brasília). Funções puras: quem decide QUEM pode mudar a data é a action.
 */

export const JANELA_DA_BAIXA_DIAS = 31;

const DIA_MS = 86_400_000;
const MEIA_NOITE_SP_EM_UTC_MS = 3 * 3_600_000;
const MEIO_DIA_SP_EM_UTC_MS = 15 * 3_600_000;

const br = (d: Date) => `${d.toISOString().slice(8, 10)}/${d.toISOString().slice(5, 7)}/${d.getUTCFullYear()}`;

/**
 * Lê a data da baixa. `hoje` é o dia de Brasília como meia-noite UTC (`hojeEmBrasilia()`).
 * Nulo ou ausente é hoje; aceita `AAAA-MM-DD` ou `Date` (dia de calendário em UTC).
 */
export function lerDataDaBaixa(
  valor: unknown,
  hoje: Date,
): { ok: true; dia: Date } | { ok: false; mensagem: string } {
  const menor = new Date(hoje.getTime() - JANELA_DA_BAIXA_DIAS * DIA_MS);
  const maior = new Date(hoje.getTime() + JANELA_DA_BAIXA_DIAS * DIA_MS);
  if (valor === null || valor === undefined) return { ok: true, dia: hoje };
  let dia: Date | null = null;
  if (typeof valor === "string") {
    if (ehDataCalendario(valor.trim())) dia = new Date(`${valor.trim()}T00:00:00.000Z`);
  } else if (valor instanceof Date && Number.isFinite(valor.getTime())) {
    dia = new Date(Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()));
  }
  if (!dia) return { ok: false, mensagem: "Informe uma data válida." };
  if (dia.getTime() < menor.getTime() || dia.getTime() > maior.getTime()) {
    return { ok: false, mensagem: `A data precisa estar entre ${br(menor)} e ${br(maior)}.` };
  }
  return { ok: true, dia };
}

/**
 * O instante que se grava: agora quando o dia é hoje; senão o meio-dia de Brasília do dia
 * (o padrão de `pagarBoletoAction`), longe da virada para o fuso não mudar o dia.
 */
export function instanteDaBaixa(dia: Date, hoje: Date, agora: Date): Date {
  if (dia.getTime() === hoje.getTime()) return agora;
  return new Date(dia.getTime() + MEIO_DIA_SP_EM_UTC_MS);
}

/** O início de amanhã em Brasília: o limite exclusivo do saldo (movimento com data até hoje). */
export function fimDeHojeEmBrasilia(agora: Date = new Date()): Date {
  return new Date(inicioDoDiaEmSaoPaulo(agora).getTime() + DIA_MS + MEIA_NOITE_SP_EM_UTC_MS);
}
