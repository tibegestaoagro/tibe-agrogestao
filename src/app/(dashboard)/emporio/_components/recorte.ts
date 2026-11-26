/** Os `?ver=` do A receber e do A pagar que recortam por data (o Recebido e o Pago trocam a tela por uma lista). */
export type VerReceber = "vencido" | "hoje" | "a_vencer" | "recebido";
export type VerPagar = "vencida" | "hoje" | "a_vencer" | "pago";

const VER_RECEBER: readonly string[] = ["vencido", "hoje", "a_vencer", "recebido"];
const VER_PAGAR: readonly string[] = ["vencida", "hoje", "a_vencer", "pago"];

export const verDoReceber = (v: string | undefined): VerReceber | null =>
  v && VER_RECEBER.includes(v) ? (v as VerReceber) : null;
export const verDoPagar = (v: string | undefined): VerPagar | null => (v && VER_PAGAR.includes(v) ? (v as VerPagar) : null);

/** O valor do fiado de um cliente naquele recorte (sem recorte, tudo o que deve). Serve ao servidor e ao cliente. */
export function valorDoFiadoNoRecorte(
  c: { owed: number; overdue_amount: number; due_today_amount: number; upcoming_amount: number },
  ver: "vencido" | "hoje" | "a_vencer" | null,
): number {
  return ver === "vencido" ? c.overdue_amount : ver === "hoje" ? c.due_today_amount : ver === "a_vencer" ? c.upcoming_amount : c.owed;
}

/** Uma data de calendário (AAAA-MM-DD, ou ISO completo) cai no recorte `antes | hoje | depois`? Sem data conta como "depois". */
export function noRecorte(ver: "vencido" | "vencida" | "hoje" | "a_vencer", hoje: string, data: string | null): boolean {
  if (data === null) return ver === "a_vencer";
  const d = data.slice(0, 10);
  if (ver === "vencido" || ver === "vencida") return d < hoje;
  if (ver === "hoje") return d === hoje;
  return d > hoje;
}
