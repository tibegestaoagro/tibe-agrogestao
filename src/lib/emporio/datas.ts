/** Data de calendário "AAAA-MM-DD" (ou ISO completo) como "DD/MM/AAAA", sem passar por fuso. */
export function dataBr(iso: string): string {
  return iso.slice(0, 10).split("-").reverse().join("/");
}

/** Hoje em Brasília como "AAAA-MM-DD". */
export function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

const diaEmBrasilia = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

/**
 * O instante em que uma entrada de estoque com data escolhida pelo usuário
 * (a compra e o seu recebimento) entra no livro-razão (Q298).
 *
 * A tela manda só o dia, e o dia chegava carimbado ao meio-dia. A contagem
 * grava a hora exata. Então "contei às 14:13, zerou, e lancei a compra às
 * 14:16" ficava, no histórico, com a compra ANTES da contagem: o custo novo se
 * misturava com o estoque que não existia (TALCO/ GEL e ARUANA-PONTOS da
 * Agromax, 10/11/2026).
 *
 * Data de hoje (em Brasília) vira o momento do lançamento. Data de outro dia
 * fica como veio: a mercadoria chegou antes, e a contagem de hoje já a inclui.
 */
export function momentoDaEntrada(data: Date, agora: Date = new Date()): Date {
  return diaEmBrasilia(data) === diaEmBrasilia(agora) ? agora : data;
}
