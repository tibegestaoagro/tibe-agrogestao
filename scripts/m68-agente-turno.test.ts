import "dotenv/config";
import fs from "node:fs";
import { exigirBancoLocal } from "./_banco-local";

exigirBancoLocal();

/**
 * Agente do WhatsApp, Fase 2 (turno no Tibé). Spec:
 * docs/superpowers/specs/2026-09-14-agente-whatsapp-55-intencoes-design.md.
 * Nenhuma seção chama a OpenAI: o transporte do modelo é substituído.
 * Roda: `npm run test:m68`.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

async function main() {
  const { INTENTS } = await import("@/lib/whatsapp-intents");
  const { INTENCOES, INTENCOES_FORA_DO_CLASSIFICADOR, DOMINIOS, intencoesDoDominio } = await import("@/lib/agente/intencoes");

  console.log("1. Registro de intenções cobre o Tibé inteiro");
  const registradas = new Set(INTENCOES.map((i) => i.intent));
  for (const intent of INTENTS) {
    if (INTENCOES_FORA_DO_CLASSIFICADOR.includes(intent)) continue;
    check(`${intent} tem definição`, registradas.has(intent));
  }
  check("nenhuma intenção registrada duas vezes", registradas.size === INTENCOES.length);
  for (const d of DOMINIOS) check(`domínio ${d} tem ao menos uma intenção`, intencoesDoDominio(d).length > 0);

  // Cada campo declarado precisa aparecer, pelo nome, no arquivo do handler que atende a intenção.
  // O mapa intenção -> arquivo sai de whatsapp-router.ts (import dos handlers).
  const router = fs.readFileSync("src/lib/actions/whatsapp-router.ts", "utf8");
  for (const def of INTENCOES) {
    const handler = localizarHandler(router, def.intent);
    check(`${def.intent}: handler localizado`, handler !== null, "adicione o mapeamento em localizarHandler");
    if (!handler) continue;
    const fonte = fs.readFileSync(handler, "utf8");
    for (const campo of def.campos) {
      check(`${def.intent}.${campo.nome} é lido pelo handler`, fonte.includes(campo.nome));
    }
    check(`${def.intent}: tem ao menos 2 exemplos`, def.exemplos.length >= 2);
  }
}

/**
 * Descobre o arquivo do handler de uma intenção lendo o roteador: a tabela
 * `intent -> função` (o Record `HANDLERS`) e os imports
 * `from "@/lib/actions/whatsapp-handlers/<arquivo>"`.
 *
 * A tabela tem duas formas de linha: `intent: funcao,` (nome diferente) e a
 * forma curta `intent,` (import cujo nome já É o da intenção, caso de
 * `ajuda` e `resumo`). Sem a segunda forma, as duas intenções desta tarefa
 * não seriam localizadas.
 */
function localizarHandler(router: string, intent: string): string | null {
  const linhaDaTabela = router.split("\n").find((l) => new RegExp(`^\\s*${intent}\\s*[,:]`).test(l));
  if (!linhaDaTabela) return null;
  const funcao = linhaDaTabela.match(/:\s*([A-Za-z0-9_]+)/)?.[1] ?? intent;
  const imp = router.match(new RegExp(`import\\s*\\{[^}]*\\b${funcao}\\b[^}]*\\}\\s*from\\s*"([^"]+)"`));
  if (!imp) return null;
  const caminho = imp[1].replace("@/", "src/");
  return fs.existsSync(`${caminho}.ts`) ? `${caminho}.ts` : null;
}

main()
  .then(() => {
    console.log(falhas === 0 ? "\n✅ M68: 0 falhas." : `\n❌ M68: ${falhas} falha(s).`);
    process.exit(falhas === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error("\n❌ M68 quebrou:", e);
    process.exit(1);
  });
