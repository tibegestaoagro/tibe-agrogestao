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
 * Merge, push na main e deploy: sao do usuario, a cada vez (invariante 7).
 *
 * O push de branch de trabalho continua livre, porque a regra sempre distinguiu
 * os dois. Por isso a checagem olha o ALVO do push, nao o verbo.
 */
function precisaDeAutorizacao(cmd) {
  const limpo = cmd.replace(/\s+/g, " ");

  const push = /\bgit\s+push\b/.test(limpo);
  const miraMain =
    /\bgit\s+push\b[^&|;]*\b(main|master)\b/.test(limpo) ||
    (push && /\bgit\s+push\b\s*(--\S+\s*)*$/.test(limpo.trim()));
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

  if (/\bgit\s+merge\b/.test(limpo)) {
    return (
      "Bloqueado: merge exige autorizacao explicita do usuario (invariante 7 " +
      "do CLAUDE.md). Pergunte antes, dizendo o que vai entrar na main."
    );
  }

  if (/\bvercel\b(?!\s+(env|ls|list|inspect|whoami|logs))/.test(limpo)) {
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
