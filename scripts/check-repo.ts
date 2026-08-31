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
  .concat(
    mdsDe("docs", "agents"),
    // O cofre entra pelo mesmo motivo: nota que cita caminho morto envelhece
    // igual, e la o engano e pior, porque a nota se apresenta como licao.
    mdsDe("docs", "conhecimento"),
    mdsDe(".claude", "rules"),
  )
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
 *
 * ⚠️ **Dois furos fechados em 2026-08-31 (T09), achados por dois agentes de
 * tela que pararam ao esbarrar em cor que a regex nao enxergava:**
 *
 * 1. `divide-*` nao entrava no prefixo casado, so `text|bg|border`. Um
 *    `divide-gray-100` pinta a borda entre linhas de lista/tabela igual a um
 *    `border-gray-200`, e passava direto. Achadas 7 ocorrencias em 6 arquivos
 *    no total, **5 delas (em 4 arquivos) dentro de `src/app/(dashboard)/`**:
 *    o painel que `dividas.md` §2.5 declara "inteiro em token semantico" nao
 *    estava. Foram para a catraca (fora do escopo desta frente, que e o site
 *    publico), nao corrigidas aqui.
 * 2. A lista de cores cobria so 9 das 22 famílias do Tailwind. Faltavam
 *    neutral, stone, orange, lime, teal, cyan, sky, indigo, violet, purple,
 *    fuchsia, pink e rose: um badge roxo (`bg-purple-100`) podia viver sem
 *    nunca ser visto. Medido em 2026-08-31: zero ocorrencias reais no
 *    repositorio hoje, mas a lacuna era real (foi assim que a `divide` viveu).
 *
 * `ring-` entrou pelo mesmo motivo de `divide-`: pinta um contorno visivel
 * (`focus:ring-gray-900`), e so nao aparece na linha de base porque as 2
 * ocorrencias encontradas estao em `src/app/plataforma/login/page.tsx`, ja
 * fora do escopo pelo filtro de `/plataforma`.
 *
 * Tambem entraram `from|via|to` (parada de gradiente), `placeholder`, `caret`,
 * `accent`, `decoration`, `fill` e `stroke`: todos pintam pixel visivel e
 * escondem cinza cru do mesmo jeito que `text`/`bg`/`border` escondiam. Nenhum
 * tem ocorrencia hoje fora de `/plataforma`, entao a extensao nao encolheu nem
 * cresceu a linha de base por si so; e defesa contra o proximo furo, nao
 * limpeza retroativa.
 *
 * **A catraca cresceu nesta mesma rodada (2026-08-31, T09), autorizado pelo
 * usuario.** A linha de base tinha 52 entradas antes desta frente. Saem 22
 * (o site publico inteiro, ja convertido para token). Isso baixaria para 30,
 * mas os 4 arquivos do item 1 (`alert-preference-toggles.tsx`,
 * `configuracoes/assinatura/page.tsx`, `dashboard/page.tsx`,
 * `relatorios/page.tsx`) entram porque a regex nova os enxerga pela primeira
 * vez: era divida pre-existente que a regex antiga nunca soube ver, nao
 * regressao introduzida por esta frente. Resultado: 30 -> 34. Registrado aqui
 * porque "so encolhe" e o principio, e um crescimento sem essa nota no
 * comentario pareceria violacao dele para quem ler depois.
 */
const CORES_TAILWIND =
  "gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const PREFIXOS_QUE_PINTAM =
  "text|bg|border|divide|ring|from|via|to|placeholder|caret|accent|decoration|fill|stroke";
// Exportada para a m50 (scripts/m50-site-publico-em-token.test.ts) importar em
// vez de duplicar: uma regex copiada fica presa no dia em que foi copiada, e
// foi assim que a m50 ficou meses atras desta ao vivo em 2026-08-31.
export const COR_CRUA = new RegExp(
  `(${PREFIXOS_QUE_PINTAM})-(${CORES_TAILWIND})-[0-9]{2,3}|\\b(${PREFIXOS_QUE_PINTAM})-(white|black)\\b`,
);

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

