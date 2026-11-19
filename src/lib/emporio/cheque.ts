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

/**
 * Ordem da carteira (Q369): 1 = recebido sem bom para; 2 = recebido com bom
 * para, mas sem número ou banco; 3 = o resto (completos e qualquer outra situação).
 */
export function grupoNaCarteira(c: {
  status: string;
  number: string | null;
  bank: string | null;
  good_for: Date | string | null;
}): 1 | 2 | 3 {
  if (c.status !== "recebido") return 3;
  if (c.good_for === null) return 1;
  return c.number === null || c.bank === null ? 2 : 3;
}

/** Grupos 1 e 2 por lançamento; grupo 3 por bom para e depois lançamento. Devolve cópia. */
export function ordenarCarteira<
  T extends { id?: string; status: string; number: string | null; bank: string | null; good_for: Date | null; created_at: Date },
>(cheques: T[]): T[] {
  const porId = (a: T, b: T) => (a.id ?? "").localeCompare(b.id ?? "");
  return [...cheques].sort((a, b) => {
    const ga = grupoNaCarteira(a);
    const gb = grupoNaCarteira(b);
    if (ga !== gb) return ga - gb;
    if (ga === 3 && a.good_for?.getTime() !== b.good_for?.getTime()) {
      if (a.good_for === null) return 1;
      if (b.good_for === null) return -1;
      return a.good_for.getTime() - b.good_for.getTime();
    }
    return a.created_at.getTime() - b.created_at.getTime() || porId(a, b);
  });
}
