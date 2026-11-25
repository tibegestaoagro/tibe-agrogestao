/**
 * Textos defasados: depois de uma onda de UX, acha as frases que SAIRAM de
 * `src/` e que roteiros, suítes e o manual ainda esperam.
 *
 *   npm run textos-defasados -- [base] [head]     (base = main, head = HEAD)
 *
 * Saída 1 se houver achado em roteiros ou suítes; 0 se só no manual ou nada.
 * Só lê o git (diff e grep na árvore COMMITADA de `head`, nunca o working
 * tree): a rotina roda depois dos commits da onda, e assim funciona em ponta
 * histórica. Limite: texto montado por `${}` e JSX com tags entre as linhas do
 * mesmo texto não são extraídos. Não chame `git merge-base`: um hook do projeto o recusa, e o
 * `base...head` do diff já usa o ponto em comum.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "main";
const head = process.argv[3] ?? "HEAD";

function git(args: string[], aceitaSaida1 = false): string {
  try {
    return execFileSync("git", ["-c", "core.quotepath=off", ...args], {
      cwd: RAIZ,
      encoding: "utf8",
      maxBuffer: 512 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    // git grep sai 1 quando nada casa: não é erro.
    if (aceitaSaida1 && err.status === 1) return err.stdout ?? "";
    throw e;
  }
}

/**
 * O que conta como frase visível: um rótulo de uma palavra (maiúscula inicial,
 * 5+ letras) ou pelo menos 2 palavras, 8 caracteres, uma letra minúscula, e
 * nada com cara de classe do Tailwind, caminho, import ou código.
 */
