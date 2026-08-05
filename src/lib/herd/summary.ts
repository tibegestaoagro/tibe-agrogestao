import { categoriesBySex, findCategory, type HerdSex } from "./categories";

/**
 * O resumo do rebanho que o §11 pede e o §12 exemplifica, derivado das
 * posições do livro-razão.
 *
 * Função PURA de propósito: recebe as posições já lidas e devolve os
 * agrupamentos. Nenhuma rota nova de somatório existe, e nenhuma precisa
 * existir: total geral, machos, fêmeas, por categoria, por fazenda e por
 * pasto saem todos da mesma lista que `GET /api/v1/herd/positions` devolve.
 * Somar no banco criaria um segundo caminho para o mesmo número, que é
 * exatamente o que o módulo inteiro foi desenhado para evitar.
 *
 * Aceita qualquer objeto com os campos usados (não importa tipo do Prisma):
 * assim continua testável sem banco, junto com as categorias.
 */
export type SummarizablePosition = {
  category_id: string;
  property_id: string;
  pasture_id: string | null;
  quantity: number;
};

export type CategoryLine = {
  id: string;
  label: string;
  quantity: number;
};

export type SexBlock = {
  sex: HerdSex;
  label: string;
  total: number;
  categories: CategoryLine[];
};

export type GroupLine = {
  id: string;
  quantity: number;
};

export type HerdSummary = {
  total: number;
  /** Fêmeas primeiro, na ordem do §12. */
  by_sex: SexBlock[];
  by_property: GroupLine[];
  /** Só posições com pasto informado: o §11 pede "quando utilizada". */
  by_pasture: GroupLine[];
  /**
   * Quantidade em categoria que não está mais na constante das 12. Deve ser
   * sempre 0; se não for, alguém removeu ou renomeou um id já gravado, e o
   * total geral estaria mentindo por omissão.
   */
  unknown_category_quantity: number;
};

function sumInto(map: Map<string, number>, key: string, quantity: number) {
  map.set(key, (map.get(key) ?? 0) + quantity);
}

function toLines(map: Map<string, number>): GroupLine[] {
  return Array.from(map.entries())
    .filter(([, quantity]) => quantity !== 0)
    .map(([id, quantity]) => ({ id, quantity }))
    .sort((a, b) => b.quantity - a.quantity);
}

export function summarizePositions(positions: SummarizablePosition[]): HerdSummary {
  const byCategory = new Map<string, number>();
  const byProperty = new Map<string, number>();
  const byPasture = new Map<string, number>();
  let unknown = 0;
  let total = 0;

  for (const position of positions) {
    if (position.quantity === 0) continue;
    total += position.quantity;
    sumInto(byProperty, position.property_id, position.quantity);
    if (position.pasture_id) sumInto(byPasture, position.pasture_id, position.quantity);
    if (findCategory(position.category_id)) {
      sumInto(byCategory, position.category_id, position.quantity);
    } else {
      unknown += position.quantity;
    }
  }

  // Toda categoria aparece, inclusive zerada: no exemplo do §12 o produtor lê
  // a lista inteira, e uma linha faltando confunde mais do que um zero.
  const block = (sex: HerdSex, label: string): SexBlock => {
    const categories = categoriesBySex(sex).map((category) => ({
      id: category.id,
      label: category.label,
      quantity: byCategory.get(category.id) ?? 0,
    }));
    return {
      sex,
      label,
      total: categories.reduce((sum, line) => sum + line.quantity, 0),
      categories,
    };
  };

  return {
    total,
    by_sex: [block("femea", "Fêmeas"), block("macho", "Machos")],
    by_property: toLines(byProperty),
    by_pasture: toLines(byPasture),
    unknown_category_quantity: unknown,
  };
}
