/**
 * Falha se `prisma/schema.prisma` e as migracoes aplicadas contarem historias
 * diferentes. Existe para mecanizar o invariante 3 do CLAUDE.md: a Vercel faz
 * deploy automatico e o build NAO roda migracao, entao codigo e schema saem
 * dessincronizados por padrao e nada avisa.
 *
 * O ruido conhecido: dois indices unicos PARCIAIS nao sao representaveis no
 * schema.prisma, entao todo `migrate diff` sugere um DROP INDEX deles como se
 * fosse drift. Esses DROPs sao esperados e descartados aqui. Qualquer outra
 * coisa no diff e drift de verdade.
 *
 * Roda contra o banco apontado por DATABASE_URL, que em CI e um Postgres
 * efemero com as migracoes ja aplicadas. Nao escreve nada.
 */
import { execSync } from "node:child_process";

/** Os mesmos nomes que `scripts/check-repo.ts` confere existirem no SQL. */
const INDICES_PARCIAIS = [
  "WhatsAppProviderConfig_one_active",
  "AnimalBatch_tenant_ear_tag_key",
];

function diffContraOBanco(): string {
  // As mesmas flags que o CLAUDE.md documenta. `--from-config-datasource` le o
  // banco de DATABASE_URL, entao quem chama decide contra o que comparar.
  // Comando literal, sem nenhum dado de fora concatenado: nao ha o que escapar.
  // `execFileSync` seria o reflexo certo, mas no Windows o Node recusa spawnar
  // `npx.cmd` sem shell (EINVAL), e passar shell junto reabre o mesmo problema.
  return execSync(
    "npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script",
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

/**
 * O `.env` deste projeto aponta para o Neon de PRODUCAO. `migrate diff` so le,
 * mas comparar o schema de trabalho contra producao devolve um resultado que
 * parece drift e nao e, e a confusao ja custou caro aqui antes. Em CI a URL e
 * de um Postgres efemero; localmente, passe a do Docker inline.
 */
function recusarBancoDeProducao(url: string) {
  const producao = /neon\.tech|-pooler\./i.test(url);
  if (!producao) return;
  console.error("Recusado: DATABASE_URL aponta para o banco de producao (Neon).");
  console.error("");
  console.error("Este script compara o schema de trabalho com o banco, e rodar isso");
  console.error("contra producao mistura drift de verdade com trabalho em andamento.");
  console.error("");
  console.error("Em CI a URL e a do Postgres efemero. Localmente, passe a do Docker:");
  console.error('  DATABASE_URL="postgresql://tibe:tibe@127.0.0.1:55432/tibe_dev?schema=public" npx tsx scripts/ci-migration-drift.ts');
  process.exit(1);
}

/**
 * Um DROP INDEX de indice parcial conhecido nao e drift. A linha e descartada
 * junto com o comentario que o Prisma emite logo acima dela, quando emite.
 */
function ehRuidoConhecido(linha: string): boolean {
  const l = linha.trim();
  if (l === "" || l.startsWith("--")) return true;
  return INDICES_PARCIAIS.some(
    (nome) => l.includes(nome) && /DROP\s+INDEX/i.test(l),
  );
}

function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL nao definida: sem banco para comparar.");
    process.exit(1);
    return;
  }
  recusarBancoDeProducao(url);

  let sql: string;
  try {
    sql = diffContraOBanco();
  } catch (e) {
    console.error("Falha ao rodar `prisma migrate diff`:");
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
    return;
  }

  const restante = sql.split("\n").filter((linha) => !ehRuidoConhecido(linha));

  if (restante.length === 0) {
    console.log("OK: schema.prisma e as migracoes aplicadas estao de acordo.");
    console.log(
      `(descartados os DROP INDEX esperados de: ${INDICES_PARCIAIS.join(", ")})`,
    );
    return;
  }

  console.error("DRIFT: o schema.prisma tem mudanca sem migracao correspondente.");
  console.error("");
  console.error("O que o Prisma geraria para alcancar o schema:");
  console.error(restante.join("\n"));
  console.error("");
  console.error("Escreva a migracao antes do push. O caminho esta no CLAUDE.md,");
  console.error("secao de deploy: `migrate diff` para o SQL, depois `npm run db:deploy`.");
  process.exit(1);
}

main();
