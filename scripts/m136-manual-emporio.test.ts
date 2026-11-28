/**
 * M136: Módulo 39 (Meu Empório), UX onda 7: a estrutura do manual.
 * Roda: `npm run test:m136` (sem banco: não importa o prisma, por isso não usa exigirBancoLocal).
 *
 * Escrita do plano docs/superpowers/plans/2026-11-28-emporio-ux-onda7-manual.md
 * (decisões 1, 2, 6, 7 e 12, e a Task 5), sem ler o texto das partes.
 *
 * Como acha as âncoras: RENDERIZA cada parte (CONTEUDOS[slug] com
 * renderToStaticMarkup, de react-dom/server) e lê os `id="..."` do HTML. Se uma
 * parte não renderiza sob tsx (ex.: figura com id inexistente lança), a suíte
 * registra a falha daquela parte e cai para o `id="..."` literal do código da
 * função, para os outros links não ficarem sem checagem.
 *
 * Seção 1: as 27 partes, o mapa de conteúdo e os slugs que saíram.
 * Seção 2: PARTES_ANTIGAS (os redirecionamentos da decisão 6).
 * Seção 3: as âncoras fixas da decisão 7.
 * Seção 4: todo link /manual/emporio/<slug>(#id) aponta para parte viva e âncora existente.
 * Seção 5: figuras e animações usadas existem nas definições, e as 4 novas estão lá.
 * Seção 6: os arquivos de imagem (PNG de computador e de celular, GIF). Só passa
 *          depois das fotos da Task 6: antes disso reprova de propósito.
 * Seção 7: frases que não existem mais nas telas.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as Indice from "@/app/(dashboard)/manual/_conteudo/indice";
import { CONTEUDOS } from "@/app/(dashboard)/manual/_conteudo/conteudos";
import { FIGURAS } from "@/app/(dashboard)/manual/_conteudo/figuras";
import { ANIMACOES } from "@/app/(dashboard)/manual/_conteudo/animacoes";

let falhas = 0;
let acertos = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) {
    acertos += 1;
    console.log(`  ✅ ${nome}`);
  } else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

const RAIZ = process.cwd();
const PASTA_MANUAL = path.join(RAIZ, "src", "app", "(dashboard)", "manual");
const PASTA_EMPORIO = path.join(RAIZ, "src", "app", "(dashboard)", "emporio");
const PASTA_IMAGENS = path.join(RAIZ, "public", "manual", "emporio");

const { PARTES_DO_EMPORIO, BASE_DO_EMPORIO } = Indice;
const PARTES_ANTIGAS = (Indice as { PARTES_ANTIGAS?: Record<string, string> }).PARTES_ANTIGAS;

const VIVAS = new Set(PARTES_DO_EMPORIO.map((p) => p.slug));
/** Página que vive fora da sequência de partes, mas é alvo válido de link. */
const EXTRAS_VALIDAS = new Set(["vendedor-imprimir"]);

/** Decisão 1: saem estes quatro. */
const SLUGS_QUE_SAIRAM = ["resultado", "relatorios", "despesas", "financeiro-das-lojas"];
/** Decisão 1: entram estes três. */
const SLUGS_NOVOS = ["dinheiro", "a-pagar", "estatisticas"];
/** Decisão 6, literal. */
const ANTIGAS_ESPERADAS: Record<string, string> = {
  "financeiro-das-lojas": "dinheiro",
  despesas: "a-pagar",
  resultado: "estatisticas#resultado",
  relatorios: "estatisticas#vendas",
};
/** Decisão 7: âncoras fixas, contrato entre as tarefas. */
const ANCORAS_FIXAS: Record<string, string[]> = {
  estatisticas: ["visao-geral", "vendas", "dinheiro", "resultado", "imprimir"],
  dinheiro: ["hoje", "a-receber", "aprovacoes", "conferir-com-o-banco"],
  "a-pagar": ["contas", "despesas-fixas", "vendeu-pagou"],
};
/** Decisão 2: as figuras novas. */
const FIGURAS_NOVAS = ["loja-do-topo", "inicio", "estatisticas-visao-geral", "balcao-mais-opcoes"];

/**
 * Frases que a tela não diz mais. Cada uma foi trocada nas ondas 1 a 6; se
 * voltar ao manual, o leitor procura um botão que não existe. Procuradas no
 * texto renderizado das partes, na legenda, alt, marcas e passos de
 * figuras.ts e animacoes.ts, e no código de vendedor-imprimir/page.tsx.
 */
