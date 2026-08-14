/**
 * As unidades de medida do §10.5.
 *
 * Constante de código, não tabela por tenant, ao contrário da CATEGORIA de
 * produto. A diferença: "saca" precisa significar a mesma coisa em todo tenant
 * para o saldo ser comparável e para o assistente entender "usei meia saca";
 * já "Herbicida" é um rótulo que cada fazenda inventa como quiser.
 *
 * Mesmo critério que separou as 12 categorias do rebanho (constante, porque
 * carregam sexo e faixa etária) das categorias financeiras (tabela).
 */

export type StockUnit = {
  id: string;
  /** Como aparece na tela e na conversa, no singular. */
  label: string;
  plural: string;
  /** Abreviação usada ao lado do número: "10 kg", "2,5 L". */
  abbr: string;
  /**
   * Se aceita quantidade fracionada. "0,5 saca" e "2,5 litros" são exemplos do
   * próprio §10.5; meia FERRAMENTA não existe, e aceitar seria deixar passar
   * um erro de digitação que o produtor não veria.
   */
  fracionavel: boolean;
};

export const STOCK_UNITS: StockUnit[] = [
  { id: "saca", label: "Saca", plural: "sacas", abbr: "sc", fracionavel: true },
  { id: "quilograma", label: "Quilograma", plural: "quilogramas", abbr: "kg", fracionavel: true },
  { id: "litro", label: "Litro", plural: "litros", abbr: "L", fracionavel: true },
  { id: "unidade", label: "Unidade", plural: "unidades", abbr: "un", fracionavel: false },
  { id: "frasco", label: "Frasco", plural: "frascos", abbr: "fr", fracionavel: false },
  { id: "caixa", label: "Caixa", plural: "caixas", abbr: "cx", fracionavel: false },
  { id: "pacote", label: "Pacote", plural: "pacotes", abbr: "pct", fracionavel: false },
  { id: "rolo", label: "Rolo", plural: "rolos", abbr: "rl", fracionavel: false },
  { id: "tonelada", label: "Tonelada", plural: "toneladas", abbr: "t", fracionavel: true },
  { id: "metro", label: "Metro", plural: "metros", abbr: "m", fracionavel: true },
  { id: "outro", label: "Outro", plural: "outros", abbr: "un", fracionavel: true },
];

const POR_ID = new Map(STOCK_UNITS.map((u) => [u.id, u]));

export function findUnit(id: string): StockUnit | null {
  return POR_ID.get(id) ?? null;
}

export function isStockUnit(id: unknown): id is string {
  return typeof id === "string" && POR_ID.has(id);
}

/**
 * "10 sacas", "0,5 saca", "2,5 litros".
 *
 * Singular quando a quantidade é exatamente 1, porque "1 sacas" é o tipo de
 * detalhe que faz o produtor achar que está falando com uma máquina. Meio não
 * é singular: "0,5 sacas" é o certo em português.
 */
export function descreverQuantidade(quantidade: number, unidadeId: string): string {
  const unidade = findUnit(unidadeId);
  const numero = quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  if (!unidade) return numero;
  return `${numero} ${quantidade === 1 ? unidade.label.toLowerCase() : unidade.plural}`;
}

/**
 * As 15 categorias iniciais do §9.1.
 *
 * Nascem na primeira vez que o tenant abre o Estoque (decisão do usuário,
 * 2026-08-14): sem migração de dado, funciona igual para tenant novo e antigo,
 * e um tenant que apagar todas não fica travado sem nenhuma.
 */
export const CATEGORIAS_INICIAIS = [
  "Sal mineral",
  "Ração",
  "Suplementos",
  "Sementes",
  "Medicamentos",
  "Vacinas",
  "Adubos",
  "Calcário",
  "Combustível",
  "Lubrificantes",
  "Materiais para cerca",
  "Ferramentas",
  "Peças",
  "Produtos veterinários",
  "Outros",
] as const;
