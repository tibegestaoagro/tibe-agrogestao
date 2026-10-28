import { hojeEmBrasilia } from "@/lib/emporio/cartao";

/**
 * Meu Empório, F4a: contas de mês e de dia em Brasília.
 *
 * Dois tipos de data convivem no Empório. O INSTANTE (`sold_at`,
 * `returned_at`, `counted_at`) é cortado no fuso de Brasília (UTC-3 fixo: o
 * Brasil não tem horário de verão desde 2019). A DATA de calendário
 * (`due_date`, `starts_on`, `period`) é gravada como a meia-noite UTC do dia.
 * Misturar as duas desloca o mês das vendas da noite de 31.
 */

const TRES_HORAS = 3 * 3_600_000;

export type MesCivil = { ano: number; mes: number };

/** "AAAA-MM" -> mês (1 a 12); `null` se não for um mês válido. */
export function lerMes(texto: unknown): MesCivil | null {
  if (typeof texto !== "string") return null;
  const m = /^(\d{4})-(\d{2})$/.exec(texto.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (ano < 2000 || ano > 2200 || mes < 1 || mes > 12) return null;
  return { ano, mes };
}

export const textoDoMes = (m: MesCivil) => `${m.ano}-${String(m.mes).padStart(2, "0")}`;

/** O mês de hoje em Brasília. */
export function mesAtualEmBrasilia(agora: Date = new Date()): MesCivil {
  const h = hojeEmBrasilia(agora);
  return { ano: h.getUTCFullYear(), mes: h.getUTCMonth() + 1 };
}

/** O mês em que o instante cai, em Brasília. */
export const mesDoInstante = mesAtualEmBrasilia;

export function somarMeses(m: MesCivil, n: number): MesCivil {
  const total = m.ano * 12 + (m.mes - 1) + n;
  return { ano: Math.floor(total / 12), mes: (total % 12) + 1 };
}

export const compararMeses = (a: MesCivil, b: MesCivil) => a.ano * 12 + a.mes - (b.ano * 12 + b.mes);

/** O 1º dia do mês como data de calendário (meia-noite UTC). */
export const primeiroDia = (m: MesCivil) => new Date(Date.UTC(m.ano, m.mes - 1, 1));

export const diasNoMes = (m: MesCivil) => new Date(Date.UTC(m.ano, m.mes, 0)).getUTCDate();

/** O último dia do mês como data de calendário. */
export const ultimoDia = (m: MesCivil) => new Date(Date.UTC(m.ano, m.mes - 1, diasNoMes(m)));

/** O dia `dia` do mês, limitado ao último dia dele. */
export const diaDoMes = (m: MesCivil, dia: number) => new Date(Date.UTC(m.ano, m.mes - 1, Math.min(dia, diasNoMes(m))));

/** O mês de uma data de calendário (meia-noite UTC). */
export const mesDaData = (d: Date): MesCivil => ({ ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1 });

/** Início do mês como INSTANTE: a meia-noite de Brasília. */
export const inicioDoMesInstante = (m: MesCivil) => new Date(Date.UTC(m.ano, m.mes - 1, 1) + TRES_HORAS);

/** O dia (AAAA-MM-DD) em que o instante cai em Brasília. */
export const diaDoInstante = (d: Date) => new Date(d.getTime() - TRES_HORAS).toISOString().slice(0, 10);
