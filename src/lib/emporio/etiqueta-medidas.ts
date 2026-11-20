/**
 * A conta de quanto sobra, na etiqueta, para o código de barras. Pura e sem import de servidor: a
 * etiqueta impressa e os avisos das Configurações e da escolha usam a MESMA conta, para o aviso
 * nunca discordar do desenho. Medidas em mm.
 */

export const ALTURA_MINIMA_DAS_BARRAS_MM = 5;

/** Q361: as medidas de fábrica (modelo de 21 etiquetas na folha; 40 x 25 mm no rolo). Servidor e formulário leem daqui. */
export const PADRAO_ETIQUETA = {
  a4: { columns: 3, rows: 7, width: 63.5, height: 38.1, margin_top: 15.15, margin_left: 7.2, gap_x: 2.5, gap_y: 0 },
  roll: { width: 40, height: 25, columns: 1, gap_x: 2 },
} as const;

const paraTexto = (n: number): string => String(n).replace(".", ",");

/** As medidas como o formulário as mostra: texto com vírgula decimal, no nome de campo da API. */
export function etiquetaEmTexto(p: typeof PADRAO_ETIQUETA) {
  return {
    label_a4_columns: paraTexto(p.a4.columns),
    label_a4_rows: paraTexto(p.a4.rows),
    label_a4_width: paraTexto(p.a4.width),
    label_a4_height: paraTexto(p.a4.height),
    label_a4_margin_top: paraTexto(p.a4.margin_top),
    label_a4_margin_left: paraTexto(p.a4.margin_left),
    label_a4_gap_x: paraTexto(p.a4.gap_x),
    label_a4_gap_y: paraTexto(p.a4.gap_y),
    label_roll_width: paraTexto(p.roll.width),
    label_roll_height: paraTexto(p.roll.height),
    label_roll_columns: paraTexto(p.roll.columns),
    label_roll_gap_x: paraTexto(p.roll.gap_x),
  };
}

const PT_EM_MM = 0.3528;
const FOLGA = 1.2;
const PAD = 1.4;

/** Escala das fontes e do que a etiqueta ocupa (base: 40 x 25 mm). */
export function escalaDaEtiqueta(largura: number, altura: number): number {
  return Math.min(Math.max(Math.min(largura / 40, altura / 25), 0.75), 1.6);
}

export const PADDING_DA_ETIQUETA_MM = PAD;

/** Altura que sobra para as barras depois do padding, dos três textos e da folga. */
export function alturaDasBarras(largura: number, altura: number): number {
  const escala = escalaDaEtiqueta(largura, altura);
  const fNome = 7 * escala;
  const fApres = 6 * escala;
  const fPreco = 10.5 * escala;
  const textos = (2 * 1.15 * fNome + 1.2 * fApres + 1.25 * fPreco) * PT_EM_MM;
  return Math.max(altura - 2 * PAD - textos - FOLGA, 0);
}

export function cabemBarras(largura: number, altura: number): boolean {
  return alturaDasBarras(largura, altura) >= ALTURA_MINIMA_DAS_BARRAS_MM;
}

/** Menor altura (passos de 0,5 mm, de 10 a 100) em que as barras cabem nessa largura; null se nenhuma. */
export function alturaMinimaComBarras(largura: number): number | null {
  for (let a = 10; a <= 100; a += 0.5) {
    if (cabemBarras(largura, a)) return a;
  }
  return null;
}

/** O aviso das Configurações e da escolha das etiquetas (sem o número quando nenhuma altura serve). */
export function textoSemBarras(minima: number | null): string {
  const base = "Nessa altura o código de barras não cabe e a etiqueta sai só com nome, apresentação e preço.";
  if (minima === null) return base;
  return `${base} Para sair com barras, use pelo menos ${String(minima).replace(".", ",")} mm.`;
}
