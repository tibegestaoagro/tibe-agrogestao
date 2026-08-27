import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { conferirContraste } from "./check-contraste";

/**
 * Conferencias estaticas do repositorio, sem banco. Roda: `npm run check`.
 *
 * Existe porque a documentacao deste projeto envelhece em silencio. Em
 * 2026-08-18 o CLAUDE.md descrevia `POST /api/v1/signup` como VIVA em 5 linhas
 * e como removida em 1, apontava `src/lib/cancellation-sweep.ts` (o real esta em
 * `src/lib/actions/`), citava `middleware.ts` na raiz cinco vezes (o real e
 * `src/middleware.ts`) e dizia "35 suites" quando eram 41. Nada disso quebra
 * teste nenhum: envenena a proxima sessao, que age sobre um mapa errado.
 *
 * A regra que orienta cada bloco: preferir a checagem que falha SOZINHA a
 * escrever mais uma frase pedindo para alguem lembrar.
 */

const RAIZ = join(__dirname, "..");
const API_ROOT = join(RAIZ, "src", "app", "api");
const SCAN_DIRS = ["v1", "internal", "webhooks", "platform"];
// Pelo ponto de codigo, nao literal: o hook `guarda-escrita.mjs` recusaria este
// arquivo, e faz bem. Assim tambem fica explicito QUAL caractere e o proibido.
const TRAVESSAO = String.fromCharCode(0x2014);

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.error(`  ❌ ${nome}${detalhe ? `\n       ${detalhe}` : ""}`);
  }
}

const versionados = () =>
  execFileSync("git", ["ls-files"], { cwd: RAIZ, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

/** Varre uma pasta de `.md`, se ela existir. */
const mdsDe = (...partes: string[]) => {
  const dir = join(RAIZ, ...partes);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => [...partes, f].join("/"));
};

// `.claude/rules/` entra porque desde 2026-08-18 e la que mora a maior parte do
// que era o CLAUDE.md. Sair do arquivo grande nao torna o conteudo imune a
// envelhecer: torna mais facil esquecer que ele existe.
const DOCS = ["CLAUDE.md", "README.md"]
  .concat(mdsDe("docs", "agents"), mdsDe(".claude", "rules"))
  .filter((f) => existsSync(join(RAIZ, f)));

const textoDe = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

// ---------------------------------------------------------------- 1. caminhos
/**
 * Ancorado numa pasta real do projeto, com EXTENSAO obrigatoria.
 *
 * Sem a ancora, a varredura confunde rota de API e prosa com caminho. Sem a
 * extensao, ela acusa mencao de pasta em prosa ("docs/Modulo Rebanho", que tem
 * espaco no nome) e some no ruido, que e o pior desfecho para um guard-rail:
 * um check que grita demais deixa de ser lido. Os `(grupo)` do App Router entram
 * explicitamente, senao `src/app/(dashboard)/...` seria cortado no parentese.
 */
const CAMINHO =
  /(?:src|scripts|prisma|docs|apps|packages)(?:\/(?:\([A-Za-z0-9_-]+\)|[A-Za-z0-9._-]+))+\.[a-z]{2,4}\b/g;

/** Citados como inexistentes de proposito (removidos, ou nunca criados). */
const CAMINHOS_PERMITIDOS = new Set<string>([
  "src/components/rebanho/property-manager.tsx", // o texto diz "removido"
]);

function conferirCaminhos() {
  console.log("\n1. Caminhos citados na documentacao existem");
  const quebrados: string[] = [];
  for (const doc of DOCS) {
    const texto = textoDe(doc);
    // `Array.from` e nao `for...of` direto: o tsconfig nao define `target`, e
    // sem ele o TS recusa iterar um iterador cru (TS2802).
    for (const m of Array.from(texto.matchAll(CAMINHO))) {
      const alvo = m[0];
      if (CAMINHOS_PERMITIDOS.has(alvo)) continue;
      if (alvo.includes("*") || alvo.includes("XX")) continue; // padrao, nao caminho
      if (!existsSync(join(RAIZ, alvo))) quebrados.push(`${doc}: ${alvo}`);
    }
  }
  const unicos = Array.from(new Set(quebrados)).sort();
  check(
    "nenhum caminho citado aponta para o vazio",
    unicos.length === 0,
    unicos.slice(0, 12).join("\n       "),
  );
}

// ------------------------------------------------------------------ 2. rotas
function acharRotas(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) return acharRotas(full);
    return e === "route.ts" ? [full] : [];
  });
}