export function ehFrase(bruto: string): boolean {
  const t = bruto.replace(/\s+/g, " ").trim();
  // Rótulo de uma palavra só ("Carimbar", "Lojas"): maiúscula inicial e 5+ letras.
  if (/^[A-ZÀ-Ú][A-Za-zà-ú]{4,}$/.test(t)) return true;
  if (t.length < 8) return false;
  if (!/[a-zà-ú]/.test(t)) return false;
  const palavras = t.split(" ");
  if (palavras.length < 2) return false;
  if (/^[/@.#$]|^https?:|^\w+:\/\//.test(t)) return false;
  if (/[{}=;]|=>|<\/|\bimport\b|\bfrom\b ["']/.test(t)) return false;
  // Classe do Tailwind: muitas palavras com hífen, dois-pontos, colchete, barra.
  const tecnicas = palavras.filter((p) => /[-:[\]/=]/.test(p) && !/^[A-Za-zÀ-ú]+-[A-Za-zÀ-ú]+[.,;!?]?$/.test(p) || /\d\/\d|\[.*\]/.test(p));
  if (tecnicas.length * 2 >= palavras.length) return false;
  // Precisa de ao menos uma palavra de 3+ letras escrita em prosa.
  if (!palavras.some((p) => /^[A-Za-zÀ-ú]{3,}[.,;:!?]?$/.test(p))) return false;
  // Identificador camelCase ou snake_case sem prosa.
  if (palavras.every((p) => /^[a-z]+[A-Z]\w*$|^\w+_\w+$/.test(p))) return false;
  return true;
}

function extrair(linha: string): string[] {
  const achados: string[] = [];
  const l = linha.trim();
  if (/^(import|export \* from|\/\/|\*|\/\*)/.test(l)) {
    // Comentário e import não são texto visível.
    if (!/^\/\/\s*$/.test(l)) return [];
  }
  // Literais de string (aspas duplas, simples, crase sem ${).
  const reLit = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\$]|\\.|\$(?!\{))*)`/g;
  for (const m of l.matchAll(reLit)) {
    const t = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\\(["'`])/g, "$1");
    achados.push(t);
  }
  // Texto JSX entre > e <.
  for (const m of l.matchAll(/>([^<>{}]+)</g)) achados.push(m[1]);
  // Linha só de texto (JSX em várias linhas).
  if (!/[<>{}=;()"'`]/.test(l)) achados.push(l);
  return achados.map((t) => t.replace(/\s+/g, " ").trim()).filter(ehFrase);
}

function desescapar(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function norm(s: string): string {
  return desescapar(s).normalize("NFC").replace(/\s+/g, " ").toLowerCase();
}

type Linha = { arquivo: string; n: number; texto: string };

/** Todas as linhas dos caminhos, na árvore de `head`. */
function lerArvore(paths: string[]): Linha[] {
  const saida = git(["grep", "-n", "-I", "-e", "", head, "--", ...paths], true);
  const prefixo = `${head}:`;
  const linhas: Linha[] = [];
  for (const bruta of saida.split("\n")) {
    if (!bruta.startsWith(prefixo)) continue;
    const resto = bruta.slice(prefixo.length);
    const m = resto.match(/^(.*?):(\d+):(.*)$/);
    if (!m) continue;
    linhas.push({ arquivo: m[1], n: Number(m[2]), texto: m[3].replace(/\r$/, "") });
  }
  return linhas;
}

function principal() {
  const diff = git(["diff", "-U0", `${base}...${head}`, "--", "src/"]);
  const candidatos = new Set<string>();
  // Cada bloco contíguo de linhas removidas é extraído linha a linha e também
  // junto, para pegar texto JSX quebrado em várias linhas.
  let bloco: string[] = [];
  const fechar = () => {
    if (bloco.length > 1) for (const t of extrair(bloco.join(" "))) candidatos.add(t);
    bloco = [];
  };
  for (const l of diff.split("\n")) {
    if (!l.startsWith("-") || l.startsWith("---")) {
      fechar();
      continue;
    }
    bloco.push(l.slice(1).trim());
    for (const t of extrair(l.slice(1))) candidatos.add(t);
  }
  fechar();

  const src = lerArvore(["src/"]);
  const srcNorm = src.map((l) => norm(l.texto)).join("\n");
  // Rótulo de uma palavra só é comum em identificador e comentário
  // ("listarEstabelecimentosAction", "Carimbar e retirar..."), então ele só
  // conta como presente se estiver sozinho num literal ou num texto JSX.
  const srcRotulos = src
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l.texto))
    .map((l) => norm(l.texto))
    .join("\n");
  const umaPalavra = (t: string) => !t.includes(" ");
  const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const presente = (t: string) =>
    umaPalavra(t)
      ? new RegExp(`(^|[>"'\`\\n])\\s*${escapar(norm(t))}\\s*($|[<"'\`\\n])`).test(srcRotulos)
      : srcNorm.includes(norm(t));
  const removidos = [...candidatos].filter((t) => !presente(t));

  // Fora da busca: a própria ferramenta, comentário de roteiro (`#`) e linha que
  // AFIRMA a ausência do texto antigo (`not in`, `not any`, `not tem(`) ou que só
  // titula o passo (`passo(`): essas citam o texto velho de propósito.
  const afirmaAusencia = /^\s*#|\bnot\s+(in|any|tem)\b|\bpasso\(|\bnao_tem\(/;
  const scripts = lerArvore(["scripts/"]).filter(
    (l) => l.arquivo !== "scripts/textos-defasados.ts" && !afirmaAusencia.test(l.texto),
  );
  const manual = lerArvore(["src/app/(dashboard)/manual/"]);
  const roteiros = scripts.filter((l) => l.arquivo.startsWith("scripts/navegador/"));
  const suites = scripts.filter((l) => !l.arquivo.startsWith("scripts/navegador/"));
  const nr = roteiros.map((l) => norm(l.texto));
  const ns = suites.map((l) => norm(l.texto));
  const nm = manual.map((l) => norm(l.texto));

  const achadosCorrigir: string[] = [];
  const achadosManual: string[] = [];
  const buscar = (alvo: Linha[], normas: string[], t: string, saida: string[]) => {
    const n = norm(t);
    // Uma palavra só: exige o rótulo sozinho entre aspas ou tags, com a mesma
    // caixa (prosa de comentário e identificador não são afirmação de tela).
    const palavra = umaPalavra(t)
      ? new RegExp(`["'\`>]\\s*${escapar(t.normalize("NFC"))}\\s*["'\`<]`)
      : null;
    normas.forEach((txt, i) => {
      const bate = palavra
        ? palavra.test(desescapar(alvo[i].texto).normalize("NFC"))
        : txt.includes(n);
      if (bate) saida.push(`${alvo[i].arquivo}:${alvo[i].n}  "${t}"`);
    });
  };
  for (const t of removidos.sort()) {
    buscar(roteiros, nr, t, achadosCorrigir);
    buscar(suites, ns, t, achadosCorrigir);
    buscar(manual, nm, t, achadosManual);
  }

  if (achadosCorrigir.length === 0 && achadosManual.length === 0) {
    console.log(
      `Sem textos defasados: ${removidos.length} texto(s) removido(s) de src/ conferido(s) (${base}...${head}).`,
    );
    process.exit(0);
  }
  if (achadosCorrigir.length) {
    console.log("Roteiros e suítes (corrigir nesta onda)");
    for (const a of achadosCorrigir) console.log(`  ${a}`);
    console.log("");
  }
  if (achadosManual.length) {
    console.log("Manual (vai para a lista da onda 7)");
    for (const a of achadosManual) console.log(`  ${a}`);
    console.log("");
  }
  console.log(
    `${removidos.length} texto(s) removido(s) conferido(s); ${achadosCorrigir.length} achado(s) em roteiros/suítes, ${achadosManual.length} no manual.`,
  );
  process.exit(achadosCorrigir.length ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) principal();
