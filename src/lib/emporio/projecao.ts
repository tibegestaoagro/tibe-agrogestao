export type Semana = { numero: number; de: string; ate: string };

const DIA_MS = 86_400_000;

// `hoje` chega como o dia de São Paulo em meia-noite UTC (`hojeEmBrasilia()`),
// então o dia é o da parte UTC do instante. Formatar no fuso de São Paulo
// devolveria o dia anterior.
const dia = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * Semanas corridas da janela: a 1 vai de hoje a hoje+6, a seguinte começa no
 * dia depois, e a última termina em hoje+dias-1 (pode ter menos de 7 dias).
 */
export function semanasDaJanela(hoje: Date, dias: 30 | 60 | 90): Semana[] {
  const semanas: Semana[] = [];
  for (let ini = 0, numero = 1; ini < dias; ini += 7, numero += 1) {
    const fim = Math.min(ini + 6, dias - 1);
    semanas.push({
      numero,
      de: dia(new Date(hoje.getTime() + ini * DIA_MS)),
      ate: dia(new Date(hoje.getTime() + fim * DIA_MS)),
    });
  }
  return semanas;
}

export const FAIXAS_DE_IDADE = ["em_dia", "1-15", "16-30", "30+"] as const;
export type FaixaDeIdade = (typeof FAIXAS_DE_IDADE)[number];

export function faixaDeIdade(diasDeAtraso: number): FaixaDeIdade {
  if (diasDeAtraso <= 0) return "em_dia";
  if (diasDeAtraso <= 15) return "1-15";
  if (diasDeAtraso <= 30) return "16-30";
  return "30+";
}