function paraUrl(arquivo: string): string {
  const rel = arquivo.slice(API_ROOT.length).replace(/\\/g, "/").replace(/\/route\.ts$/, "");
  const segs = rel
    .split("/")
    .filter(Boolean)
    .map((s) => (s.startsWith("[") && s.endsWith("]") ? `:${s.slice(1, -1)}` : s));
  return `/api/${segs.join("/")}`;
}

/**
 * Rotas citadas de proposito como INEXISTENTES.
 *
 * Sao os dois catch-all do NextAuth, que nao tem `route.ts` proprio, e duas
 * ausencias que a documentacao explica: `/api/webhooks/whatsapp` nunca foi
 * criada (o webhook do WhatsApp vai para o n8n, entao ela seria codigo morto) e
 * `/api/v1/animal-batches` foi removida por nao ter consumidor. Citar o que NAO
 * existe, dizendo por que, e informacao util; a lista aqui e o que separa isso
 * de um ponteiro quebrado.
 */
const ROTAS_PERMITIDAS = [
  /^\/api\/auth/,
  /^\/api\/platform-auth/,
  /^\/api\/webhooks\/whatsapp$/,
  /^\/api\/v1\/animal-batches/,
];

function conferirRotas() {
  console.log("\n2. Rotas citadas na documentacao existem");
  const reais = new Set(SCAN_DIRS.flatMap((d) => acharRotas(join(API_ROOT, d))).map(paraUrl));

  const mortas: string[] = [];
  for (const doc of DOCS) {
    for (const m of Array.from(textoDe(doc).matchAll(/`(\/api\/[A-Za-z0-9:_/[\]-]+)`/g))) {
      const rota = m[1].replace(/\/$/, "").replace(/\[(\w+)\]/g, ":$1");
      if (rota.includes("*") || ROTAS_PERMITIDAS.some((p) => p.test(rota))) continue;
      // Vale se existe OU se e prefixo de alguma real: o texto cita familias
      // (`/api/v1/billing`) alem de rotas exatas.
      const existe = reais.has(rota) || Array.from(reais).some((r) => r.startsWith(`${rota}/`));
      if (!existe) mortas.push(`${doc}: ${rota}`);
    }
  }
  const unicas = Array.from(new Set(mortas)).sort();
  check(
    "nenhuma rota citada foi removida do codigo",
    unicas.length === 0,
    unicas.slice(0, 12).join("\n       "),
  );
}

// --------------------------------------------------------------- 3. comandos
function conferirComandos() {
  console.log("\n3. Comandos e suites");
  const pkg = JSON.parse(readFileSync(join(RAIZ, "package.json"), "utf8"));
  const scripts: Record<string, string> = pkg.scripts ?? {};

  const inexistentes: string[] = [];
  for (const doc of DOCS) {
    for (const m of Array.from(textoDe(doc).matchAll(/npm run ([a-z0-9:_-]+)/g))) {
      if (!(m[1] in scripts)) inexistentes.push(`${doc}: npm run ${m[1]}`);
    }
  }
  check(
    "todo `npm run` citado existe no package.json",
    inexistentes.length === 0,
    Array.from(new Set(inexistentes)).slice(0, 12).join("\n       "),
  );

  // O inverso, sem depender de documentacao: toda suite em disco precisa de uma
  // porta de entrada, senao ela existe e ninguem roda.
  const emDisco = readdirSync(join(RAIZ, "scripts"))
    .filter((f) => f.endsWith(".test.ts"))
    .map((f) => `scripts/${f}`);
  const referidos = new Set(
    Object.values(scripts)
      .flatMap((cmd) => Array.from(cmd.matchAll(/scripts\/[A-Za-z0-9._-]+\.test\.ts/g)))
      .map((m) => m[0]),
  );
  const orfas = emDisco.filter((f) => !referidos.has(f)).sort();
  check("toda suite em scripts/ tem entrada no package.json", orfas.length === 0, orfas.join(", "));
}