/**
 * Todo `HerdMovementType` tem rotulo em portugues na tela do Rebanho.
 *
 * Sem esta trava, um tipo novo aparece no extrato do produtor com o nome CRU
 * do enum (`envio_boitel`, `permuta_saida`): nome de coluna de banco na tela,
 * pior do que a "linguagem de sistema contabil" que o paragrafo 2 do documento
 * do cliente proibe. Os oito tipos das fases 2 e 3 do Modulo 30 ficaram sem
 * rotulo desde que nasceram, e so apareceram na validacao ao vivo da missao 4
 * do Modulo 31: a suite inteira estava verde o tempo todo.
 */
function conferirRotulosDeMovimento() {
  console.log("\n9. Rotulo de movimentacao do rebanho");

  const schema = readFileSync(join(RAIZ, "prisma", "schema.prisma"), "utf8");
  const bloco = schema.match(/enum HerdMovementType \{([^}]*)\}/);
  if (!bloco) {
    check("enum HerdMovementType encontrado no schema", false);
    return;
  }
  const tipos = bloco[1]
    .split("\n")
    .map((l) => l.replace(/\/\/\/.*/, "").trim())
    .filter((l) => l.length > 0 && /^[a-z_]+$/.test(l));

  const pagina = readFileSync(
    join(RAIZ, "src", "app", "(dashboard)", "rebanho", "page.tsx"),
    "utf8",
  );
  const mapa = pagina.match(/const TIPO_LABEL: Record<string, string> = \{([\s\S]*?)\n\};/);
  if (!mapa) {
    check("TIPO_LABEL encontrado na tela de Rebanho", false);
    return;
  }

  const semRotulo = tipos.filter((t) => !new RegExp(`\\b${t}:`).test(mapa[1]));
  check(
    `os ${tipos.length} tipos de movimentacao tem rotulo em portugues`,
    semRotulo.length === 0,
    semRotulo.length > 0
      ? `sem rotulo em TIPO_LABEL (o extrato mostraria o nome do enum): ${semRotulo.join(", ")}`
      : undefined,
  );
}

/**
 * Quem escreve tem que dizer quando falha.
 *
 * O padrao `if (res.ok) router.refresh()` sem nenhum `else` deixa a tela MUDA
 * quando o servidor recusa: o produtor clica, nada acontece, e ele nao sabe se
 * funcionou. O `pay-button.tsx` teve esse defeito ate 2026-08-20; outros
 * quatro sobreviveram com ele por mais de uma semana, incluindo o de mudar
 * permissao de usuario, porque ninguem varreu o resto. Esta trava e a
 * varredura, automatica.
 *
 * Linha de base propria, que so ENCOLHE, pelo mesmo desenho da cor crua.
 */
