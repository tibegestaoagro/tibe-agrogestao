#!/usr/bin/env node
/**
 * Recusa dois tipos de comando Bash, antes de rodarem.
 *
 * Existe porque as regras equivalentes viviam em prosa no CLAUDE.md, no topo,
 * em negrito, e mesmo assim foram violadas. Em 2026-08-18 um heredoc com `\t` e
 * `\n` gravou tabulacao e quebra de linha de verdade dentro de um arquivo, que
 * e exatamente o que o invariante 5 descreve. Texto nao impede; isto impede.
 *
 * Contrato do PreToolUse: escrever a razao em stderr e sair com codigo 2. A
 * razao volta para o modelo como feedback, entao ela precisa dizer o CAMINHO
 * CERTO, nao so "proibido".
 *
 * Sem dependencia externa de proposito: `jq` nao esta instalado nesta maquina,
 * e o hook precisa funcionar tambem no notebook.
 */

const ESCAPES_PERIGOSOS = /\\[ntr\\]|\\x[0-9a-fA-F]{2}|\\u[0-9a-fA-F]{4}/;

function lerEntrada() {
  return new Promise((resolve) => {
    let bruto = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (p) => (bruto += p));
    process.stdin.on("end", () => {
      try {
        resolve(JSON.parse(bruto));
      } catch {
        // Entrada ilegivel nao pode virar bloqueio: o hook falharia aberto para
        // qualquer mudanca de formato do harness, travando todo comando.
        resolve(null);
      }
    });
  });
}

function recusar(motivo) {
  process.stderr.write(motivo);
  process.exit(2);
}

/**
 * Heredoc que ESCREVE arquivo e carrega escape.
 *
 * So bloqueia quando as duas coisas acontecem juntas. Heredoc para alimentar um
 * comando (`git commit -F -`) sem escape nenhum e uso legitimo e frequente, e
 * bloquear tudo faria o agente contornar a trava em vez de aprender com ela.
 */