// ------------------------------------------------------------- 4. travessao
/**
 * Rede de seguranca do hook `guarda-escrita.mjs`: o hook impede introduzir
 * travessao por Write/Edit, mas nao cobre arquivo que chegue por outro caminho
 * (patch, editor, colagem). Os legados ficam na linha de base ate serem
 * limpos, para a checagem nascer verde e ser levada a serio.
 */
const TRAVESSAO_LEGADO = new Set<string>([
  "prisma/migrations/20260711120000_whatsapp_provider_config/migration.sql",
  "prisma/migrations/20260724150000_user_must_change_password/migration.sql",
  "prisma/schema.prisma",
  "src/app/(dashboard)/minha-fazenda/page.tsx",
  "src/app/api/v1/pastures/route.ts",
  "src/lib/nav.ts",
  "docs/specs/module-30-rebanho-livro-razao.md",
]);

function conferirTravessao() {
  console.log("\n4. Travessao (invariante 4)");
  const novos: string[] = [];
  for (const rel of versionados()) {
    if (TRAVESSAO_LEGADO.has(rel)) continue;
    if (!/\.(md|ts|tsx|sql|json|mjs|js|prisma)$/.test(rel)) continue;
    const full = join(RAIZ, rel);
    if (!existsSync(full)) continue;
    if (readFileSync(full, "utf8").includes(TRAVESSAO)) novos.push(rel);
  }
  check(
    "nenhum arquivo ganhou travessao novo",
    novos.length === 0,
    novos.slice(0, 12).join("\n       "),
  );

  const limpos = Array.from(TRAVESSAO_LEGADO).filter((rel) => {
    const full = join(RAIZ, rel);
    return existsSync(full) && !readFileSync(full, "utf8").includes(TRAVESSAO);
  });
  if (limpos.length > 0) {
    console.log(`  ℹ️  ja sem travessao, remova da linha de base: ${limpos.join(", ")}`);
  }
}

// ------------------------------------------------- 5. indices parciais no SQL
/**
 * Dois indices unicos PARCIAIS nao sao representaveis no schema.prisma, entao
 * todo `prisma migrate diff` sugere um DROP deles como se fosse drift. A unica
 * protecao ate 2026-08-18 era um aviso em prosa, e ele cobria so um dos dois.
 * Um drop acidental nao quebraria suite nenhuma: passaria calado ate dois
 * providers ficarem ativos, ou dois brincos iguais entrarem no mesmo tenant.
 */
const INDICES_PARCIAIS: [string, string][] = [
  ["WhatsAppProviderConfig_one_active", "no maximo 1 provider WhatsApp ativo"],
  ["AnimalBatch_tenant_ear_tag_key", "brinco unico por tenant quando preenchido"],
];

function conferirIndicesParciais() {
  console.log("\n5. Indices parciais que o migrate diff tenta derrubar");
  const dir = join(RAIZ, "prisma", "migrations");
  const sql = readdirSync(dir)
    .filter((d) => statSync(join(dir, d)).isDirectory())
    .map((d) => join(dir, d, "migration.sql"))
    .filter(existsSync)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  for (const [nome, oQue] of INDICES_PARCIAIS) {
    const criado = new RegExp(`CREATE UNIQUE INDEX\\s+"${nome}"`).test(sql);
    const derrubado = new RegExp(`DROP INDEX[^;]*"${nome}"`).test(sql);
    check(`${nome} continua criado (${oQue})`, criado && !derrubado);
  }
}

