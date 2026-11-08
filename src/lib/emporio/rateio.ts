export const CRITERIOS_AUTOMATICOS = ["faturamento", "area", "funcionarios"] as const;
export type CriterioAutomatico = (typeof CRITERIOS_AUTOMATICOS)[number];
export type SplitKind = "percentual" | "valor" | CriterioAutomatico;

export const ehCriterioAutomatico = (k: string): k is CriterioAutomatico =>
  (CRITERIOS_AUTOMATICOS as readonly string[]).includes(k);

/** Rótulo do Histórico e das mensagens; a tela reexporta este em `venda-rotulos.ts`. */
export const RATEIO_ROTULO_SERVIDOR: Record<SplitKind, string> = {
  percentual: "Em percentual",
  valor: "Em reais",
  faturamento: "Proporcional ao faturamento",
  area: "Por área (m²)",
  funcionarios: "Por funcionários",
};

/**
 * Parte `totalCent` pelos pesos. Cada parte é o piso da proporção; o resto dos
 * centavos fica na primeira loja de peso maior que zero. Soma de pesos zero:
 * partes iguais (resto na primeira) e `iguais: true`. Peso negativo (loja que
 * devolveu mais do que vendeu no mês) vale zero.
 */
export function ratearPorPeso(totalCent: number, pesosBrutos: number[]): { partes: number[]; iguais: boolean } {
  const pesos = pesosBrutos.map((p) => (p > 0 ? p : 0));
  const n = pesos.length;
  if (n === 0) return { partes: [], iguais: false };
  const soma = pesos.reduce((s, p) => s + p, 0);
  if (totalCent <= 0) return { partes: pesos.map(() => 0), iguais: soma <= 0 };
  if (soma <= 0) {
    const base = Math.floor(totalCent / n);
    const partes = pesos.map(() => base);
    partes[0] += totalCent - base * n;
    return { partes, iguais: true };
  }
  const partes = pesos.map((p) => (p > 0 ? Math.floor((totalCent * p) / soma) : 0));
  const resto = totalCent - partes.reduce((s, p) => s + p, 0);
  const primeira = pesos.findIndex((p) => p > 0);
  partes[primeira] += resto;
  return { partes, iguais: false };
}
