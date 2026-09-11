"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { calcularSementes, TAXAS_SUGERIDAS } from "@/lib/calculadoras/sementes";

const FIELDS: CalcField[] = [
  { key: "areaHectares", label: "Area a plantar", kind: "number", suffix: "ha" },
  {
    key: "variedade",
    label: "Variedade",
    kind: "select",
    options: [
      { value: "", label: "Informar a taxa eu mesmo" },
      ...TAXAS_SUGERIDAS.map((t) => ({
        value: String(t.kgPorHectare),
        label: `${t.variedade} (${t.kgPorHectare} kg/ha)`,
      })),
    ],
    help: "Escolher uma variedade preenche a taxa sugerida. A taxa do seu tecnico vence sempre.",
  },
  {
    key: "taxaKgPorHectare",
    label: "Taxa de semeadura",
    kind: "number",
    suffix: "kg/ha",
    help: "Deixe vazio para usar a taxa da variedade escolhida acima.",
  },
  { key: "pesoEmbalagemKg", label: "Peso da embalagem", kind: "number", suffix: "kg" },
  { key: "precoPorSaca", label: "Preco da saca (opcional)", kind: "number", suffix: "R$" },
  { key: "precoPorKg", label: "Preco por quilo (opcional)", kind: "number", suffix: "R$" },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const taxaDigitada = lerNumeroBr(values.taxaKgPorHectare);
  const taxaDaVariedade = lerNumeroBr(values.variedade);
  const taxa = taxaDigitada ?? taxaDaVariedade;

  const r = calcularSementes({
    areaHectares: lerNumeroBr(values.areaHectares) ?? NaN,
    taxaKgPorHectare: taxa ?? NaN,
    pesoEmbalagemKg: lerNumeroBr(values.pesoEmbalagemKg) ?? undefined,
    precoPorSaca: lerNumeroBr(values.precoPorSaca) ?? undefined,
    precoPorKg: lerNumeroBr(values.precoPorKg) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    materiais: [
      {
        descricao: String(values.variedade ? "Semente" : "Semente de pastagem"),
        quantidade: r.data.totalKg,
        unidade: "quilograma",
      },
    ],
    rows: [
      { label: "Semente necessaria", value: `${r.data.totalKg} kg`, highlight: true },
      ...(r.data.sacas !== null
        ? [{ label: "Sacas a comprar", value: `${r.data.sacas}`, highlight: true }]
        : []),
      ...(r.data.sobraKg !== null ? [{ label: "Sobra", value: `${r.data.sobraKg} kg` }] : []),
      ...(r.data.custoTotal !== null
        ? [{ label: "Custo estimado", value: reaisBr(r.data.custoTotal) }]
        : []),
    ],
  };
}

export default function SementesPage() {
  return (
    <CalcPage
      title="Sementes"
      description="Quanta semente comprar para formar ou reformar uma pastagem, e quantas sacas isso da."
      confidence="media"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "A conta e area vezes taxa, e a saca arredonda para cima: ninguem compra 4,8 sacas. A TAXA e o numero " +
        "que decide o resultado, e ela varia com a especie, o valor cultural do lote e o metodo de plantio: as " +
        "faixas oferecidas aqui sao ponto de partida de uso corrente, nao recomendacao para a sua area. Semente " +
        "com valor cultural baixo pede mais quilos para o mesmo estande."
      }
    />
  );
}
