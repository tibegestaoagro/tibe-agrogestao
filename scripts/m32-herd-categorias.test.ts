import {
  CATEGORY_ALIASES,
  HERD_CATEGORIES,
  categoriesBySex,
  findCategory,
  isValidCategory,
  nextCategoryByAge,
  resolveCategoryTerm,
} from "@/lib/herd/categories";

/**
 * Módulo 30, tarefa 1: as 12 categorias como constante.
 *
 * Tudo aqui é função PURA, sem banco: é o que permite provar as regras do
 * §4, §5, §9, §10.6 e §14 sem subir nada.
 */

let falhas = 0;
function check(nome: string, cond: boolean, detalhe?: string) {
  if (cond) console.log(`  ✅ ${nome}`);
  else {
    falhas += 1;
    console.log(`  ❌ ${nome}${detalhe ? ` -> ${detalhe}` : ""}`);
  }
}

console.log("🐄 Módulo 30: categorias do rebanho\n");

console.log("1. A lista (§5)");
check("são exatamente 12 categorias", HERD_CATEGORIES.length === 12, String(HERD_CATEGORIES.length));
check(
  "todo id é único",
  new Set(HERD_CATEGORIES.map((c) => c.id)).size === 12,
);
check(
  "todo rótulo é único",
  new Set(HERD_CATEGORIES.map((c) => c.label)).size === 12,
);
check("5 fêmeas por idade + nenhuma reprodutiva", categoriesBySex("femea").length === 5);
check("7 machos (5 por idade + 2 reprodutivas)", categoriesBySex("macho").length === 7);
check(
  "as 2 reprodutivas são as do documento",
  HERD_CATEGORIES.filter((c) => c.reproductive)
    .map((c) => c.id)
    .join(",") === "garrote_reprodutor,tourinho_reprodutor",
);

console.log("\n2. Faixas etárias não se sobrepõem (§4, evita contagem dupla)");
for (const sexo of ["macho", "femea"] as const) {
  const porIdade = categoriesBySex(sexo)
    .filter((c) => !c.reproductive)
    .sort((a, b) => (a.min_months ?? 0) - (b.min_months ?? 0));
  let ok = true;
  for (let i = 1; i < porIdade.length; i += 1) {
    const anterior = porIdade[i - 1];
    const atual = porIdade[i];
    if (anterior.max_months === null || atual.min_months !== anterior.max_months + 1) ok = false;
  }
  check(`faixas de ${sexo} são contíguas e sem buraco`, ok);
  check(
    `${sexo} começa em 0 e termina em aberto`,
    porIdade[0].min_months === 0 && porIdade[porIdade.length - 1].max_months === null,
  );
}

console.log("\n3. Envelhecimento (§9)");
check(
  "bezerro vira macho de 8 a 12",
  nextCategoryByAge("bezerro_0_7")?.id === "macho_8_12",
  nextCategoryByAge("bezerro_0_7")?.id,
);
check(
  "bezerra vira fêmea de 8 a 12",
  nextCategoryByAge("bezerra_0_7")?.id === "femea_8_12",
);
check(
  "fêmea de 25 a 36 vira acima de 36",
  nextCategoryByAge("femea_25_36")?.id === "femea_36_mais",
);
check("a última faixa não envelhece", nextCategoryByAge("macho_36_mais") === null);
check("reprodutiva não envelhece", nextCategoryByAge("tourinho_reprodutor") === null);
check(
  "envelhecer nunca troca de sexo",
  HERD_CATEGORIES.every((c) => {
    const p = nextCategoryByAge(c.id);
    return !p || p.sex === c.sex;
  }),
);

console.log("\n4. Termos populares (§14)");
const vaca = resolveCategoryTerm("vaca");
check("'vaca' resolve direto", vaca.kind === "exact" && vaca.category.id === "femea_36_mais");
const novilha = resolveCategoryTerm("novilha");
check(
  "'novilha' é AMBÍGUO, não chuta",
  novilha.kind === "ambiguous" && novilha.candidates.length === 3,
  novilha.kind,
);
check(
  "acento não importa: 'femea - 13 a 24 meses' acha o rótulo",
  resolveCategoryTerm("femea - 13 a 24 meses").kind === "exact",
);
check(
  "maiúscula não importa: 'VACA'",
  resolveCategoryTerm("VACA").kind === "exact",
);
check("id cru também resolve", resolveCategoryTerm("macho_8_12").kind === "exact");
check("termo desconhecido não vira chute", resolveCategoryTerm("jumento").kind === "unknown");
check(
  "todo apelido aponta só para categoria que existe",
  Object.values(CATEGORY_ALIASES).every((ids) => ids.every((id) => isValidCategory(id))),
);

console.log("\n5. Busca");
check("findCategory devolve null para id inexistente", findCategory("nao_existe") === null);
check("isValidCategory recusa id inventado", !isValidCategory("boi_gordo"));

console.log(
  falhas === 0
    ? `\n✅ Categorias do rebanho: 0 falhas.`
    : `\n❌ Categorias do rebanho: ${falhas} falha(s).`,
);
process.exit(falhas === 0 ? 0 : 1);
