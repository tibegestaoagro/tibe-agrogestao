#!/usr/bin/env node
/**
 * Recusa escrita que INTRODUZA travessao (U+2014), o invariante 4.
 *
 * Existe porque a regra ja vinha escrita em negrito, com o comando de
 * verificacao ao lado dela, e mesmo assim havia 8 arquivos versionados com
 * travessao em 2026-08-18, incluindo o proprio CLAUDE.md. Uma regra que depende
 * de alguem lembrar no momento da escrita falha, por melhor que esteja escrita.
 *
 * Bloqueia so o que for INTRODUZIDO. Parte das ocorrencias existentes e
 * legitima: cita o nome real de um arquivo do cliente, que tem travessao no
 * nome e nao pode ser reescrito sem deixar de apontar para o arquivo.
 */

// Pelo ponto de codigo: escrito literal, este arquivo violaria a propria regra
// que ele existe para impor, e o `npm run check` o acusaria com razao.
const TRAVESSAO = String.fromCharCode(0x2014);

/**
 * Citacoes legitimas: nomes de arquivo do cliente, que existem em disco com
 * travessao. Reescrever aqui quebraria o ponteiro para o documento.
 */
const PERMITIDOS = [
  new RegExp(`Minha Fazenda ${TRAVESSAO} Especifica`),
  new RegExp(`TIBÉ ${TRAVESSAO} `),
];

function lerEntrada() {
  return new Promise((resolve) => {
    let bruto = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (p) => (bruto += p));
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(bruto));
      } catch {
        // Falha aberta: um formato de entrada inesperado nao pode travar toda
        // escrita do agente.
        resolve(null);
      }
    });
  });
}

/** Devolve as linhas com travessao que NAO sao citacao permitida. */
function linhasProibidas(texto) {
  if (typeof texto !== "string" || !texto.includes(TRAVESSAO)) return [];
  return texto
    .split("\n")
    .filter((l) => l.includes(TRAVESSAO) && !PERMITIDOS.some((p) => p.test(l)));
}

const entrada = await lerEntrada();
const input = entrada?.tool_input ?? {};

// Write manda `content`; Edit manda `new_string`. So o texto que ENTRA e
// verificado: o `old_string` pode conter travessao legado sem que isso seja
// culpa desta edicao.
const candidatos = [input.content, input.new_string].filter(
  (t) => typeof t === "string",
);

const ofensoras = candidatos.flatMap(linhasProibidas);

if (ofensoras.length > 0) {
  const amostra = ofensoras
    .slice(0, 3)
    .map((l) => `  ${l.trim().slice(0, 90)}`)
    .join("\n");
  process.stderr.write(
    `Bloqueado: a escrita introduz travessao (${TRAVESSAO}), proibido no ` +
      `projeto (invariante 4 do CLAUDE.md).\n\n` +
      `${ofensoras.length} linha(s), por exemplo:\n${amostra}\n\n` +
      "Caminho certo: use dois pontos, virgula, parenteses ou ponto final. " +
      "Em tabela markdown, use hifen simples.",
  );
  process.exit(2);
}

process.exit(0);
