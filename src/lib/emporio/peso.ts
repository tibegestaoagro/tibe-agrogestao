/**
 * Peso do Empório (Q291): sempre CALCULADO a partir da quantidade-base, nunca gravado
 * (invariante 2). Módulo puro, sem dependência: serve às telas, aos papéis e às actions.
 */

const arred3 = (n: number): number => Math.round(n * 1000) / 1000;

export type ConteudoDoProduto = {
  base_unit: string;
  content_qty: number | null;
  content_unit: string | null;
};

/**
 * O peso do item em quilos, ou null quando não há como saber (litro, metro, unidade ou
 * apresentação sem conteúdo em quilograma). `baseQty` está na unidade-base do produto.
 */
export function pesoDoItemKg(produto: ConteudoDoProduto, baseQty: number): number | null {
  if (!Number.isFinite(baseQty)) return null;
  if (produto.base_unit === "quilograma") return arred3(baseQty);
  if (produto.base_unit === "tonelada") return arred3(baseQty * 1000);
  if (produto.content_unit === "quilograma" && produto.content_qty != null) {
    return arred3(baseQty * produto.content_qty);
  }
  return null;
}

/** Soma os itens com peso; `total_kg` é null quando nenhum item tem peso. */
export function pesoTotal(itens: (number | null)[]): { total_kg: number | null; sem_peso: number } {
  const com = itens.filter((p): p is number => p !== null);
  return {
    total_kg: com.length === 0 ? null : arred3(com.reduce((t, p) => t + p, 0)),
    sem_peso: itens.length - com.length,
  };
}

const PESO = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

/** "1.250 kg", "12,5 kg": padrão brasileiro, até 3 casas, sem zeros à direita. */
export function pesoBr(kg: number): string {
  return `${PESO.format(kg)} kg`;
}

/** "Peso total: 77 kg" ou "Peso total: 77 kg (1 item sem peso)"; nulo quando não há peso. */
export function textoDoPesoTotal(total_kg: number | null, sem_peso: number): string | null {
  if (total_kg === null) return null;
  const aviso = sem_peso > 0 ? ` (${sem_peso} ${sem_peso === 1 ? "item sem peso" : "itens sem peso"})` : "";
  return `Peso total: ${pesoBr(total_kg)}${aviso}`;
}
