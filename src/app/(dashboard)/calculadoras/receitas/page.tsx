"use client";

import CalcPage, {
  type CalcField,
  type CalcOutcome,
  type LinhaDeIngrediente,
  type ValorDeCampo,
} from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { calcularMistura, RECEITAS_PADRAO } from "@/lib/calculadoras/mistura";

const FIELDS: CalcField[] = [
  {
    key: "ingredientes",
    label: "Ingredientes da receita",
    kind: "ingredientes",
    presets: RECEITAS_PADRAO,
    help: "As porcentagens precisam somar 100. O preco por quilo e opcional, e so entra no custo se todos tiverem.",
  },
  {
    key: "quantidadeFinalKg",
    label: "Quanto voce quer fazer",
    kind: "number",
    suffix: "kg",
    help: "Mude este numero e a receita inteira se recalcula na mesma proporcao.",
  },
  { key: "pesoSacaKg", label: "Peso da saca (opcional)", kind: "number", suffix: "kg" },
  {
    key: "consumoKgDiaPorAnimal",
    label: "Consumo por animal por dia (opcional)",
    kind: "number",
    suffix: "kg",
    help: "Preencha para saber quanto essa mistura custa por animal, por dia.",
  },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const linhas = (values.ingredientes as LinhaDeIngrediente[]).filter(
    (l) => l.nome.trim() !== "" || l.percentual.trim() !== "",
  );

  const r = calcularMistura({
    ingredientes: linhas.map((l) => {
      const preco = lerNumeroBr(l.preco);
      return {
        nome: l.nome,
        percentual: lerNumeroBr(l.percentual) ?? NaN,
        precoPorKg: preco ?? undefined,
      };
    }),
    quantidadeFinalKg: lerNumeroBr(values.quantidadeFinalKg) ?? NaN,
    pesoSacaKg: lerNumeroBr(values.pesoSacaKg) ?? undefined,
    consumoKgDiaPorAnimal: lerNumeroBr(values.consumoKgDiaPorAnimal) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    /* Um material por INGREDIENTE: o que se compra e milho e farelo, nao
       "mistura pronta". */
    materiais: r.data.ingredientes.map((i) => ({
      descricao: i.nome,
      quantidade: i.quantidadeKg,
      unidade: "quilograma",
    })),
    rows: [
      ...r.data.ingredientes.map((i) => ({
        label: `${i.nome} (${i.percentual}%)`,
        value: i.custo !== null ? `${i.quantidadeKg} kg, ${reaisBr(i.custo)}` : `${i.quantidadeKg} kg`,
        highlight: true,
      })),
      ...(r.data.sacas !== null ? [{ label: "Isso corresponde a", value: `${r.data.sacas} sacas` }] : []),
      ...(r.data.custoTotal !== null
        ? [{ label: "Custo total da mistura", value: reaisBr(r.data.custoTotal) }]
        : []),
      ...(r.data.custoPorKg !== null
        ? [{ label: "Custo por quilo", value: `${reaisBr(r.data.custoPorKg)}/kg` }]
        : []),
      ...(r.data.custoPorSaca !== null
        ? [{ label: "Custo por saca", value: reaisBr(r.data.custoPorSaca) }]
        : []),
      ...(r.data.custoDiarioPorAnimal !== null
        ? [{ label: "Custo por animal, por dia", value: reaisBr(r.data.custoDiarioPorAnimal) }]
        : []),
    ],
  };
}

export default function ReceitasPage() {
  return (
    <CalcPage
      title="Receitas e misturas"
      description="Quanto de cada ingrediente entra na quantidade que voce quer fazer, e quanto isso custa."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "A conta e regra de tres, e por isso a confianca e alta. A RECEITA em si e sua ou do seu tecnico: as " +
        "tres prontas oferecidas aqui sao pontos de partida de uso corrente, nao formulacao validada para o seu " +
        "rebanho. Balanceamento por exigencia animal e formulacao nutricional profissional ficam fora, como o " +
        "documento do cliente pede. O custo so aparece quando todos os ingredientes tem preco: com um faltando, " +
        "o total sairia menor que o real."
      }
    />
  );
}
