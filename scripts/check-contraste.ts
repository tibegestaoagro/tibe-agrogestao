import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Confere o contraste da paleta contra a WCAG 2.1 AA. Roda dentro de
 * `npm run check`.
 *
 * Existe por causa de um achado de 2026-08-20: o verde primario da marca dava
 * 3,51:1 com texto branco, e o laranja 2,84:1. Ou seja, o botao primario de
 * TODO o produto reprovava em AA, num sistema usado no sol, e nenhuma revisao
 * humana em 51 dias tinha percebido. Contraste nao se avalia no olho: e conta.
 *
 * Le os valores de `src/app/globals.css`, nao uma copia. Se a paleta em
 * producao mudar, esta conferencia muda junto, e nao existe jeito de as duas
 * divergirem.
 *
 * Minimos (WCAG 2.1): 4,5:1 para texto normal (1.4.3), 3:1 para texto grande e
 * para contorno de componente (1.4.11).
 */

type RGB = [number, number, number];

function canal(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminancia([r, g, b]: RGB): number {
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function razao(a: RGB, b: RGB): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function lerHex(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const largo = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(largo.slice(0, 2), 16),
    parseInt(largo.slice(2, 4), 16),
    parseInt(largo.slice(4, 6), 16),
  ];
}

/** Extrai os tokens de cor do bloco `:root` de globals.css. */
function lerTokens(): Map<string, RGB> {
  const css = readFileSync(join(__dirname, "..", "src", "app", "globals.css"), "utf8");
  const inicio = css.indexOf(":root");
  const fim = css.indexOf("}", inicio);
  if (inicio < 0 || fim < 0) throw new Error("globals.css sem bloco :root");
  const bloco = css.slice(inicio, fim);

  const tokens = new Map<string, RGB>();
  for (const linha of bloco.split(String.fromCharCode(10))) {
    const m = linha.match(/^\s*--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/);
    if (m) tokens.set(m[1], lerHex(m[2]));
  }
  return tokens;
}

/** [rotulo, token do texto, token do fundo, minimo]. */
const PARES: Array<[string, string, string, number]> = [
  ["corpo sobre pagina", "texto", "superficie-afundada", 4.5],
  ["corpo sobre cartao", "texto", "superficie", 4.5],
  ["secundario sobre cartao", "texto-secundario", "superficie", 4.5],
  ["discreto sobre cartao", "texto-discreto", "superficie", 4.5],
  ["discreto sobre pagina", "texto-discreto", "superficie-afundada", 4.5],
  ["texto claro sobre fundo escuro", "texto-invertido", "superficie-invertida", 4.5],
  ["botao primario", "sobre-primaria", "primaria", 4.5],
  ["botao primario, hover", "sobre-primaria", "primaria-hover", 4.5],
  ["verde como texto, sobre cartao", "primaria-tinta", "superficie", 4.5],
  ["verde como texto, sobre pagina", "primaria-tinta", "superficie-afundada", 4.5],
  ["texto sobre verde suave", "primaria-tinta", "primaria-suave", 4.5],
  ["botao de acento", "sobre-acento", "acento", 4.5],
  ["botao de acento, hover", "sobre-acento", "acento-hover", 4.5],
  ["laranja como texto, sobre cartao", "acento-tinta", "superficie", 4.5],
  ["texto sobre laranja suave", "acento-tinta", "acento-suave", 4.5],
  ["botao destrutivo", "superficie", "perigo", 4.5],
  ["erro sobre cartao", "perigo-tinta", "superficie", 4.5],
  ["erro sobre fundo de erro", "perigo-tinta", "perigo-suave", 4.5],
  ["sucesso sobre cartao", "sucesso-tinta", "superficie", 4.5],
  ["selo de sucesso", "sucesso-tinta", "sucesso-suave", 4.5],
  ["selo de atencao", "atencao-tinta", "atencao-suave", 4.5],
  ["selo informativo", "info-tinta", "info-suave", 4.5],
  // Contorno de controle: 3:1 (1.4.11). Campo com borda fraca some ao sol.
  ["borda de campo sobre cartao", "borda-campo", "superficie", 3],
  ["borda de campo sobre pagina", "borda-campo", "superficie-afundada", 3],
  ["anel de foco sobre pagina", "primaria-tinta", "superficie-afundada", 3],
];

export function conferirContraste(
  check: (nome: string, cond: boolean, detalhe?: string) => void,
): void {
  console.log("");
  console.log("🎨 Contraste da paleta (WCAG 2.1 AA, valores lidos de globals.css)");

  let tokens: Map<string, RGB>;
  try {
    tokens = lerTokens();
  } catch (e) {
    check("globals.css legivel", false, String(e));
    return;
  }

  for (const [rotulo, ft, fb, minimo] of PARES) {
    const a = tokens.get(ft);
    const b = tokens.get(fb);
    if (!a || !b) {
      check(rotulo, false, `token ausente em globals.css: ${!a ? ft : fb}`);
      continue;
    }
    const r = razao(a, b);
    check(
      `${rotulo} (${r.toFixed(2)}:1)`,
      r >= minimo,
      `precisa de ${minimo.toFixed(1)}:1. Escureca o texto ou clareie o fundo em src/app/globals.css.`,
    );
  }
}

// Permite rodar isolado: `npx tsx scripts/check-contraste.ts`.
if (require.main === module) {
  let falhas = 0;
  conferirContraste((nome, cond, detalhe) => {
    if (cond) console.log(`  ✅ ${nome}`);
    else {
      falhas += 1;
      console.error(`  ❌ ${nome}${detalhe ? `\n       ${detalhe}` : ""}`);
    }
  });
  console.log("");
  console.log(falhas === 0 ? "✅ Paleta em conformidade." : `❌ ${falhas} par(es) reprovado(s).`);
  process.exit(falhas === 0 ? 0 : 1);
}