const FRASES_PROIBIDAS: { frase: string; vale: RegExp }[] = [
  { frase: "Abrir o Caixa 1", vale: /Abrir o Caixa 1/ },
  { frase: "aba Cobrança", vale: /aba Cobrança/i },
  { frase: "Ver relatório", vale: /Ver relatório/ },
  { frase: "Mês atual", vale: /Mês atual/ },
  { frase: "Esta semana", vale: /Esta semana/ },
  { frase: "filtro de loja", vale: /filtro de loja/i },
  { frase: "Novo estabelecimento", vale: /Novo estabelecimento/ },
  { frase: "faixa do rodapé", vale: /faixa do rodapé/i },
  { frase: "Cliente novo", vale: /Cliente novo/ },
  // "Posição de caixa" ainda existe em contexto certo (o relatório "Posição de
  // caixa por lugar"): só as formas erradas, de aba, reprovam.
  { frase: "aba Posição de caixa", vale: /aba\s+["“]?Posição de caixa/i },
  { frase: "Em Posição de caixa", vale: /\bem\s+["“]?Posição de caixa/i },
];
/**
 * "Cadastrar novo cliente" ainda existe (o botão da janela de cliente, no caso
 * "sem cliente"). Reprova só a frase que manda clicar nele sem a condição: a
 * mesma frase (até o ponto) precisa dizer "sem cliente".
 */
function cadastrarNovoClienteSemCondicao(texto: string): string[] {
  return texto
    .split(/(?<=[.!?])\s+/)
    .filter((f) => /clique em\s+["“]?Cadastrar novo cliente/i.test(f) && !/sem cliente/i.test(f));
}

function decodificar(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function arquivosDe(pasta: string, ext: RegExp): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const cheio = path.join(pasta, nome);
    if (statSync(cheio).isDirectory()) saida.push(...arquivosDe(cheio, ext));
    else if (ext.test(nome)) saida.push(cheio);
  }
  return saida;
}
const rel = (f: string) => path.relative(RAIZ, f).replace(/\\/g, "/");

console.log("📖 M136: Módulo 39 (Meu Empório), UX onda 7: a estrutura do manual\n");

const slugsVivos = PARTES_DO_EMPORIO.map((p) => p.slug);
const slugsDeConteudo = Object.keys(CONTEUDOS);

// ---------------------------------------------------------------- 1
console.log("1. As partes");
check("são 27 partes em PARTES_DO_EMPORIO", PARTES_DO_EMPORIO.length === 27, `são ${PARTES_DO_EMPORIO.length}`);
check("nenhum slug repetido", new Set(slugsVivos).size === slugsVivos.length);
const semConteudo = slugsVivos.filter((s) => typeof CONTEUDOS[s] !== "function");
check("toda parte de PARTES_DO_EMPORIO tem conteúdo em CONTEUDOS", semConteudo.length === 0, semConteudo.join(", "));
const semParte = slugsDeConteudo.filter((s) => !VIVAS.has(s));
check("todo conteúdo de CONTEUDOS tem parte em PARTES_DO_EMPORIO", semParte.length === 0, semParte.join(", "));
for (const s of SLUGS_QUE_SAIRAM) {
  check(`a parte "${s}" saiu (índice e conteúdo)`, !VIVAS.has(s) && !(s in CONTEUDOS));
}
for (const s of SLUGS_NOVOS) {
  check(`a parte "${s}" entrou (índice e conteúdo)`, VIVAS.has(s) && typeof CONTEUDOS[s] === "function");
}

// ---------------------------------------------------------------- 2
console.log("\n2. PARTES_ANTIGAS (redirecionamentos)");
check("PARTES_ANTIGAS é exportada de indice.ts", PARTES_ANTIGAS !== undefined);
const antigas = PARTES_ANTIGAS ?? {};
check(
  "PARTES_ANTIGAS tem exatamente as 4 chaves da decisão 6",
  j(Object.keys(antigas).sort()) === j(Object.keys(ANTIGAS_ESPERADAS).sort()),
  Object.keys(antigas).join(", "),
);
for (const [de, para] of Object.entries(ANTIGAS_ESPERADAS)) {
  check(`"${de}" redireciona para "${para}"`, antigas[de] === para, `é ${antigas[de]}`);
}
for (const antigo of Object.keys(antigas)) {
  check(`o endereço antigo "${antigo}" não é parte viva`, !VIVAS.has(antigo));
}
function j(x: unknown): string {
  return JSON.stringify(x);
}

// ---------------------------------------------------------------- ancoras
type Renderizada = { html: string; texto: string; ancoras: Set<string>; erro?: string };
const renderizadas = new Map<string, Renderizada>();
const codigoPorArquivo = new Map<string, string>();
for (const f of arquivosDe(path.join(PASTA_MANUAL, "_conteudo"), /\.tsx?$/)) {
  codigoPorArquivo.set(f, readFileSync(f, "utf-8"));
}

/** Plano B: o `id="x"` literal em todo o código das partes (inclui a função certa e as vizinhas). */
function ancorasDoCodigo(): Set<string> {
  const s = new Set<string>();
  for (const [f, cod] of codigoPorArquivo) {
    if (!f.endsWith(".tsx")) continue;
    for (const m of cod.matchAll(/\bid=["{`']+([a-z0-9-]+)/g)) s.add(m[1]);
  }
  return s;
}

for (const slug of slugsVivos) {
  const fn = CONTEUDOS[slug];
  if (typeof fn !== "function") continue;
  try {
    const html = renderToStaticMarkup(createElement(fn));
    const ancoras = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    renderizadas.set(slug, { html, texto: decodificar(html), ancoras });
  } catch (e) {
    renderizadas.set(slug, { html: "", texto: "", ancoras: ancorasDoCodigo(), erro: (e as Error).message });
  }
}

// ---------------------------------------------------------------- 3
console.log("\n3. As âncoras fixas (decisão 7)");
const naoRenderizam = [...renderizadas].filter(([, r]) => r.erro);
check(
  "toda parte renderiza sob tsx (as âncoras vêm do HTML)",
  naoRenderizam.length === 0,
  naoRenderizam.map(([s, r]) => `${s}: ${r.erro}`).join(" | "),
);
for (const [slug, ids] of Object.entries(ANCORAS_FIXAS)) {
  const r = renderizadas.get(slug);
  for (const id of ids) {
    check(`${slug}#${id} existe`, !!r && r.ancoras.has(id));
  }
}
for (const [de, para] of Object.entries(antigas)) {
  const [slug, ancora] = para.split("#");
  const viva = VIVAS.has(slug);
  check(`o destino de "${de}" ("${slug}") é parte viva`, viva);
  if (ancora) check(`o destino de "${de}" ("${para}") tem a âncora`, !!renderizadas.get(slug)?.ancoras.has(ancora));
}

// ---------------------------------------------------------------- 4
console.log("\n4. Links do manual e das telas para o manual");
type Link = { arquivo: string; slug: string; ancora: string | null };
const links: Link[] = [];
const fontes = [
  ...arquivosDe(PASTA_MANUAL, /\.tsx?$/),
  ...arquivosDe(PASTA_EMPORIO, /\.tsx?$/),
];
for (const f of fontes) {
  const cod = f.startsWith(path.join(PASTA_MANUAL, "_conteudo")) ? (codigoPorArquivo.get(f) ?? "") : readFileSync(f, "utf-8");
  // `${B}/slug#id` e `${BASE_DO_EMPORIO}/slug#id` (nos .tsx do manual) e o literal "/manual/emporio/slug#id".
  const padroes = [
    /\$\{B\}\/([a-z0-9-]+)(?:#([a-z0-9-]+))?/g,
    /\$\{BASE_DO_EMPORIO\}\/([a-z0-9-]+)(?:#([a-z0-9-]+))?/g,
    /\/manual\/emporio\/([a-z0-9-]+)(?:#([a-z0-9-]+))?/g,
  ];
  for (const p of padroes) {
    for (const m of cod.matchAll(p)) links.push({ arquivo: rel(f), slug: m[1], ancora: m[2] ?? null });
  }
}
// Links do HTML renderizado (href="/manual/emporio/x#y"), que pega os montados por helper.
for (const [slug, r] of renderizadas) {
  for (const m of r.html.matchAll(/href="\/manual\/emporio\/([a-z0-9-]+)(?:#([a-z0-9-]+))?"/g)) {
    links.push({ arquivo: `(renderizado) ${slug}`, slug: m[1], ancora: m[2] ?? null });
  }
}
check("achou links para checar", links.length > 0, "0 links: o varredor está quebrado");

const unicos = new Map<string, Link>();
for (const l of links) unicos.set(`${l.arquivo}|${l.slug}|${l.ancora}`, l);
const mortos: string[] = [];
const semAncora: string[] = [];
for (const l of unicos.values()) {
  const alvo = `${l.slug}${l.ancora ? `#${l.ancora}` : ""}`;
  if (!VIVAS.has(l.slug) && !EXTRAS_VALIDAS.has(l.slug)) {
    mortos.push(`${l.arquivo} -> ${alvo}`);
    continue;
  }
  if (l.ancora && !renderizadas.get(l.slug)?.ancoras.has(l.ancora)) semAncora.push(`${l.arquivo} -> ${alvo}`);
}
check(`todo link aponta para parte viva (${unicos.size} links)`, mortos.length === 0, `\n       ${mortos.join("\n       ")}`);
check("todo link com # aponta para âncora que existe", semAncora.length === 0, `\n       ${semAncora.join("\n       ")}`);

// ---------------------------------------------------------------- 5
console.log("\n5. Figuras e animações usadas");
const usadas = (re: RegExp) => {
  const s = new Map<string, string[]>();
  for (const [f, cod] of codigoPorArquivo) {
    if (!f.endsWith(".tsx")) continue;
    for (const m of cod.matchAll(re)) s.set(m[1], [...(s.get(m[1]) ?? []), rel(f)]);
  }
  return s;
};
const figurasUsadas = usadas(/<Figura\s+id="([^"]+)"/g);
const animacoesUsadas = usadas(/<Animacao\s+id="([^"]+)"/g);
const idsFiguras = new Set(FIGURAS.map((f) => f.id));
const idsAnimacoes = new Set(ANIMACOES.map((a) => a.id));
check("achou <Figura id> no manual", figurasUsadas.size > 0);
const figuraFantasma = [...figurasUsadas].filter(([id]) => !idsFiguras.has(id));
check(
  "toda <Figura id> usada existe em FIGURAS",
  figuraFantasma.length === 0,
  figuraFantasma.map(([id, fs]) => `${id} (${fs.join(", ")})`).join("; "),
);
const animacaoFantasma = [...animacoesUsadas].filter(([id]) => !idsAnimacoes.has(id));
check(
  "toda <Animacao id> usada existe em ANIMACOES",
  animacaoFantasma.length === 0,
  animacaoFantasma.map(([id, fs]) => `${id} (${fs.join(", ")})`).join("; "),
);
for (const id of FIGURAS_NOVAS) {
  check(`a figura nova "${id}" existe em FIGURAS`, idsFiguras.has(id));
  check(`a figura nova "${id}" é usada em alguma parte`, figurasUsadas.has(id));
}
check("nenhum id repetido em FIGURAS", idsFiguras.size === FIGURAS.length);
check("nenhum id repetido em ANIMACOES", idsAnimacoes.size === ANIMACOES.length);

// ---------------------------------------------------------------- 6
console.log("\n6. Os arquivos de imagem (só passam depois das fotos da Task 6)");
const faltaPng: string[] = [];
for (const f of FIGURAS) {
  for (const arq of [`${f.id}.png`, `${f.id}-celular.png`]) {
    if (!existsSync(path.join(PASTA_IMAGENS, arq))) faltaPng.push(arq);
  }
}
check(
  `os dois PNG (computador e celular) existem para as ${FIGURAS.length} figuras`,
  faltaPng.length === 0,
  `faltam ${faltaPng.length}: ${faltaPng.slice(0, 8).join(", ")}${faltaPng.length > 8 ? ", ..." : ""} (esperado até a Task 6)`,
);
const faltaGif = ANIMACOES.filter((a) => !existsSync(path.join(PASTA_IMAGENS, `${a.id}.gif`))).map((a) => `${a.id}.gif`);
check(
  `o GIF existe para as ${ANIMACOES.length} animações`,
  faltaGif.length === 0,
  `faltam ${faltaGif.length}: ${faltaGif.join(", ")} (esperado até a Task 6)`,
);

// ---------------------------------------------------------------- 7
console.log("\n7. Frases que não existem mais nas telas");
type Texto = { onde: string; texto: string };
const textos: Texto[] = [];
for (const [slug, r] of renderizadas) {
  // Sem render (falha): o código de todas as partes, para a frase proibida não passar de graça.
  textos.push({ onde: `parte ${slug}`, texto: r.erro ? [...codigoPorArquivo.values()].join(" ") : r.texto });
}
for (const f of FIGURAS) {
  textos.push({
    onde: `figura ${f.id}`,
    texto: [f.legenda, f.alt, ...f.marcas.flatMap((m) => [m.alvo, m.texto])].join(" | "),
  });
}
for (const a of ANIMACOES) {
  textos.push({ onde: `animação ${a.id}`, texto: [a.legenda, a.alt, ...a.passos.map((p) => p.texto)].join(" | ") });
}
const guia = path.join(PASTA_MANUAL, "emporio", "vendedor-imprimir", "page.tsx");
check("vendedor-imprimir/page.tsx existe", existsSync(guia));
if (existsSync(guia)) textos.push({ onde: "vendedor-imprimir/page.tsx", texto: decodificar(readFileSync(guia, "utf-8")) });

for (const { frase, vale } of FRASES_PROIBIDAS) {
  const achou = textos.filter((t) => vale.test(t.texto)).map((t) => t.onde);
  check(`"${frase}" não aparece`, achou.length === 0, achou.join(", "));
}
const semCondicao = textos.flatMap((t) => cadastrarNovoClienteSemCondicao(t.texto).map(() => t.onde));
check('"clique em Cadastrar novo cliente" só aparece com a condição "sem cliente"', semCondicao.length === 0, semCondicao.join(", "));

console.log(`\n${falhas === 0 ? "🎉" : "💥"} M136: ${acertos} ok, ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
