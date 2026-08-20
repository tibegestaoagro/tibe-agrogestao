import { log } from "@/lib/log";

/**
 * Mede o custo de uma leitura de saldo, e só fala quando o custo importa.
 *
 * Por que isto existe: `getPositions` e `getStockBalance` leem TODAS as
 * movimentações não canceladas do tenant e agregam em memória. Com a base de
 * hoje isso custa menos de um milissegundo, e o `EXPLAIN` no banco local dá
 * varredura sequencial de 11 páginas, o que é o plano correto para 238 linhas.
 *
 * O ponto é que esse número não diz nada sobre o futuro: a tabela cresce para
 * sempre e a leitura é O(histórico). O plano de evolução decidiu **não**
 * introduzir cache derivado agora, porque saldo gravado é exatamente o estrago
 * que o invariante 2 existe para impedir, e em vez disso escrever o gatilho
 * que autorizaria introduzir um dia.
 *
 * Este é o gatilho. Quando aparecer no log com frequência, a conversa sobre
 * cache derivado deixa de ser especulação e passa a ter número.
 *
 * O limite é generoso de propósito: log que aparece toda hora deixa de ser
 * lido, e o objetivo aqui é sinalizar mudança de patamar, não medir rotina.
 */
const LIMITE_MS = 500;
const LIMITE_LINHAS = 5000;

export function medirLeituraDeSaldo(
  operacao: "getPositions" | "getStockBalance",
  inicioEmMs: number,
  linhasLidas: number,
) {
  const duracao = Date.now() - inicioEmMs;
  if (duracao < LIMITE_MS && linhasLidas < LIMITE_LINHAS) return;

  log.warn("leitura de saldo passou do limite acordado", {
    code: operacao,
    duration_ms: duracao,
    // Quantas linhas do livro-razão foram lidas e somadas em memória. É o
    // número que cresce, e o que decide se vale um cache derivado.
    status: linhasLidas,
  });
}
