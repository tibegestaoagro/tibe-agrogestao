/**
 * Categorias comuns do agro (spec 4.3) + sugestão por palavra-chave a partir
 * das observações do lançamento. Roda no client, como pré-preenchimento
 * editável: nunca bloqueia o usuário de escolher outra categoria.
 */

export const FINANCIAL_CATEGORIES = [
  "Ração",
  "Combustível",
  "Mão de obra",
  "Manutenção",
  "Insumos",
  "Veterinário",
  "Outros",
] as const;

export type FinancialCategory = (typeof FINANCIAL_CATEGORIES)[number];

const KEYWORDS: Record<Exclude<FinancialCategory, "Outros">, string[]> = {
  "Ração": ["ração", "racao", "silagem", "suplemento"],
  "Combustível": ["combustível", "combustivel", "diesel", "gasolina", "etanol", "óleo diesel"],
  "Mão de obra": ["mão de obra", "mao de obra", "diária", "diaria", "funcionário", "funcionario", "salário", "salario"],
  "Manutenção": ["manutenção", "manutencao", "conserto", "reparo", "peça", "peca", "trator"],
  "Insumos": ["insumo", "fertilizante", "defensivo", "adubo", "semente", "herbicida"],
  "Veterinário": ["veterinário", "veterinario", "vacina", "remédio", "remedio", "medicamento"],
};

/** Sugere uma categoria a partir do texto de observações; "Outros" se nada bater. */
export function suggestCategory(notes: string): FinancialCategory {
  const text = notes.toLowerCase();
  for (const category of Object.keys(KEYWORDS) as (keyof typeof KEYWORDS)[]) {
    if (KEYWORDS[category].some((kw) => text.includes(kw))) {
      return category;
    }
  }
  return "Outros";
}
