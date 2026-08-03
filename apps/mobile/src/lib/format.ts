/**
 * Formatação de exibição (moeda e data). Puramente apresentação: nenhuma
 * regra de negócio mora aqui (o que conta como "vencido", como o saldo é
 * calculado, etc. já vem pronto do back-end). Se um dia este arquivo
 * precisar decidir algo em vez de só formatar, é sinal de que a regra
 * deveria estar numa action do back-end, não aqui.
 */

export function formatCurrencyBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateBR(iso: string | null): string {
  if (!iso) return "sem data";
  return new Date(iso).toLocaleDateString("pt-BR");
}