// ------------------------------------------------------ 6. as travas de agente
const CASOS_HOOK: [string, Record<string, unknown>, number, string][] = [
  ["guarda-bash.mjs", { command: "cat > x.md <<EOF\nlinha \\t escape\nEOF" }, 2, "heredoc com escape"],
  ["guarda-bash.mjs", { command: "git push origin main" }, 2, "push na main"],
  ["guarda-bash.mjs", { command: "git merge estoque" }, 2, "merge"],
  ["guarda-bash.mjs", { command: "npx vercel --prod" }, 2, "deploy"],
  ["guarda-bash.mjs", { command: "cd x && git push origin main" }, 2, "push na main depois de &&"],
  ["guarda-bash.mjs", { command: "git push origin minha-branch" }, 0, "push de branch de trabalho"],
  ["guarda-bash.mjs", { command: "npm run test:m38" }, 0, "comando comum"],
  // Falsos positivos que a primeira versao produzia: a palavra dentro de aspas,
  // num comando que so LE. Bloquear isso ensina a contornar a trava.
  [
    "guarda-bash.mjs",
    { command: `node -e "const r=/vercel|git push|git merge/; console.log(r)"` },
    0,
    "as palavras dentro de aspas, num comando que so le",
  ],
  ["guarda-bash.mjs", { command: "grep -rn 'git push' docs/" }, 0, "procurar pela expressao num arquivo"],
  [
    "guarda-bash.mjs",
    { command: `git commit -m "trava: mencionar git push e git merge nao e executa-los"` },
    0,
    "commit cuja MENSAGEM cita os comandos proibidos",
  ],
  [
    "guarda-bash.mjs",
    { command: `git push origin "main"` },
    2,
    "push com o alvo escondido atras de aspas",
  ],
  // A valvula: existe para o caminho autorizado nao ser "desligar o hook", que
  // e o unico contorno que nao volta sozinho.
  [
    "guarda-bash.mjs",
    { command: "AUTORIZADO_PELO_USUARIO=1 git merge higiene-instrucoes" },
    0,
    "merge com a marca de autorizacao explicita",
  ],
  ["guarda-bash.mjs", { command: "git merge higiene-instrucoes" }, 2, "merge sem a marca"],
  ["guarda-escrita.mjs", { content: `frase ${TRAVESSAO} com travessao` }, 2, "Write com travessao"],
  ["guarda-escrita.mjs", { content: "frase limpa" }, 0, "Write limpo"],
  [
    "guarda-escrita.mjs",
    { content: `docs/Minha Fazenda ${TRAVESSAO} Especificacao Funcional.doc` },
    0,
    "citacao permitida",
  ],
];

function conferirHooks() {
  console.log("\n6. As travas de agente respondem nas duas bordas");
  for (const [hook, input, esperado, nome] of CASOS_HOOK) {
    const r = spawnSync("node", [join(RAIZ, ".claude", "hooks", hook)], {
      input: JSON.stringify({ tool_input: input }),
      encoding: "utf8",
    });
    check(
      `${esperado === 2 ? "recusa" : "deixa passar"}: ${nome}`,
      r.status === esperado,
      `exit ${r.status}`,
    );
  }
}

// -------------------------------------------- 7. numero escrito em portugues
/**
 * `<input type="number">` usa o parser do INGLES, e nao ha como troca-lo.
 * Medido no Chrome em 2026-08-20:
 *
 *   digitado "1.500,00"  ->  .value = ""       ->  Number() = 0
 *   digitado "1.500"     ->  .value = "1.500"  ->  Number() = 1.5
 *
 * com `validity.valid === true` nos dois. Um produtor que conta 1.500 cabecas
 * gravava 1,5, sem erro na tela. O comentario de `src/lib/numero-br.ts` conta
 * que esse mesmo defeito ja foi corrigido duas vezes e voltou nas duas, porque
 * a correcao era pontual e a tela seguinte nascia com `Number` cru de novo.
 *
 * Esta e a catraca: campo de dinheiro ou quantidade usa `MoneyInput`. A lista
 * abaixo e a linha de base, e ela so pode ENCOLHER.
 */
const NUMBER_PERMITIDO = new Set<string>([
  // Ano de fabricacao: inteiro de 4 digitos, sem milhar e sem decimal.
  "src/components/maquinas/machine-form.tsx",
]);

