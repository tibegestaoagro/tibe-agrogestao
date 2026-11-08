/**
 * Regras puras do acordo de fiado do Empório (entrega 3 do financeiro): divisão em
 * parcelas e validação. Sem servidor e sem banco. Datas em meia-noite UTC.
 */
import { diaUtc, somarDias } from "@/lib/emporio/fiado";

export const CATEGORIA_ACORDO = "Acordo de fiado";

export type ParcelaDoAcordo = { due_date: Date; amount_cent: number };

/** Parcelas iguais; o resto dos centavos vai na primeira. A data de cada uma soma `aCadaDias` à anterior. */
export function dividirEmParcelas(
  totalCent: number,
  quantidade: number,
  primeira: Date,
  aCadaDias: number,
): ParcelaDoAcordo[] {
  const base = Math.floor(totalCent / quantidade);
  const resto = totalCent - base * quantidade;
  return Array.from({ length: quantidade }, (_, i) => ({
    due_date: somarDias(primeira, i * aCadaDias),
    amount_cent: i === 0 ? base + resto : base,
  }));
}

export function validarParcelas(
  parcelas: ParcelaDoAcordo[],
  totalCent: number,
  hoje: Date,
): { ok: true } | { ok: false; field: "installments"; message: string } {
  const recusa = (message: string) => ({ ok: false as const, field: "installments" as const, message });
  if (parcelas.length < 1 || parcelas.length > 48) return recusa("O acordo tem de 1 a 48 parcelas.");
  if (parcelas.some((p) => !Number.isInteger(p.amount_cent) || p.amount_cent <= 0)) {
    return recusa("Toda parcela precisa ter valor maior que zero.");
  }
  const limite = diaUtc(hoje);
  let anterior = -Infinity;
  for (const p of parcelas) {
    const dia = diaUtc(p.due_date);
    if (dia < limite) return recusa("Nenhuma parcela pode vencer antes de hoje.");
    if (dia <= anterior) return recusa("As datas das parcelas precisam ser crescentes.");
    anterior = dia;
  }
  if (parcelas.reduce((s, p) => s + p.amount_cent, 0) !== totalCent) {
    return recusa("A soma das parcelas precisa ser igual ao total do acordo.");
  }
  return { ok: true };
}
