/**
 * Cheque "A completar" (frente C, Q354 e Q356): é calculado, nunca gravado.
 * Só existe em `recebido`: depositado em diante já passou pela trava de
 * `depositarChequeAction`, então um campo nulo ali não é pendência.
 */
export function chequeIncompleto(c: {
  status: string;
  number: string | null;
  bank: string | null;
  good_for: Date | string | null;
}): boolean {
  if (c.status !== "recebido") return false;
  return c.number === null || c.bank === null || c.good_for === null;
}
