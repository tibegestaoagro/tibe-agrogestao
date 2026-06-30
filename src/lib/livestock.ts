import { decToNum } from "@/lib/serialize";

/**
 * Cálculo do Ganho de Peso Médio Diário (GMD) entre as duas pesagens mais recentes.
 * Recebe logs com `weight` (Decimal|number) e `measured_at` (Date), em qualquer ordem.
 * Retorna kg/dia, ou null se houver menos de 2 pesagens ou intervalo inválido.
 */
export function computeGmd(
  logs: { weight: unknown; measured_at: Date }[],
): number | null {
  if (logs.length < 2) return null;
  const sorted = [...logs].sort(
    (a, b) => a.measured_at.getTime() - b.measured_at.getTime(),
  );
  const last = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  const days =
    (last.measured_at.getTime() - prev.measured_at.getTime()) / 86_400_000;
  if (days <= 0) return null;
  const wLast = decToNum(last.weight);
  const wPrev = decToNum(prev.weight);
  if (wLast == null || wPrev == null) return null;
  return Number(((wLast - wPrev) / days).toFixed(3));
}
