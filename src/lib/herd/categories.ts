/**
 * As 12 categorias do rebanho (Módulo 30, §4 e §5 do documento do cliente).
 *
 * Constante de código, não linha de banco editável, pelo mesmo motivo de
 * `PLAN_PRICES`: é metadado de produto do Tibé, não preferência do cliente.
 * Um nome de texto livre (que é o que `AnimalCategory` guardava) não sustenta
 * nada do que o documento pede:
 *
 * - §12 quer "total de machos" e "total de fêmeas": precisa do SEXO.
 * - §14 quer traduzir "novilha" numa faixa: precisa da IDADE.
 * - §9 quer mudança de categoria por envelhecimento: precisa da ORDEM.
 * - §10.6 dá prioridade às reprodutivas sobre as de idade.
 *
 * Se cada tenant pudesse editar, "total de machos" pararia de funcionar para
 * quem mexeu, e duas fazendas chamariam a mesma coisa de nomes diferentes,
 * quebrando o assistente.
 */

export type HerdSex = "macho" | "femea";

export type HerdCategory = {
  /** Chave estável, gravada no banco. Nunca mude uma que já existe. */
  id: string;
  /** Rótulo exato do documento do cliente. */
  label: string;
  sex: HerdSex;
  /** Faixa etária em meses. `null` em `max` significa "em diante". */
  min_months: number | null;
  max_months: number | null;
  /**
   * Categoria reprodutiva. §10.6: um animal aqui NÃO pode ser contado de novo
   * numa categoria de idade, senão o total do rebanho dobra o mesmo bicho.
   */
  reproductive: boolean;
};

export const HERD_CATEGORIES: readonly HerdCategory[] = [
  { id: "bezerro_0_7", label: "Bezerro - 0 a 7 meses", sex: "macho", min_months: 0, max_months: 7, reproductive: false },
  { id: "bezerra_0_7", label: "Bezerra - 0 a 7 meses", sex: "femea", min_months: 0, max_months: 7, reproductive: false },
  { id: "femea_8_12", label: "Fêmea - 8 a 12 meses", sex: "femea", min_months: 8, max_months: 12, reproductive: false },
  { id: "macho_8_12", label: "Macho - 8 a 12 meses", sex: "macho", min_months: 8, max_months: 12, reproductive: false },
  { id: "femea_13_24", label: "Fêmea - 13 a 24 meses", sex: "femea", min_months: 13, max_months: 24, reproductive: false },
  { id: "macho_13_24", label: "Macho - 13 a 24 meses", sex: "macho", min_months: 13, max_months: 24, reproductive: false },
  { id: "femea_25_36", label: "Fêmea - 25 a 36 meses", sex: "femea", min_months: 25, max_months: 36, reproductive: false },
  { id: "macho_25_36", label: "Macho - 25 a 36 meses", sex: "macho", min_months: 25, max_months: 36, reproductive: false },
  { id: "femea_36_mais", label: "Fêmea - acima de 36 meses", sex: "femea", min_months: 37, max_months: null, reproductive: false },
  { id: "macho_36_mais", label: "Macho - acima de 36 meses", sex: "macho", min_months: 37, max_months: null, reproductive: false },
  { id: "garrote_reprodutor", label: "Garrote reprodutor", sex: "macho", min_months: null, max_months: null, reproductive: true },
  { id: "tourinho_reprodutor", label: "Tourinho reprodutor", sex: "macho", min_months: null, max_months: null, reproductive: true },
] as const;

const BY_ID = new Map(HERD_CATEGORIES.map((c) => [c.id, c]));

export function findCategory(id: string): HerdCategory | null {
  return BY_ID.get(id) ?? null;
}

export function isValidCategory(id: string): boolean {
  return BY_ID.has(id);
}

export function categoriesBySex(sex: HerdSex): HerdCategory[] {
  return HERD_CATEGORIES.filter((c) => c.sex === sex);
}

/**
 * Próxima categoria por envelhecimento (§9), ou `null` quando não há para
 * onde subir (a última faixa, e as reprodutivas, que não envelhecem entre si).
 *
 * Serve para SUGERIR a mudança na interface, nunca para aplicá-la sozinho:
 * o §9 é explícito que na primeira versão a mudança é manual.
 */
