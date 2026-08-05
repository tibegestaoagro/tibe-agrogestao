import {
  CATEGORY_ALIASES,
  HERD_CATEGORIES,
  categoriesBySex,
  findCategory,
  isValidCategory,
  nextCategoryByAge,
  resolveCategoryTerm,
} from "@/lib/herd/categories";
import { summarizePositions } from "@/lib/herd/summary";

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

// O produtor fala no plural, e os exemplos do §13 do cliente são todos assim.
check("plural: 'vacas' resolve como 'vaca'", resolveCategoryTerm("vacas").kind === "exact");
check("plural: 'bezerros' resolve", resolveCategoryTerm("bezerros").kind === "exact");
check("plural: 'bois' resolve", resolveCategoryTerm("bois").kind === "exact");
check(
  "plural NÃO atropela a ambiguidade: 'novilhas' continua ambíguo",
  resolveCategoryTerm("novilhas").kind === "ambiguous",
);
check(
  "rótulo oficial (termina em 'meses') não é estropiado pelo plural",
  resolveCategoryTerm("Fêmea - 13 a 24 meses").kind === "exact",
);
check("termo desconhecido não vira chute", resolveCategoryTerm("jumento").kind === "unknown");
check(
  "todo apelido aponta só para categoria que existe",
  Object.values(CATEGORY_ALIASES).every((ids) => ids.every((id) => isValidCategory(id))),
);

console.log("\n5. Busca");
check("findCategory devolve null para id inexistente", findCategory("nao_existe") === null);
check("isValidCategory recusa id inventado", !isValidCategory("boi_gordo"));

console.log("\n6. Resumo do rebanho (§11 e §12), sobre as posições do livro-razão");

// Os números do exemplo do §12 do documento do cliente, na íntegra: 117
// fêmeas + 58 machos = 175. Se este bloco quebrar, o resumo deixou de bater
// com o exemplo que o cliente escreveu.
const exemplo12 = [
  ["bezerra_0_7", 21],
  ["femea_8_12", 12],
  ["femea_13_24", 25],
  ["femea_25_36", 14],
  ["femea_36_mais", 45],
  ["bezerro_0_7", 18],
  ["macho_8_12", 10],
  ["macho_13_24", 16],
  ["macho_25_36", 8],
  ["macho_36_mais", 3],
  ["garrote_reprodutor", 2],
  ["tourinho_reprodutor", 1],
] as const;

const resumo = summarizePositions(
  exemplo12.map(([category_id, quantity]) => ({
    category_id,
    property_id: "fazenda_santa_helena",
    pasture_id: null,
    quantity,
  })),
);

const femeas = resumo.by_sex[0];
const machos = resumo.by_sex[1];

check("total geral bate com o §12 (175)", resumo.total === 175, String(resumo.total));
check("fêmeas vêm primeiro, como no §12", femeas.sex === "femea");
check("total de fêmeas bate (117)", femeas.total === 117, String(femeas.total));
check("total de machos bate (58)", machos.total === 58, String(machos.total));
check(
  "as 5 categorias de fêmea aparecem na ordem do documento",
  femeas.categories.map((c) => c.id).join(",") ===
    "bezerra_0_7,femea_8_12,femea_13_24,femea_25_36,femea_36_mais",
);
check(
  "as 7 de macho terminam nas duas reprodutivas",
  machos.categories.map((c) => c.id).slice(-2).join(",") ===
    "garrote_reprodutor,tourinho_reprodutor",
);
check("por fazenda soma o total", resumo.by_property[0]?.quantity === 175);
check("sem pasto informado, não inventa linha de pasto", resumo.by_pasture.length === 0);
check("nenhuma quantidade em categoria desconhecida", resumo.unknown_category_quantity === 0);

const comZero = summarizePositions([
  { category_id: "femea_36_mais", property_id: "p1", pasture_id: null, quantity: 5 },
]);
check(
  "categoria sem saldo continua na lista, com zero",
  comZero.by_sex[1].categories.length === 7 &&
    comZero.by_sex[1].categories.every((c) => c.quantity === 0),
);

const comPasto = summarizePositions([
  { category_id: "femea_36_mais", property_id: "p1", pasture_id: "pasto_a", quantity: 30 },
  { category_id: "macho_36_mais", property_id: "p1", pasture_id: "pasto_b", quantity: 12 },
  { category_id: "bezerro_0_7", property_id: "p2", pasture_id: null, quantity: 8 },
]);
check("por pasto lista só quem tem pasto", comPasto.by_pasture.length === 2);
check("por pasto vem do maior para o menor", comPasto.by_pasture[0].id === "pasto_a");
check("por fazenda separa as duas", comPasto.by_property.length === 2);
check("total soma as três posições", comPasto.total === 50, String(comPasto.total));

const posicaoZerada = summarizePositions([
  { category_id: "femea_36_mais", property_id: "p1", pasture_id: "pasto_a", quantity: 0 },
]);
check("posição zerada não vira linha de fazenda nem de pasto",
  posicaoZerada.by_property.length === 0 && posicaoZerada.by_pasture.length === 0);

const categoriaSumida = summarizePositions([
  { category_id: "categoria_que_alguem_removeu", property_id: "p1", pasture_id: null, quantity: 9 },
]);
check(
  "categoria fora da constante é denunciada, não somem 9 cabeças em silêncio",
  categoriaSumida.unknown_category_quantity === 9 && categoriaSumida.total === 9,
);

console.log(
  falhas === 0
    ? `\n✅ Categorias e resumo do rebanho: 0 falhas.`
    : `\n❌ Categorias e resumo do rebanho: ${falhas} falha(s).`,
);
process.exit(falhas === 0 ? 0 : 1);
