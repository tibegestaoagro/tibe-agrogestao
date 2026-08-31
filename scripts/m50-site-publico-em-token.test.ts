import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COR_CRUA } from "./check-repo";

/**
 * Suite SEM banco: le arquivo, nao consulta Postgres. Por isso NAO chama
 * `exigirBancoLocal()` nem usa `comBanco()`: as duas existem para suite que
 * toca banco, e esta nao toca.
 *
 * Modulo real: site publico em token semantico
 * (docs/superpowers/specs/2026-08-31-site-publico-em-token-semantico.md). O
 * contador de suite (`m50`) descolou do numero de modulo por volta do `m25`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🐄 M50: o que esta suite prova\n");
console.log(
  "Site publico (src/app/(public)/** e src/components/public/**) fala por token semantico,\n" +
    "e os dois tokens novos de bloco de codigo existem.\n",
);

const RAIZ = join(__dirname, "..");

/**
 * `COR_CRUA` vem IMPORTADA de `scripts/check-repo.ts` (conferencia 8 do
 * `npm run check`), nao copiada aqui. Uma copia fica presa no dia em que foi
 * feita: a copia que existia antes cobria so 3 prefixos e 9 familias de cor,
 * a de la ja tinha ido para 14 prefixos e 22 familias, e esta suite seguia
 * afirmando "nenhuma cor crua no site publico" sobre codigo que a regex nova
 * pegaria (`divide-gray-100`, `bg-purple-100`). Importar fecha essa divergencia
 * de vez, em vez de exigir lembrar de atualizar as duas juntas.
 */

/**
 * O alias depreciado que aponta para o proprio fundo da pagina: um elemento
 * pintado com `bg-tibe-light` sobre um fundo `bg-tibe-light` fica invisivel, e
 * o portao de contraste aprova, porque ele compara PAR de token, nunca o uso.
 * Foi a pilula invisivel achada na validacao ao vivo da frente 5.
 */
const BG_TIBE_LIGHT = /\bbg-tibe-light\b/;

const ESCOPO = ["src/app/(public)/", "src/components/public/"];

function arquivosDoEscopo(): string[] {
  const versionados = execFileSync("git", ["ls-files"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  return versionados.filter(
    (rel) => ESCOPO.some((prefixo) => rel.startsWith(prefixo)) && rel.endsWith(".tsx"),
  );
}

console.log("1. Nenhum arquivo do site publico casa com a regex de cor crua\n");

const arquivos = arquivosDoEscopo();
check(
  "o escopo (src/app/(public)/** e src/components/public/**) tem arquivos .tsx versionados para conferir",
  arquivos.length > 0,
  `encontrados: ${arquivos.length}`,
);

const comCorCrua: string[] = [];
const comTibeLight: string[] = [];
for (const rel of arquivos) {
  const full = join(RAIZ, rel);
  if (!existsSync(full)) continue;
  const conteudo = readFileSync(full, "utf8");
  if (COR_CRUA.test(conteudo)) comCorCrua.push(rel);
  if (BG_TIBE_LIGHT.test(conteudo)) comTibeLight.push(rel);
}

check(
  `nenhum dos ${arquivos.length} arquivos do escopo pinta com a paleta crua do Tailwind`,
  comCorCrua.length === 0,
  comCorCrua.length > 0
    ? `ainda com cor crua (${comCorCrua.length}): ${comCorCrua.join(", ")}`
    : undefined,
);

console.log("\n2. Nenhum arquivo do escopo usa o alias depreciado bg-tibe-light\n");

check(
  "bg-tibe-light nao aparece em nenhum arquivo do site publico",
  comTibeLight.length === 0,
  comTibeLight.length > 0 ? comTibeLight.join(", ") : undefined,
);

console.log("\n3. Os dois tokens novos existem em src/app/globals.css\n");

const globalsPath = join(RAIZ, "src", "app", "globals.css");
const globalsExiste = existsSync(globalsPath);
check("src/app/globals.css existe", globalsExiste);

if (globalsExiste) {
  const globals = readFileSync(globalsPath, "utf8");
  check(
    "--codigo-fundo esta declarado com o valor #111827 (mesmo pixel de bg-gray-900 hoje)",
    /--codigo-fundo:\s*#111827\s*;/.test(globals),
  );
  check(
    "--codigo-texto esta declarado com o valor #f3f4f6 (mesmo pixel de text-gray-100 hoje)",
    /--codigo-texto:\s*#f3f4f6\s*;/.test(globals),
  );
}

console.log("\n4. Os dois tokens novos estao expostos no tailwind.config.ts\n");

const tailwindPath = join(RAIZ, "tailwind.config.ts");
const tailwindExiste = existsSync(tailwindPath);
check("tailwind.config.ts existe", tailwindExiste);

if (tailwindExiste) {
  const tw = readFileSync(tailwindPath, "utf8");
  const blocoCodigo = tw.match(/codigo\s*:\s*\{([\s\S]*?)\}/);
  check(
    "o bloco `codigo` existe na paleta de cores do tailwind.config.ts",
    !!blocoCodigo,
  );
  if (blocoCodigo) {
    const conteudo = blocoCodigo[1];
    check(
      "`codigo.fundo` referencia a variavel --codigo-fundo (gera a classe bg-codigo-fundo)",
      /fundo\s*:[\s\S]*?--codigo-fundo/.test(conteudo),
    );
    check(
      "`codigo.texto` referencia a variavel --codigo-texto (gera a classe text-codigo-texto)",
      /texto\s*:[\s\S]*?--codigo-texto/.test(conteudo),
    );
  }
}

console.log("");
if (falhas === 0) console.log("✅ M50: 0 falhas.");
else console.error(`❌ M50: ${falhas} verificacao(oes) reprovada(s).`);
process.exit(falhas === 0 ? 0 : 1);
