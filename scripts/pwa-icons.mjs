/**
 * Gera os icones do PWA em public/icons/.
 *
 * Nasceram PROVISORIOS na Onda 1 (agente A3), com a paleta antiga. Onda 4
 * (2026-08-04): cores atualizadas pra bater com a identidade nova aplicada
 * pelo C3 na Onda 3 (tailwind.config.ts, secao "tibe"), ja que os PNGs nao
 * sao gerados a partir do Tailwind (nao existe pipeline de build pra isso) e
 * ficaram desatualizados quando so os componentes/tokens mudaram. A arte
 * ainda e geometrica/provisoria (nao o logo real de docs/idVisual/): quem
 * trocar pela arte definitiva apaga este script.
 *
 * Sem dependencia nova (package.json e recurso global): o PNG e escrito na
 * mao com zlib, que ja vem no Node.
 *
 * Uso: node scripts/pwa-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// Cores da marca, iguais as de tailwind.config.ts (tibe.primary / tibe.dark).
const PRIMARY = [0x64, 0x97, 0x21];
const DARK = [0x02, 0x2e, 0x20];
const WHITE = [0xff, 0xff, 0xff];

// Amostras por eixo dentro de cada pixel: 4x4 = 16 amostras, o suficiente para
// suavizar as bordas curvas sem custo relevante nesse tamanho de imagem.
const SAMPLES = 4;

// ---------------------------------------------------------------------------
// Geometria da marca, em coordenadas normalizadas (0..1) no quadrado do icone.
// ---------------------------------------------------------------------------

/** Quadrado de cantos arredondados. `radius` 0 devolve o quadrado inteiro. */
function insideRoundedSquare(x, y, radius) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  if (radius <= 0) return true;
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Colina ao pe do icone: um arco de circunferencia de raio grande, com o topo
 * em y = 0.72 no centro. Sugere o campo sem virar desenho literal.
 */
const HILL_RADIUS = 0.9;
const HILL_TOP = 0.72;
function insideHill(x, y) {
  const cy = HILL_TOP + HILL_RADIUS;
  const dx = x - 0.5;
  const dy = y - cy;
  return dx * dx + dy * dy <= HILL_RADIUS * HILL_RADIUS;
}

/**
 * Letra T, desenhada com dois retangulos levemente arredondados. Fica inteira
 * dentro de x 0.24..0.76 e y 0.26..0.68, ou seja, dentro da zona segura de 80%
 * exigida pelos icones maskable do Android.
 */
function insideMark(x, y) {
  const bar = insideRoundedRect(x, y, 0.24, 0.26, 0.76, 0.375, 0.022);
  const stem = insideRoundedRect(x, y, 0.4425, 0.26, 0.5575, 0.68, 0.022);
  return bar || stem;
}

function insideRoundedRect(x, y, x0, y0, x1, y1, radius) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const r = Math.min(radius, (x1 - x0) / 2, (y1 - y0) / 2);
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/**
 * Cor de uma amostra, de cima para baixo: marca, colina, fundo, transparente.
 * Devolve null quando a amostra cai fora do icone.
 */
function sampleColor(x, y, cornerRadius) {
  if (!insideRoundedSquare(x, y, cornerRadius)) return null;
  if (insideMark(x, y)) return WHITE;
  if (insideHill(x, y)) return DARK;
  return PRIMARY;
}

// ---------------------------------------------------------------------------
// Rasterizacao
// ---------------------------------------------------------------------------

/** Devolve os bytes RGBA (size * size * 4) do icone. */
function render(size, cornerRadius) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SAMPLES);
  const half = step / 2;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      // Acumula em alfa pre-multiplicado: e o unico jeito de a media entre
      // amostras opacas e transparentes dar a cor certa na borda.
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const x = (px * SAMPLES + sx) * step + half;
          const y = (py * SAMPLES + sy) * step + half;
          const color = sampleColor(x, y, cornerRadius);
          if (color) {
            r += color[0];
            g += color[1];
            b += color[2];
            a += 255;
          }
        }
      }

      const total = SAMPLES * SAMPLES;
      const alpha = a / total;
      const offset = (py * size + px) * 4;
      if (alpha > 0) {
        // Divide pelo numero de amostras OPACAS para voltar da pre-multiplicacao.
        const opaque = a / 255;
        pixels[offset] = Math.round(r / opaque);
        pixels[offset + 1] = Math.round(g / opaque);
        pixels[offset + 2] = Math.round(b / opaque);
      }
      pixels[offset + 3] = Math.round(alpha);
    }
  }

  return pixels;
}

// ---------------------------------------------------------------------------
// Codificacao PNG (RGBA, 8 bits, sem entrelacamento)
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidade de bits
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compressao deflate
  ihdr[11] = 0; // filtro padrao
  ihdr[12] = 0; // sem entrelacamento

  // Cada linha e precedida do byte de filtro 0 (nenhum).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------

/**
 * `any`: cantos arredondados, porque o sistema mostra o icone como esta.
 * `maskable` e o do iOS: quadrado inteiro, porque quem arredonda e a plataforma
 * (recortar de novo aqui produziria borda dupla).
 */
const CORNER_RADIUS_ANY = 0.22;
const CORNER_RADIUS_FULL_BLEED = 0;

const TARGETS = [
  { file: "icon-192.png", size: 192, radius: CORNER_RADIUS_ANY },
  { file: "icon-512.png", size: 512, radius: CORNER_RADIUS_ANY },
  { file: "maskable-192.png", size: 192, radius: CORNER_RADIUS_FULL_BLEED },
  { file: "maskable-512.png", size: 512, radius: CORNER_RADIUS_FULL_BLEED },
  { file: "apple-touch-icon.png", size: 180, radius: CORNER_RADIUS_FULL_BLEED },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const target of TARGETS) {
  const png = encodePng(target.size, render(target.size, target.radius));
  writeFileSync(join(OUT_DIR, target.file), png);
  console.log(`${target.file}: ${target.size}x${target.size}, ${png.length} bytes`);
}
