import fs from "node:fs";
import path from "node:path";
import { validarCasos, particaoDoCaso, coberturaPorIntencao } from "./casos";
import type { Caso } from "./tipos";

/**
 * CLI: valida todo `scripts/avaliacao/casos/*.json` e imprime a cobertura por
 * intenção. Roda: `npm run avaliacao:validar`.
 */

const PASTA = path.join(__dirname, "casos");

function main() {
  const arquivos = fs.existsSync(PASTA) ? fs.readdirSync(PASTA).filter((f) => f.endsWith(".json")) : [];

  if (arquivos.length === 0) {
    console.log("Nenhum caso encontrado em scripts/avaliacao/casos/");
    process.exit(0);
  }

  let totalErros = 0;
  const todosCasos: Caso[] = [];

  for (const arquivo of arquivos) {
    let conteudo: unknown;
    try {
      conteudo = JSON.parse(fs.readFileSync(path.join(PASTA, arquivo), "utf8"));
    } catch (e) {
      console.log(`${arquivo}: JSON inválido (${e instanceof Error ? e.message : String(e)})`);
      totalErros += 1;
      continue;
    }
    const casos: unknown[] = Array.isArray(conteudo) ? conteudo : [];
    for (const erro of validarCasos(casos)) {
      console.log(`${arquivo}: ${erro}`);
      totalErros += 1;
    }
    for (const caso of casos) {
      if (typeof (caso as { id?: unknown })?.id === "string") todosCasos.push(caso as Caso);
    }
  }

  const total = coberturaPorIntencao(todosCasos);
  const ajuste = coberturaPorIntencao(todosCasos.filter((c) => particaoDoCaso(c) === "ajuste"));
  const final = coberturaPorIntencao(todosCasos.filter((c) => particaoDoCaso(c) === "final"));

  if (total.size > 0) {
    console.log("\nCobertura por intenção:");
    for (const [intent, totalCount] of Array.from(total.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const marca = totalCount < 5 ? " POUCO" : "";
      console.log(
        `${intent.padEnd(40)} total=${totalCount}  ajuste=${ajuste.get(intent) ?? 0}  final=${final.get(intent) ?? 0}${marca}`,
      );
    }
  }

  process.exit(totalErros > 0 ? 1 : 0);
}

main();
