/**
 * Helpers de serialização para respostas de API. Prisma retorna Decimal (objeto)
 * e Date; os contratos do PRD usam number e ISO8601 string.
 */

/** Converte Decimal (ou number/string) para number, preservando null/undefined. */
export function decToNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (value as { toNumber: unknown }).toNumber === "function"
  ) {
    return (value as { toNumber(): number }).toNumber();
  }
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** Converte Date|null em string ISO8601 ou null. */
export function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}
