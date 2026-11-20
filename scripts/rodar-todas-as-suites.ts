import "./_env-local";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Roda a suite inteira, uma por vez, e diz no fim o que passou e o que nao.
 *
 * A divida que isto fecha, registrada em `docs/agents/dividas.md`: existiam
 * dezenas de scripts `test:*` e NENHUM comando que rodasse todos. "Cada rodada
 * testa o que o autor lembrou de rodar", e encadear na mao estourava o timeout
 * do shell.
 *
 * Duas decisoes que fazem diferenca aqui:
 *
 * 1. **Nao para na primeira falha.** Parar esconderia as outras, e o valor de
 *    rodar tudo e justamente ver o conjunto. O codigo de saida no fim continua
 *    sendo 1 se qualquer uma falhou.
 * 2. **Recusa rodar contra producao.** As suites criam e apagam tenants; contra
 *    o Neon isso seria catastrofico. `exigirBancoLocal()` ja protege cada uma,
 *    mas a checagem aqui evita descobrir isso depois de 40 execucoes.
 *
 * Uso:
 *   DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:all
 *   npm run test:all -- --sem-redis    (pula as tres que dependem do Redis)
 *   npm run test:all -- --so=test:m1,test:m2    (roda so essas)
 */

const PULAR_COM_REDIS = process.argv.includes("--sem-redis");

/** `--so=test:m1,test:m2`: roda so essas (para provar o runner sem rodar tudo). */
const SO = (process.argv.find((a) => a.startsWith("--so=")) ?? "").slice(5).split(",").filter(Boolean);

/**
 * Teto por suíte. A mais demorada do projeto leva bem menos que isto; o valor
 * existe para que uma suíte que NÃO SAI sozinha não trave o runner inteiro.
 */
const TIMEOUT_POR_SUITE_MS = 4 * 60 * 1000;

/**
 * As tres que usam o Redis COMPARTILHADO com producao e falham na segunda
 * execucao da mesma hora, por lock diario ou limite de envio. Nao e regressao,
 * e esta documentado no CLAUDE.md.
 */
const DEPENDEM_DO_REDIS = new Set(["test:m4", "test:m19", "test:m24"]);

/**
 * Precisam de coisa que o runner nao controla, ou nao sao suite.
 *
 * `test:all` e ELE MESMO, e esquecer disso na primeira versao criou recursao
 * infinita: cada execucao lancava outra, e em minutos havia dezenas de
 * processos disputando o mesmo banco. O sintoma nao foi um erro, foi o runner
 * "demorando"; so olhando a lista de processos deu para ver. Fica explicito
 * aqui, e o teste abaixo garante que continue.
 */
const FORA = new Set(["test:drift", "test:all"]);

function suites(): string[] {
  const pkg = JSON.parse(readFileSync("package.json", "utf-8")) as {
    scripts: Record<string, string>;
  };
  return Object.keys(pkg.scripts)
    .filter((k) => k.startsWith("test:"))
    .filter((k) => !FORA.has(k))
    .filter((k) => !(PULAR_COM_REDIS && DEPENDEM_DO_REDIS.has(k)))
    .filter((k) => SO.length === 0 || SO.includes(k));
}

/**
 * A `m123` falhou uma vez dentro do `test:all` e passou nas rodadas seguintes, e o
 * motivo se perdeu porque a saida de quem falha era jogada fora. Agora toda suite
 * que falha ou trava deixa a saida (a que saiu ate a morte, se travou) em
 * `<tmpdir>/tibe-test-all/<suite>.log`.
 */
function gravarLog(suite: string, e: unknown): string {
  const dir = join(tmpdir(), "tibe-test-all");
  mkdirSync(dir, { recursive: true });
  const caminho = join(dir, `${suite.replace(/[^a-z0-9_-]/gi, "_")}.log`);
  const { stdout, stderr, message } = e as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string };
  const partes = [`# ${suite}`, `# ${message ?? ""}`, "", "## stdout", String(stdout ?? ""), "", "## stderr", String(stderr ?? "")];
  writeFileSync(caminho, partes.join("\n"), "utf-8");
  return caminho;
}

function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (/neon\.tech/i.test(url)) {
    console.error("Recusado: DATABASE_URL aponta para PRODUCAO.");
    console.error("As suites criam e apagam tenants. Passe a URL do Docker local:");
    console.error('  DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npm run test:all');
    process.exit(1);
  }

  const lista = suites();

  // Trava contra a recursao que ja aconteceu: se o proprio runner entrar na
  // lista, para antes de lancar o primeiro processo, em vez de descobrir isso
  // pela lista de processos vinte minutos depois.
  if (lista.includes("test:all")) {
    console.error("Recusado: `test:all` esta na propria lista, o que criaria recursao infinita.");
    process.exit(1);
  }

  console.log(`Rodando ${lista.length} suites, uma por vez.`);
  if (PULAR_COM_REDIS) console.log("(pulando as que dependem do Redis compartilhado)");
  console.log("");

  const falharam: string[] = [];
  const travaram = new Set<string>();
  const logs = new Map<string, string>();
  const inicio = Date.now();

  for (const suite of lista) {
    const t0 = Date.now();
    console.log(`  ${suite.padEnd(18)} rodando...`);
    try {
      execSync(`npm run ${suite}`, {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf-8",
        // Duas travas aprendidas do jeito difícil, na primeira execução deste
        // script: ela acumulou 25 processos pendurados e nunca terminou.
        //
        // `timeout` mata a suíte que não sai sozinha (uma conexão de banco ou
        // de Redis que fica aberta segura o processo), em vez de deixar o
        // runner esperando para sempre por ela.
        timeout: TIMEOUT_POR_SUITE_MS,
        killSignal: "SIGKILL",
        // `maxBuffer` porque as suítes grandes (m17, m38) imprimem uma linha
        // por asserção e passam do 1 MB padrão.
        maxBuffer: 64 * 1024 * 1024,
      });
      console.log(`  ${suite.padEnd(18)} ok    ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e) {
      const estourou = (e as { signal?: string })?.signal === "SIGKILL";
      const motivo = estourou ? "TRAVOU" : "FALHOU";
      console.log(`  ${suite.padEnd(18)} ${motivo} ${Math.round((Date.now() - t0) / 1000)}s`);
      falharam.push(suite);
      if (estourou) travaram.add(suite);
      try {
        logs.set(suite, gravarLog(suite, e));
      } catch (erroDoLog) {
        // Nao gravar o log nunca pode derrubar o runner: so avisa.
        logs.set(suite, `(nao foi possivel gravar o log: ${(erroDoLog as Error).message})`);
        console.warn(`  aviso: log de ${suite} nao gravado: ${(erroDoLog as Error).message}`);
      }
    }
  }

  const minutos = Math.round((Date.now() - inicio) / 60000);
  console.log("");
  console.log(`${lista.length - falharam.length}/${lista.length} passaram, em ~${minutos} min.`);

  if (falharam.length > 0) {
    console.log("");
    console.log("Falharam:");
    for (const s of falharam) {
      const nota = DEPENDEM_DO_REDIS.has(s)
        ? "  (usa o Redis compartilhado: pode ser lock da hora, nao regressao)"
        : "";
      console.log(`  ${s}${travaram.has(s) ? " (travou)" : ""}${nota}`);
      console.log(`    saida: ${logs.get(s)}`);
    }
    console.log("");
    console.log("A saida de cada uma esta no log acima. Para rodar de novo: npm run <suite>");
    process.exit(1);
  }
}

main();