function conferirRecusaTratada() {
  console.log("\n10. Recusa do servidor tratada na tela");

  const base = new Set<string>(
    JSON.parse(readFileSync(join(RAIZ, "scripts", "baseline-recusa-engolida.json"), "utf8")),
  );
  const ofensores: string[] = [];
  const limpos: string[] = [];

  for (const rel of versionados()) {
    if (!rel.startsWith("src/") || !rel.endsWith(".tsx")) continue;
    const full = join(RAIZ, rel);
    if (!existsSync(full)) continue;
    const s = readFileSync(full, "utf8");
    if (!/apiPost|apiPut|apiPatch/.test(s)) continue;
    // A CHAMADA, nao o import. A primeira versao aceitava a palavra `toast`
    // solta, que casa com `from "@/components/ui/toast"`: todo arquivo que
    // importasse passava, mesmo sem nunca avisar nada. Descoberto no passo que
    // exige quebrar a trava de proposito antes de confiar nela.
    const trata = /\baviso\.\w+\(|doServidor\(|setErro\(|setError\(|\btoast\.\w+\(/.test(s);

    if (base.has(rel)) {
      if (trata) limpos.push(rel);
      continue;
    }
    if (!trata) ofensores.push(rel);
  }

  check(
    "todo painel que escreve avisa quando o servidor recusa",
    ofensores.length === 0,
    ofensores.length > 0
      ? "use useAviso() como em pay-button.tsx, ou o kit de erro de formulario:\n       " +
        ofensores.join("\n       ")
      : undefined,
  );

  if (limpos.length > 0) {
    console.log(
      `  ℹ️  ja trata a recusa, remova de baseline-recusa-engolida.json (${limpos.length}): ${limpos.slice(0, 6).join(", ")}`,
    );
  }
}

/**
 * Painel de escrita nasce no kit.
 *
 * Um componente client que ESCREVE e tem campo de formulario precisa do
 * `FormSheet`: e ele que poe a recusa do servidor embaixo do campo certo, move
 * o foco para o primeiro invalido e conta a tentativa. Sem esta trava, o
 * vigesimo painel nasce como os dezenove nasceram.
 *
 * Botao de acao sem campo nenhum nao entra: nao ha o que converter, e por isso
 * o filtro exige `<Input`, `<Select` ou `MoneyInput` antes de cobrar.
 *
 * ⚠️ TRES itens da linha de base sao EXCECAO PERMANENTE, nao divida:
 *
 * - `postpone-button.tsx` (um campo de data) e `user-row-actions.tsx` (um
 *   seletor de permissao) sao controles INLINE numa linha de tabela.
 *   Converte-los a `FormSheet` trocaria um gesto de um clique por um painel
 *   lateral que abre, o que e pior para o produtor. Decisao do usuario em
 *   2026-08-28. Os dois ja tratam a recusa do servidor, que era o que faltava
 *   de verdade neles.
 * - `subscribe-form.tsx` e pagamento: o RESULTADO (QR Code do PIX, linha
 *   digitavel do boleto) precisa ficar na tela para ser escaneado ou copiado,
 *   e painel que fecha no sucesso levaria o QR embora. Nao tem campo de texto,
 *   entao o defeito da tecla de confirmar do teclado tambem nao se aplica. Ele
 *   usa `Field` nos dois seletores, que era o que faltava nele (os rotulos
 *   eram `<label>` sem `htmlFor`).
 */
function conferirPainelNoKit() {
  console.log("\n11. Painel de escrita usa o kit");

  const base = new Set<string>(
    JSON.parse(readFileSync(join(RAIZ, "scripts", "baseline-painel-fora-do-kit.json"), "utf8")),
  );
  const ofensores: string[] = [];
  const limpos: string[] = [];

  for (const rel of versionados()) {
    if (!rel.startsWith("src/") || !rel.endsWith(".tsx")) continue;
    if (rel.includes("platform") || rel.includes("plataforma")) continue;
    if (rel.startsWith("src/components/ui/")) continue;
    const full = join(RAIZ, rel);
    if (!existsSync(full)) continue;
    const s = readFileSync(full, "utf8");
    if (!/apiPost|apiPut|apiPatch/.test(s)) continue;
    if (!/<Input|<Select|MoneyInput/.test(s)) continue;
    const noKit = s.includes("FormSheet");

    if (base.has(rel)) {
      if (noKit) limpos.push(rel);
      continue;
    }
    if (!noKit) ofensores.push(rel);
  }

  check(
    "todo painel de escrita com campo usa FormSheet",
    ofensores.length === 0,
    ofensores.length > 0
      ? `use FormSheet + Field + useErrosDeFormulario, como em stay-form.tsx:\n       ${ofensores.join("\n       ")}`
      : undefined,
  );

  if (limpos.length > 0) {
    console.log(
      `  ℹ️  ja no kit, remova de baseline-painel-fora-do-kit.json (${limpos.length}): ${limpos.slice(0, 6).join(", ")}`,
    );
  }
}

/**
 * 12. A recusa do Zod nao pode sair crua da rota.
 *
 * Ate 2026-08-29 as 71 rotas do produto faziam a mesma linha:
 *
 *     return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
 *
 * Dois defeitos numa linha so. O texto era o default do Zod, em INGLES: quem
 * cadastrava maquina com custo negativo lia "Too small: expected number to be
 * >=0". E o `field` nao atravessava, entao a recusa caia no rodape do painel
 * em vez de embaixo do campo, e o produtor tinha que adivinhar qual dos oito
 * corrigir. Nada disso aparecia em teste: as suites leem `code`, nao a frase.
 *
 * `apiErroDeZod(parsed.error)` resolve os dois. Esta trava existe porque a
 * linha errada e mais curta de escrever que a certa, e a proxima rota nasce
 * copiando a vizinha.
 */
function conferirRecusaDeZodCrua() {
  console.log("\n12. Recusa do Zod dita em portugues");

  const ofensores: string[] = [];
  for (const rel of versionados()) {
    if (!rel.startsWith("src/app/api/") || !rel.endsWith(".ts")) continue;
    const full = join(RAIZ, rel);
    if (!existsSync(full)) continue;
    if (/\.error\.issues\[0\]\.message/.test(readFileSync(full, "utf8"))) {
      ofensores.push(rel);
    }
  }

  check(
    "nenhuma rota devolve a mensagem crua do Zod",
    ofensores.length === 0,
    ofensores.length > 0
      ? `use apiErroDeZod(parsed.error), que traduz e leva o campo junto:\n       ${ofensores.join("\n       ")}`
      : undefined,
  );
}

// ------------------------------------------------- 13. cofre de conhecimento
/**
 * 13. O cofre de conhecimento nao pode apodrecer em silencio.
 *
 * `docs/conhecimento/` e a camada de memoria longa: uma nota por licao, ligadas
 * por `[[wikilink]]`. Ela existe porque o `current-handoff.md` tem teto de 200
 * linhas (autoimposto depois de chegar a 1.316), e toda rodada a licao
 * aprendida era resumida destrutivamente para caber, ou caia no despejo
 * cronologico de `historico/`, de onde nao se recupera por assunto.
 *
 * Uma pasta de notas ligadas apodrece igual a documentacao: o link quebra e
 * ninguem ve, porque nada reclama. Esta trava e a conferencia 1 (caminho citado
 * que nao existe) aplicada ao wikilink, que o Obsidian resolve na interface mas
 * nao valida em lugar nenhum.
 *
 * Arquivos com prefixo `_` sao pulados de proposito: `_template.md` PRECISA
 * mostrar a sintaxe num exemplo que nao resolve, e `_indice.md` e navegacao.
 */
function conferirCofreDeConhecimento() {
  console.log("\n13. Cofre de conhecimento");

  const dir = join(RAIZ, "docs", "conhecimento");
  if (!existsSync(dir)) {
    check("docs/conhecimento existe", false, "o cofre sumiu do repositorio");
    return;
  }

  const notas = readdirSync(dir).filter(
    (f) => f.endsWith(".md") && !f.startsWith("_"),
  );
  const existentes = new Set(notas.map((f) => f.replace(/\.md$/, "")));
  const TIPOS = new Set(["licao", "decisao", "armadilha", "referencia"]);

  const quebrados: string[] = [];
  const malFormadas: string[] = [];

  for (const nome of notas) {
    const texto = readFileSync(join(dir, nome), "utf8");

    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto);
    const tipo = fm ? /^tipo:\s*(\S+)/m.exec(fm[1])?.[1] : undefined;
    const temData = fm ? /^data:\s*\d{4}-\d{2}-\d{2}\s*$/m.test(fm[1]) : false;
    if (!tipo || !TIPOS.has(tipo) || !temData) malFormadas.push(nome);

    // `[[alvo|texto]]` e `[[alvo#secao]]` sao formas validas no Obsidian: o
    // alvo e so o que vem antes do primeiro separador.
    for (const m of texto.matchAll(/\[\[([^\]]+)\]\]/g)) {
      const alvo = m[1].split("|")[0].split("#")[0].trim();
      if (!existentes.has(alvo)) quebrados.push(`${nome} -> [[${alvo}]]`);
    }
  }

  check(
    "todo [[wikilink]] aponta para uma nota que existe",
    quebrados.length === 0,
    quebrados.length > 0
      ? `crie a nota ou corrija o link:\n       ${quebrados.join("\n       ")}`
      : undefined,
  );

  check(
    "toda nota tem tipo valido e data absoluta",
    malFormadas.length === 0,
    malFormadas.length > 0
      ? `tipo em (licao|decisao|armadilha|referencia) e data YYYY-MM-DD:\n       ${malFormadas.join("\n       ")}`
      : undefined,
  );
}

// ------------------------------------- 14. elemento que some dentro do pai
/**
 * 14. Elemento cujo fundo repete o do container que o envolve, no MESMO
 * arquivo `.tsx`.
 *
 * Duas mordidas do mesmo defeito: uma pilula `bg-tibe-light` sobre a pagina
 * (o alias aponta para `--superficie-afundada`, o proprio fundo do painel) em
 * 31/08, e dois `<code className="bg-atencao-suave">` dentro de um
 * `<div className="bg-atencao-suave">`, achados por julgamento independente,
 * nao por conferencia nenhuma. O `check-contraste.ts` nunca pegaria isso: ele
 * compara PAR (texto, fundo), e aqui falta o par fundo-contra-fundo do
 * proprio container. Ver
 * docs/conhecimento/pilula-invisivel-o-portao-compara-token-nao-uso.md e
 * docs/conhecimento/portao-mede-a-relacao-que-lhe-deram.md.
 *
 * UNIDADE que esta trava mede: o ARQUIVO `.tsx`, com o aninhamento
 * reconstruido por um scanner de tags feito a mao (nao ha parser de JSX
 * aqui). Compara o token de fundo de um elemento contra o token do
 * ANCESTRAL MAIS PROXIMO que TAMBEM declara um fundo, pulando envoltorios
 * transparentes: e o que de fato fica atras do elemento na tela, nao
 * necessariamente o pai imediato.
 *
 * Onde ela erra, de proposito, para o lado do falso negativo:
 *  - So le `className="..."` ou `className='...'` LITERAL. `cn(...)`, crase
 *    com `${}`, ternario fora de string: invisiveis para esta conferencia.
 *  - Ignora `bg-` com variante (`hover:bg-x`, `sm:bg-x`, `focus:bg-x`, etc):
 *    aquilo nao e o fundo em repouso, e cobrar isso acusaria hover legitimo
 *    como se fosse o elemento sumindo o tempo todo.
 *  - Nao atravessa fronteira de componente: um `<Card className="bg-x">`
 *    cujo `Card` pinta OUTRO fundo por baixo, em outro arquivo, fica fora.
 *  - Nao enxerga borda nem sombra: um elemento com o MESMO token do
 *    container mas com borda visivel entre os dois nao é, de fato, invisivel,
 *    e esta trava acusaria do mesmo jeito. Nao ha ocorrencia assim hoje (a
 *    varredura no repositorio real da zero), mas e a categoria de falso
 *    positivo que se essa trava vai cometer se o padrao aparecer.
 *  - O scanner e regex/estado, nao AST: um generico de seta em `.tsx`
 *    (`<T,>(x: T) => x`) pode ser lido como abertura de tag e desalinhar a
 *    pilha de aninhamento dali em diante. Checado: zero ocorrencias hoje.
 *
 * Os alias depreciados contam como o mesmo token: `bg-tibe-light` E
 * `--superficie-afundada`, `bg-tibe-dark` E `--superficie-invertida`, e os
 * demais do bloco `tibe` em `tailwind.config.ts`.
 */
const ALIAS_TIBE: Record<string, string> = {
  "tibe-primary": "primaria",
  "tibe-dark": "superficie-invertida",
  "tibe-darkest": "sobre-primaria",
  "tibe-light": "superficie-afundada",
  "tibe-accent": "acento",
  "tibe-accentDark": "acento-hover",
  "tibe-accentLight": "acento-suave",
};

const RE_NOME_TAG = /^[A-Za-z][\w.]*/;
const RE_CLASSNAME_LITERAL = /className\s*=\s*(["'])([\s\S]*?)\1/;
const RE_CLASSNAME_QUALQUER = /className\s*=/;
// `bg-x` so conta se NAO vier precedido de `:` (variante: `hover:bg-x`,
// `sm:bg-x`, `dark:bg-x`...), porque aquele fundo so aparece condicionalmente,
// nunca em repouso.
const RE_BG = /(^|\s)bg-([A-Za-z][A-Za-z0-9-]*)((?:\/\d+)?)(?=\s|$)/;

/** Assinatura do fundo declarado num `className` literal, ou `null`. */
function sigDeClassName(literal: string): string | null {
  const m = RE_BG.exec(literal);
  if (!m) return null;
  const token = ALIAS_TIBE[m[2]] ?? m[2];
  return token + (m[3] ?? "");
}

/**
 * Le o fundo de uma tag a partir dos seus atributos crus, em TRES estados,
 * nao dois. Confundir os dois ultimos foi o bug que gerou um falso positivo
 * real (ver o comentario grande acima): um cartao com `className={\`...\`}`
 * (crase, dinamico) tem fundo OPACO de verdade, mas esta conferencia nao
 * consegue LER qual; tratar isso como "transparente" deixa a busca subir a
 * pilha e casar com um ancestral distante que nunca fica visivel de verdade.
 *
 *  - `sig` preenchido: fundo conhecido, estatico.
 *  - `sig: null, dinamico: false`: sem `className`, ou `className` estatico
 *    sem `bg-`. Comprovadamente transparente: a busca pode atravessar.
 *  - `sig: null, dinamico: true`: tem `className`, mas nao literal
 *    (`{...}`, crase, `cn(...)`). Fundo desconhecido, PODE ser opaco: a busca
 *    para aqui, sem concluir nada, a favor do falso negativo.
 */
function fundoDaTag(attrs: string): { sig: string | null; dinamico: boolean } {
  const literal = RE_CLASSNAME_LITERAL.exec(attrs);
  if (literal) return { sig: sigDeClassName(literal[2]), dinamico: false };
  const temClassName = RE_CLASSNAME_QUALQUER.test(attrs);
  return { sig: null, dinamico: temClassName };
}

type EventoTag = {
  tipo: "abre" | "fecha" | "auto";
  nome: string;
  sig: string | null;
  dinamico: boolean;
  linha: number;
};

/**
 * Acha o `>` que fecha a tag a partir de `inicio` (logo apos o nome),
 * pulando conteudo dentro de `{ }` e de aspas, para um `disabled={x > 0}`
 * nao ser confundido com o fim da tag.
 */
function proximoFechamentoDeTag(
  texto: string,
  inicio: number,
): { fim: number; selfClose: boolean } {
  let i = inicio;
  let chaves = 0;
  let aspas: string | null = null;
  while (i < texto.length) {
    const c = texto[i];
    if (aspas) {
      if (c === "\\") {
        i += 2;
        continue;
      }
      if (c === aspas) aspas = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      aspas = c;
      i++;
      continue;
    }
    if (c === "{") {
      chaves++;
      i++;
      continue;
    }
    if (c === "}") {
      chaves = Math.max(0, chaves - 1);
      i++;
      continue;
    }
    if (c === ">" && chaves === 0) {
      let j = i - 1;
      while (j > inicio && /\s/.test(texto[j])) j--;
      return { fim: i, selfClose: texto[j] === "/" };
    }
    i++;
  }
  return { fim: texto.length, selfClose: false };
}

/** Varre o arquivo e devolve a sequencia de aberturas/fechamentos de tag. */
export function varrerTags(texto: string): EventoTag[] {
  const eventos: EventoTag[] = [];
  let linha = 1;
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const c = texto[i];
    if (c === "\n") {
      linha++;
      i++;
      continue;
    }
    if (c !== "<") {
      i++;
      continue;
    }
    const anterior = i > 0 ? texto[i - 1] : "";
    const isClosing = texto[i + 1] === "/";
    // `Array<string>`, `useState<Foo>()`: generico de TS, nao tag JSX. So se
    // aplica a ABERTURA: um fechamento (`</p>`) nunca e generico de TS, e
    // aparece o tempo todo colado em texto (`Meu Dia</p>`), onde o caractere
    // anterior ao `<` E de identificador sem ser generico nenhum.
    if (!isClosing && /[\w$]/.test(anterior)) {
      i++;
      continue;
    }
    const p = i + (isClosing ? 2 : 1);
    if (texto[p] === ">") {
      // Fragmento `<>` ou `</>`.
      eventos.push({ tipo: isClosing ? "fecha" : "abre", nome: "Fragment", sig: null, dinamico: false, linha });
      i = p + 1;
      continue;
    }
    const mNome = RE_NOME_TAG.exec(texto.slice(p));
    if (!mNome) {
      // `<` que nao abre tag de verdade (comparacao, JSX que este scanner
      // nao reconhece). Avanca um caractere e segue.
      i++;
      continue;
    }
    const nome = mNome[0];
    const { fim, selfClose } = proximoFechamentoDeTag(texto, p + nome.length);
    const attrs = texto.slice(p + nome.length, fim);
    for (let k = i; k < fim; k++) if (texto[k] === "\n") linha++;
    if (isClosing) {
      eventos.push({ tipo: "fecha", nome, sig: null, dinamico: false, linha });
    } else {
      const { sig, dinamico } = fundoDaTag(attrs);
      eventos.push({ tipo: selfClose ? "auto" : "abre", nome, sig, dinamico, linha });
    }
    i = fim + 1;
  }
  return eventos;
}

type Colisao = { nomeFilho: string; nomeAncestral: string; token: string; linha: number };

/**
 * Passa a pilha sobre a sequencia de eventos: cada elemento com fundo e
 * comparado so contra o ANCESTRAL COM FUNDO MAIS PROXIMO (o primeiro achado
 * subindo a pilha), nunca contra todos os ancestrais, porque um envoltorio
 * comprovadamente transparente no meio nao muda o que fica visivel atras do
 * elemento.
 *
 * A subida PARA, sem concluir nada, ao encontrar um ancestral `dinamico`
 * (className nao literal): o fundo dele e desconhecido, pode ser opaco, e
 * pular por cima dele para casar com um ancestral mais distante ja gerou um
 * falso positivo real (cartao com `className={\`...\`}` dentro de uma pagina
 * com o mesmo token: o cartao e opaco na tela, so que esta conferencia nao
 * consegue ler o fundo dele).
 */
function acharColisoesDeFundo(eventos: EventoTag[]): Colisao[] {
  const pilha: { nome: string; sig: string | null; dinamico: boolean }[] = [];
  const colisoes: Colisao[] = [];
  for (const ev of eventos) {
    if (ev.tipo === "fecha") {
      pilha.pop();
      continue;
    }
    if (ev.sig) {
      for (let k = pilha.length - 1; k >= 0; k--) {
        if (pilha[k].sig) {
          if (pilha[k].sig === ev.sig) {
            colisoes.push({
              nomeFilho: ev.nome,
              nomeAncestral: pilha[k].nome,
              token: ev.sig,
              linha: ev.linha,
            });
          }
          break;
        }
        if (pilha[k].dinamico) break;
      }
    }
    if (ev.tipo === "abre") pilha.push({ nome: ev.nome, sig: ev.sig, dinamico: ev.dinamico });
  }
  return colisoes;
}

/**
 * Apaga o CONTEUDO do comentario, mas preserva toda quebra de linha interna:
 * um `replace` que sumisse com o `\n` empurraria todo numero de linha
 * reportado depois do comentario, e esta conferencia cita linha.
 */
function removerComentarios(texto: string): string {
  const semBloco = texto.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  return semBloco.replace(/^\s*\/\/.*$/gm, (m) => m.replace(/[^\n]/g, " "));
}

/** Ponto de entrada usado tanto pela conferencia quanto pelo teste da m50. */
export function acharColisoesEmTexto(texto: string): Colisao[] {
  return acharColisoesDeFundo(varrerTags(removerComentarios(texto)));
}

function conferirElementoQueSome() {
  console.log("\n14. Elemento que repete o fundo do que o contem");

  const ofensores: string[] = [];
  for (const rel of versionados()) {
    if (!rel.startsWith("src/") || !rel.endsWith(".tsx")) continue;
    const full = join(RAIZ, rel);
    if (!existsSync(full)) continue;
    const colisoes = acharColisoesEmTexto(readFileSync(full, "utf8"));
    for (const col of colisoes) {
      ofensores.push(
        `${rel}:${col.linha} <${col.nomeFilho}> repete bg-${col.token} de <${col.nomeAncestral}>`,
      );
    }
  }

  check(
    "nenhum elemento some contra o fundo do container",
    ofensores.length === 0,
    ofensores.length > 0
      ? `use um par de token diferente, ou tire o fundo do de dentro:\n       ${ofensores.slice(0, 12).join("\n       ")}`
      : undefined,
  );
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
  conferirRotulosDeMovimento();
  conferirRecusaTratada();
  conferirPainelNoKit();
  conferirRecusaDeZodCrua();
  conferirCofreDeConhecimento();
  conferirElementoQueSome();

  console.log("");
  if (falhas === 0) console.log("✅ Repositorio consistente: 0 falhas.");
  else console.error(`❌ ${falhas} verificacao(oes) com erro.`);
  process.exit(falhas === 0 ? 0 : 1);
}

// Guarda de entrypoint (mesmo padrao de check-contraste.ts): este modulo e
// importado por outras suites (a m50, por `COR_CRUA`), e sem a guarda o
// simples `import` dispararia a conferencia inteira, com o proprio
// `process.exit` no meio de um teste que so queria a regex.
if (require.main === module) {
  main();
}
