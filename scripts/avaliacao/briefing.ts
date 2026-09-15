// `./fazenda` importa `@/lib/prisma`, que exige `DATABASE_URL` definida para
// construir o client (mesmo sem rodar consulta nenhuma). Por isso o
// `dotenv/config`, sem `exigirBancoLocal()`: este CLI nunca abre conexão, só
// formata a constante `FAZENDA` e o registro de intenções.
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { descreverFazenda, descreverCatalogo } from "./fazenda";

/**
 * CLI: grava o briefing dos autores de casos em `scripts/avaliacao/briefing/`
 * (fazenda.md e catalogo.md). Roda: `npm run avaliacao:briefing`.
 */

const PASTA = path.join(__dirname, "briefing");

function main() {
  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(path.join(PASTA, "fazenda.md"), descreverFazenda());
  fs.writeFileSync(path.join(PASTA, "catalogo.md"), descreverCatalogo());
  console.log("Briefing gravado em scripts/avaliacao/briefing/fazenda.md e catalogo.md.");
}

main();
