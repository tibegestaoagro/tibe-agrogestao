/**
 * Sugestão de categoria por palavra-chave a partir das observações do
 * lançamento. Roda no client, como pré-preenchimento editável: nunca bloqueia
 * o usuário de escolher outra.
 *
 * ⚠️ **Este arquivo não é mais a lista de categorias.** Até a fase 35.1 ele
 * exportava `FINANCIAL_CATEGORIES`, sete nomes fixos, e era isso que o seletor
 * do painel e o handler do WhatsApp ofereciam: categoria criada pelo produtor
 * nunca aparecia em nenhum dos dois, e as 26 do §21 também não apareceriam. A
 * lista agora vem do banco (`listFinancialCategoriesAction`), e o que sobra
 * aqui é só o palpite. Os nomes abaixo precisam existir na lista padrão, senão
 * a sugestão cai fora dela e o chamador a descarta.
 */

/** Palavra-chave por categoria de DESPESA. A primeira que bater vence. */
const DESPESA: Record<string, string[]> = {
  "Confinamento/Boitel": ["confinamento", "boitel"],
  "Medicamentos e vacinas": [
    "vacina", "remédio", "remedio", "medicamento", "veterinário", "veterinario",
    "vermífugo", "vermifugo", "carrapaticida",
  ],
  "Sal e suplementos": ["sal ", "suplemento", "mineral", "núcleo", "nucleo"],
  "Alimentação animal": ["ração", "racao", "silagem", "feno", "milho moído", "milho moido"],
  "Sementes": ["semente"],
  "Adubos e corretivos": ["adubo", "fertilizante", "calcário", "calcario", "corretivo", "ureia", "herbicida", "defensivo"],
  "Combustíveis": ["combustível", "combustivel", "diesel", "gasolina", "etanol", "arla"],
  "Máquinas e manutenção": ["manutenção", "manutencao", "conserto", "reparo", "peça", "peca", "trator", "pneu"],
  "Mão de obra": ["mão de obra", "mao de obra", "diária", "diaria", "funcionário", "funcionario", "salário", "salario"],
  "Serviços terceirizados": ["terceirizado", "empreiteiro", "prestador"],
  "Cercas": ["cerca", "mourão", "mourao", "arame"],
  "Energia": ["energia", "conta de luz", "elétrica", "eletrica"],
  "Fretes e transportes": ["frete", "transporte", "carreto"],
  "Arrendamento": ["arrendamento", "aluguel"],
  "Administração": ["contador", "contabilidade", "cartório", "cartorio", "imposto", "taxa"],
};

/** Palavra-chave por categoria de RECEITA. */
const RECEITA: Record<string, string[]> = {
  "Venda de leite": ["leite"],
  "Venda de animais": ["venda de boi", "venda de gado", "bezerro", "novilha", "garrote", "venda de animal"],
  "Serviços com máquinas": ["hora máquina", "hora maquina", "colheita", "plantio para", "roçada", "rocada"],
  "Pastagem para terceiros": ["pastagem", "pasto para", "aluguel de pasto"],
  "Arrendamento recebido": ["arrendamento"],
  "Venda de máquinas e equipamentos": ["venda de trator", "venda de máquina", "venda de maquina", "venda de implemento"],
  "Venda de produtos": ["soja", "milho", "grão", "grao", "safra"],
};

/**
 * Sugere uma categoria a partir do texto de observações. Devolve `null` quando
 * nada bate: o chamador decide o que fazer, e não existe mais um "Outros"
 * embutido aqui, porque o nome dele depende do tipo do lançamento.
 */
export function suggestCategory(notes: string, entryType: "income" | "expense"): string | null {
  const text = notes.toLowerCase();
  const mapa = entryType === "income" ? RECEITA : DESPESA;
  for (const [categoria, palavras] of Object.entries(mapa)) {
    if (palavras.some((kw) => text.includes(kw))) return categoria;
  }
  return null;
}