export function nextCategoryByAge(id: string): HerdCategory | null {
  const atual = findCategory(id);
  if (!atual || atual.reproductive || atual.max_months === null) return null;
  // Extraído para constante local porque o TypeScript não preserva o
  // estreitamento de `atual.max_months` para dentro da closure do `find`.
  const limiteAtual = atual.max_months;
  return (
    HERD_CATEGORIES.find(
      (c) => c.sex === atual.sex && !c.reproductive && c.min_months === limiteAtual + 1,
    ) ?? null
  );
}

/**
 * Apelidos populares (§14). O produtor fala "novilha", não "Fêmea - 13 a 24
 * meses".
 *
 * Um apelido pode apontar para VÁRIAS categorias: é justamente por isso que o
 * §14 manda o assistente PERGUNTAR em vez de escolher. Um apelido com uma
 * única correspondência pode ser resolvido direto; com mais de uma, nunca.
 *
 * Esta tabela é o destino dos nomes que hoje estão em `AnimalCategory`
 * (Boi, Vaca, Novilha, Garrote...): eles não somem, mudam de papel. Eram
 * categoria, viram vocabulário.
 */
export const CATEGORY_ALIASES: Readonly<Record<string, readonly string[]>> = {
  bezerro: ["bezerro_0_7"],
  bezerra: ["bezerra_0_7"],
  "bezerro mamando": ["bezerro_0_7", "bezerra_0_7"],
  "bezerro desmamado": ["macho_8_12", "femea_8_12"],
  novilha: ["femea_8_12", "femea_13_24", "femea_25_36"],
  novilho: ["macho_8_12", "macho_13_24", "macho_25_36"],
  garrote: ["macho_13_24", "macho_25_36", "garrote_reprodutor"],
  vaca: ["femea_36_mais"],
  boi: ["macho_36_mais"],
  touro: ["tourinho_reprodutor"],
  tourinho: ["tourinho_reprodutor"],
  rês: ["femea_36_mais", "macho_36_mais"],
};

/**
 * Compara dois termos ignorando maiúscula e ACENTO, sem regex de caractere
 * combinante. `sensitivity: "base"` é a forma que o próprio Intl oferece
 * para isso: "femea" casa com "Fêmea", "res" com "rês".
 *
 * A tentativa anterior (normalizar em NFD e apagar a faixa combinante com
 * regex) exigia caracteres invisíveis no código-fonte, que sobrevivem mal a
 * edição automatizada e quebram sem ninguém ver.
 */
function mesmoTermo(a: string, b: string): boolean {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;
}

export type AliasResolution =
  | { kind: "exact"; category: HerdCategory }
  | { kind: "ambiguous"; candidates: HerdCategory[] }
  | { kind: "unknown" };

/**
 * Traduz o que o produtor escreveu numa categoria.
 *
 * Aceita tanto o id, quanto o rótulo oficial, quanto um apelido. Devolve
 * `ambiguous` em vez de chutar: o §14 fecha com "o sistema não deverá
 * escolher uma categoria sem confirmação", e essa é a regra que impede o
 * assistente de lançar 20 animais na faixa errada.
 */
export function resolveCategoryTerm(term: string): AliasResolution {
  const limpo = term.trim();

  const porId = HERD_CATEGORIES.find((c) => mesmoTermo(c.id, limpo));
  if (porId) return { kind: "exact", category: porId };

  const porRotulo = HERD_CATEGORIES.find((c) => mesmoTermo(c.label, limpo));
  if (porRotulo) return { kind: "exact", category: porRotulo };

  for (const [alias, ids] of Object.entries(CATEGORY_ALIASES)) {
    if (!mesmoTermo(alias, limpo)) continue;
    const candidatos = ids.map((id) => findCategory(id)).filter((c): c is HerdCategory => !!c);
    if (candidatos.length === 1) return { kind: "exact", category: candidatos[0] };
    return { kind: "ambiguous", candidates: candidatos };
  }

  return { kind: "unknown" };
}