function conferirCamposNumericos() {
  console.log("\n7. Numero escrito em portugues (MoneyInput)");

  const ofensores: string[] = [];
  const permitidosLimpos: string[] = [];

  for (const rel of versionados()) {
    if (!rel.startsWith("src/") || !rel.endsWith(".tsx")) continue;
    const full = join(RAIZ, rel);
    if (!existsSync(full)) continue;
    // Sem os comentarios: um arquivo que EXPLICA por que nao se usa
    // `type="number"` estava sendo acusado de usar. Verificador que le codigo
    // nao pode tropecar em prosa.
    const semComentarios = readFileSync(full, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const temNumero = semComentarios.includes('type="number"');

    if (NUMBER_PERMITIDO.has(rel)) {
      if (!temNumero) permitidosLimpos.push(rel);
      continue;
    }
    if (temNumero) ofensores.push(rel);
  }

  check(
    'nenhuma tela nova com <input type="number">',
    ofensores.length === 0,
    ofensores.length > 0
      ? `use MoneyInput (src/components/ui/money-input.tsx):\n       ${ofensores.slice(0, 12).join("\n       ")}`
      : undefined,
  );

  if (permitidosLimpos.length > 0) {
    console.log(`  ℹ️  ja sem type="number", remova da linha de base: ${permitidosLimpos.join(", ")}`);
  }
}

// ------------------------------------------------- 8. cor crua do Tailwind
/**
 * A paleta semantica existe desde o `638d0f6`, mas o produto continua pintando
 * com a paleta crua do Tailwind. Medido em 2026-08-27: 966 ocorrencias em 131
 * arquivos fora da `/plataforma`.
 *
 * Isso importa alem do estilo. O `check-contraste.ts` confere os 25 pares de
 * token do `globals.css` e NAO enxerga `text-gray-500`, nem `text-white`. Foi
 * exatamente `text-white` sobre o verde da marca que deu 3,51:1 e reprovou em
 * AA, e foi um cinza claro a 2,85:1 que a mesma medicao pegou. Ou seja: a
 * catraca de contraste protegia a paleta que quase ninguem estava usando.
 *
 * `white` e `black` entram junto com a paleta numerada porque custam quase
 * nada: incluir os dois aumentou a linha de base de 123 para 125 arquivos,
 * ja que quase todo arquivo que pinta branco cru tambem pinta cinza cru.
 *
 * A linha de base em `baseline-cor-crua.json` so pode ENCOLHER. Arquivo novo
 * com cor crua reprova; arquivo da base que ficou limpo vira aviso para sair
 * da lista, e nunca o contrario.
 *
 * A `/plataforma` fica de fora, mesma excecao do `638d0f6`: aquele painel tem
 * casca escura, e la o cinza claro e a escolha certa.
 */
const COR_CRUA =
  /(text|bg|border)-(gray|slate|zinc|red|green|blue|yellow|amber|emerald)-[0-9]{2,3}|\b(bg|text|border)-(white|black)\b/;

function conferirCorCrua() {
  console.log("\n8. Cor crua do Tailwind (tokens semanticos)");

  const base = new Set<string>(
    JSON.parse(readFileSync(join(RAIZ, "scripts", "baseline-cor-crua.json"), "utf8")),
  );
  const ofensores: string[] = [];
  const limpos: string[] = [];

  for (const rel of versionados()) {
    if (!rel.startsWith("src/") || !rel.endsWith(".tsx")) continue;
    if (rel.includes("plataforma")) continue;
    const full = join(RAIZ, rel);
    if (!existsSync(full)) continue;
    const tem = COR_CRUA.test(readFileSync(full, "utf8"));

    if (base.has(rel)) {
      if (!tem) limpos.push(rel);
      continue;
    }
    if (tem) ofensores.push(rel);
  }

  check(
    "nenhuma tela nova pintando com a paleta crua",
    ofensores.length === 0,
    ofensores.length > 0
      ? `use os tokens de globals.css (texto, texto-secundario, superficie, borda...):\n       ${ofensores.slice(0, 12).join("\n       ")}`
      : undefined,
  );

  if (limpos.length > 0) {
    console.log(
      `  ℹ️  ja sem cor crua, remova de baseline-cor-crua.json (${limpos.length}): ${limpos.slice(0, 6).join(", ")}`,
    );
  }
}

function main() {
  console.log("🔎 Conferencia estatica do repositorio (sem banco)");
  conferirCaminhos();
  conferirRotas();
  conferirComandos();
  conferirTravessao();
  conferirIndicesParciais();
  conferirHooks();
  conferirContraste(check);
  conferirCamposNumericos();
  conferirCorCrua();

  console.log("");
  if (falhas === 0) console.log("✅ Repositorio consistente: 0 falhas.");
  else console.error(`❌ ${falhas} verificacao(oes) com erro.`);
  process.exit(falhas === 0 ? 0 : 1);
}

main();