function heredocPerigoso(cmd) {
  if (!/<<-?\s*['"]?[A-Za-z_]/.test(cmd)) return null;
  if (!ESCAPES_PERIGOSOS.test(cmd)) return null;

  const achados = cmd.match(ESCAPES_PERIGOSOS);
  return (
    `Bloqueado: heredoc contendo escape (${achados[0]}).\n\n` +
    "Este ambiente corrompe a sequencia silenciosamente: `\\t` e `\\n` viram " +
    "tabulacao e quebra de linha de verdade dentro do arquivo, e o sintoma " +
    "parece bug de regra de negocio (invariante 5 do CLAUDE.md).\n\n" +
    "Caminho certo: use a ferramenta Write ou Edit para o conteudo. Se " +
    "precisar de um script, escreva o .py/.mjs com Write e so entao execute."
  );
}

/**
 * Os pedacos do comando que estao em POSICAO DE COMANDO.
 *
 * Sem isto a trava casava a palavra em qualquer lugar da linha, inclusive
 * dentro de aspas: um `node -e "...vercel..."` que so INSPECIONAVA uma lista de
 * permissoes foi bloqueado como se fosse deploy, e um `grep "git push"` teria o
 * mesmo destino. Trava que grita demais e trava que se aprende a contornar, que
 * e pior do que nao ter trava.
 *
 * A separacao e por `;`, `&&`, `||`, `|` e quebra de linha, ignorando
 * atribuicoes de variavel no inicio (`FOO=1 git push ...`).
 */
function segmentos(cmd) {
  // Separador DENTRO de aspas nao separa nada. Sem este passo, um
  // `node -e "/vercel|git push/"` era fatiado no proprio `|` da expressao
  // regular e um pedaco comecava com `git push`, bloqueando um comando que so
  // LE. Marcar e restaurar preserva o texto inteiro para as checagens.
  const SEPARADORES = ["|", ";", "&", "\n"];
  // Marcador pelo ponto de codigo: caractere de controle escrito literal no
  // fonte e invisivel no diff e some numa copia descuidada, que e a mesma
  // familia de armadilha do invariante 5.
  const marca = (i) => String.fromCharCode(1 + i);

  let dentro = null;
  let mascarado = "";
  for (const ch of cmd) {
    if (dentro) {
      if (ch === dentro) dentro = null;
      const i = SEPARADORES.indexOf(ch);
      mascarado += i >= 0 ? marca(i) : ch;
      continue;
    }
    if (ch === "'" || ch === '"') dentro = ch;
    mascarado += ch;
  }

  const restaura = (t) =>
    SEPARADORES.reduce((acc, sep, i) => acc.split(marca(i)).join(sep), t);

  return mascarado
    .split(/(?:\|\||&&|[;|\n])/)
    .map((t) => restaura(t).trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, ""))
    .filter(Boolean);
}

/**
 * Merge, push na main e deploy: sao do usuario, a cada vez (invariante 7).
 *
 * O push de branch de trabalho continua livre, porque a regra sempre distinguiu
 * os dois. Por isso a checagem olha o ALVO do push, nao o verbo. E so olha
 * segmento que COMECA com o comando: mencionar a palavra nao e executa-la.
 */
/**
 * Troca todo trecho entre aspas por um marcador.
 *
 * Segunda borda do mesmo erro: filtrar por inicio de segmento nao bastava,
 * porque `git commit -m "...git push..."` COMECA com git e a mensagem citava o
 * comando proibido. O que decide e o argumento nao-citado; texto entre aspas e
 * dado, nao comando.
 */
function semAspas(s) {
  return s.replace(/'[^']*'|"[^"]*"/g, " CITACAO ");
}

function precisaDeAutorizacao(cmd) {
  const limpo = segmentos(cmd)
    .filter((s) => /^(git|npx|vercel|pnpm|yarn)\b/.test(s))
    .join(" ; ")
    .replace(/\s+/g, " ");
  if (!limpo) return null;

  const t = semAspas(limpo);
  const push = /\bgit\s+push\b/.test(t);
  const miraMain =
    /\bgit\s+push\b[^;]*\b(main|master)\b/.test(t) ||
    (push && /\bgit\s+push\b\s*(--\S+\s*)*$/.test(t.trim())) ||
    // Alvo escondido atras de aspas: na duvida, pergunta. Desquotar a branch
    // resolve, e o custo de errar para o outro lado e empurrar na main sozinho.
    /\bgit\s+push\b[^;]*CITACAO/.test(t);
  if (push && miraMain) {
    return (
      "Bloqueado: push na main exige autorizacao explicita do usuario, a cada " +
      "vez (invariante 7 do CLAUDE.md).\n\n" +
      "Push de branch de trabalho continua livre: nomeie a branch " +
      "(`git push origin minha-branch`).\n\n" +
      "Se o usuario ja autorizou NESTA conversa, peca para ele confirmar de " +
      "novo em uma frase e so entao repita o comando."
    );
  }

  if (/\bgit\s+merge\b/.test(t)) {
    return (
      "Bloqueado: merge exige autorizacao explicita do usuario (invariante 7 " +
      "do CLAUDE.md). Pergunte antes, dizendo o que vai entrar na main."
    );
  }

  if (/\bvercel\b(?!\s+(env|ls|list|inspect|whoami|logs))/.test(t)) {
    return (
      "Bloqueado: deploy exige autorizacao explicita do usuario (invariante 7 " +
      "do CLAUDE.md). Lembre tambem do invariante 3: migracao ANTES do push."
    );
  }

  return null;
}

const entrada = await lerEntrada();
const cmd = entrada?.tool_input?.command;
if (typeof cmd === "string" && cmd.length > 0) {
  const motivo = heredocPerigoso(cmd) ?? precisaDeAutorizacao(cmd);
  if (motivo) recusar(motivo);
}
process.exit(0);
