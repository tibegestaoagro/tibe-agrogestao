/**
 * Envolve todo handler de rota com `withApi`, para que nenhuma rota possa
 * devolver algo que não seja o envelope do contrato.
 *
 * Roda uma vez. Fica versionado porque a conferência que ele faz vale mais que
 * o script: `npm run check` passa a reprovar rota nova sem o wrapper, e quem
 * for consertar precisa saber como as existentes foram tratadas.
 *
 * Transformação, por arquivo:
 *   export async function GET(...)   ->   async function GETHandler(...)
 *   e no fim do arquivo:                  export const GET = withApi(GETHandler);
 *
 * É textual de propósito: os 145 handlers do projeto são declarados de UMA
 * forma só (`export async function VERBO`), conferido antes de escrever isto,
 * e nenhum chama outro handler do mesmo arquivo. Um transform de AST seria
 * mais poder do que o caso pede.
 *
 * Uso:
 *   node scripts/aplica-with-api.mjs --dry     (mostra o que faria)
 *   node scripts/aplica-with-api.mjs           (aplica)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";

const RAIZ = path.join(process.cwd(), "src", "app", "api");
const VERBOS = ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"];
const SIMULACAO = process.argv.includes("--dry");

function rotas(dir) {
  const achadas = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const caminho = path.join(dir, item.name);
    if (item.isDirectory()) achadas.push(...rotas(caminho));
    else if (item.name === "route.ts") achadas.push(caminho);
  }
  return achadas;
}

let tocados = 0;
let handlersEnvolvidos = 0;
const pulados = [];

for (const arquivo of rotas(RAIZ)) {
  let texto = readFileSync(arquivo, "utf-8");

  if (texto.includes("withApi(")) {
    pulados.push([arquivo, "ja usa withApi"]);
    continue;
  }

  const presentes = VERBOS.filter((v) =>
    new RegExp(`^export async function ${v}\\s*\\(`, "m").test(texto),
  );

  if (presentes.length === 0) {
    pulados.push([arquivo, "nenhum handler no formato esperado"]);
    continue;
  }

  for (const verbo of presentes) {
    texto = texto.replace(
      new RegExp(`^export async function ${verbo}\\s*\\(`, "m"),
      `async function ${verbo}Handler(`,
    );
  }

  // O import entra depois do ÚLTIMO import, e achar isso exige rastrear
  // import de várias linhas: olhar só para linhas que começam com "import "
  // acerta o começo do bloco e insere no meio dele, quebrando a sintaxe. Foi
  // exatamente o que aconteceu na primeira tentativa, em arquivos como
  // `api/v1/herd/movements/route.ts`.
  const linhas = texto.split("\n");
  let fimDosImports = -1;
  let dentroDeImport = false;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (!dentroDeImport && /^import\b/.test(l)) {
      dentroDeImport = true;
    }
    if (dentroDeImport) {
      // Um import termina na linha que fecha com ponto e vírgula.
      if (/;\s*$/.test(l)) {
        dentroDeImport = false;
        fimDosImports = i;
      }
      continue;
    }
  }

  const importe = 'import { withApi } from "@/lib/route";';
  if (fimDosImports >= 0) linhas.splice(fimDosImports + 1, 0, importe);
  else linhas.unshift(importe);
  texto = linhas.join("\n");

  const exports = presentes
    .map((v) => `export const ${v} = withApi(${v}Handler);`)
    .join("\n");
  texto = `${texto.replace(/\s*$/, "")}\n\n${exports}\n`;

  if (!SIMULACAO) writeFileSync(arquivo, texto, "utf-8");
  tocados++;
  handlersEnvolvidos += presentes.length;
}

console.log(SIMULACAO ? "SIMULACAO (nada foi escrito)" : "aplicado");
console.log(`arquivos tocados: ${tocados}`);
console.log(`handlers envolvidos: ${handlersEnvolvidos}`);
if (pulados.length) {
  console.log(`pulados: ${pulados.length}`);
  for (const [a, motivo] of pulados) console.log(`  ${path.relative(process.cwd(), a)}: ${motivo}`);
}
