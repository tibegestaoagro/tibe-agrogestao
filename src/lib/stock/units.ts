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
  /**
   * Gênero gramatical, para o assistente escrever "QuantOS litros" e "QuantAS
   * sacas".
   *
   * Sem isto, a pergunta mais frequente do módulo saía "Quantas litros de Óleo
   * diesel?" em 6 das 11 unidades, e a confirmação dizia "30 litros usadAS". O
   * §2 do documento exige que a área não pareça sistema, e concordância
   * quebrada é a primeira coisa que o produtor lê. Achado por um revisor
   * independente lendo as mensagens em voz alta, não por teste.
   */
  genero: "m" | "f";
};

export const STOCK_UNITS: StockUnit[] = [
  { id: "saca", label: "Saca", plural: "sacas", abbr: "sc", fracionavel: true, genero: "f" },
  { id: "quilograma", label: "Quilograma", plural: "quilogramas", abbr: "kg", fracionavel: true, genero: "m" },
  { id: "litro", label: "Litro", plural: "litros", abbr: "L", fracionavel: true, genero: "m" },
  { id: "unidade", label: "Unidade", plural: "unidades", abbr: "un", fracionavel: false, genero: "f" },
  { id: "frasco", label: "Frasco", plural: "frascos", abbr: "fr", fracionavel: false, genero: "m" },
  { id: "caixa", label: "Caixa", plural: "caixas", abbr: "cx", fracionavel: false, genero: "f" },
  { id: "pacote", label: "Pacote", plural: "pacotes", abbr: "pct", fracionavel: false, genero: "m" },
  { id: "rolo", label: "Rolo", plural: "rolos", abbr: "rl", fracionavel: false, genero: "m" },
  { id: "tonelada", label: "Tonelada", plural: "toneladas", abbr: "t", fracionavel: true, genero: "f" },
  { id: "metro", label: "Metro", plural: "metros", abbr: "m", fracionavel: true, genero: "m" },
  { id: "outro", label: "Outro", plural: "outros", abbr: "un", fracionavel: true, genero: "m" },
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
/** "1 saca disponível", "3 sacas disponíveis". */
export function disponiveis(quantidade: number): string {
  return quantidade === 1 ? "disponível" : "disponíveis";
}

export function descreverQuantidade(quantidade: number, unidadeId: string): string {
  const unidade = findUnit(unidadeId);
  const numero = quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  if (!unidade) return numero;
  return `${numero} ${quantidade === 1 ? unidade.label.toLowerCase() : unidade.plural}`;
}

/**
 * A recusa do §10.5, escrita UMA vez.
 *
 * Devolve `null` quando a quantidade serve, e a mensagem para o produtor quando
 * não serve. Meia saca existe; meia enxada não.
 *
 * EXISTE PORQUE A REGRA ESTAVA EM CINCO LUGARES, com duas redações diferentes:
 * duas vezes no livro-razão, duas no handler de WhatsApp e uma na tela. Foi
 * assim que a leitura de número ficou corrigida no WhatsApp e errada na tela
 * por uma rodada inteira, transformando 1.500 em 1,5. Regra repetida é regra
 * que só é corrigida onde alguém apontou.
 */
export function recusaPorFracao(
  nomeDoProduto: string,
  quantidade: number,
  unidadeId: string,
): string | null {
  const unidade = findUnit(unidadeId);
  if (!unidade || unidade.fracionavel || Number.isInteger(quantidade)) return null;
  /**
   * Frase NEUTRA de verdade.
   *
   * A tentativa anterior ("é medido em") ainda concordava no masculino, e
   * "Enxada é medido" continuava errado: o nome do produto é livre, então
   * nenhuma forma flexionada serve. A saída é não flexionar nada, começando
   * pela unidade em vez do produto.
   */
  // Sem flexionar o nome do produto (gênero livre) e sem a circularidade de "a
  // unidade de X é unidades". A frase fala do NÚMERO, que é o que foi recusado.
  return `${nomeDoProduto} só entra em ${unidade.plural} inteiras, sem quantidade quebrada.`;
}

/** "Quantas" para saca, "Quantos" para litro. */
export function quantosOuQuantas(unidadeId: string): string {
  return findUnit(unidadeId)?.genero === "f" ? "Quantas" : "Quantos";
}

/**
 * "usadas" para 10 sacas, "usados" para 10 litros, "usada" para 1 saca.
 *
 * Gênero E número. A primeira versão só trocava o gênero, e sobrava
 * "1 saca de sal usadas" e "1 litro de óleo usados": o singular é justamente
 * o caso mais comum de quem tira uma unidade de cada vez.
 */
export function concordar(
  palavraNoFemininoPlural: string,
  unidadeId: string,
  quantidade: number,
): string {
  const feminino = findUnit(unidadeId)?.genero === "f";
  const base = feminino
    ? palavraNoFemininoPlural
    : palavraNoFemininoPlural.replace(/as$/, "os").replace(/a$/, "o");
  return quantidade === 1 ? base.replace(/s$/, "") : base;
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
