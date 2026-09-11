"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { calcularSalMineral } from "@/lib/calculadoras/sal-mineral";

const FIELDS: CalcField[] = [
  { key: "pesoMedioKg", label: "Peso vivo medio por animal", kind: "number", suffix: "kg" },
  { key: "numeroAnimais", label: "Numero de animais", kind: "number", step: "1" },
  { key: "diasPeriodo", label: "Periodo a suprir", kind: "number", suffix: "dias", defaultValue: 30 },
  {
    key: "consumoGDiaPorAnimal",
    label: "Consumo por animal/dia (opcional)",
    kind: "number",
    suffix: "g",
    help: "Do rotulo do produto que voce usa. Sem ele, a conta usa a faixa estimada pelo peso.",
  },
  { key: "pesoSacaKg", label: "Peso da saca (opcional)", kind: "number", suffix: "kg" },
  { key: "precoPorSaca", label: "Preco da saca (opcional)", kind: "number", suffix: "R$" },
  { key: "precoPorKg", label: "Preco por quilo (opcional)", kind: "number", suffix: "R$" },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const r = calcularSalMineral({
    pesoMedioKg: lerNumeroBr(values.pesoMedioKg) ?? NaN,
    numeroAnimais: lerNumeroBr(values.numeroAnimais) ?? NaN,
    diasPeriodo: lerNumeroBr(values.diasPeriodo) ?? NaN,
    consumoGDiaPorAnimal: lerNumeroBr(values.consumoGDiaPorAnimal) ?? undefined,
    pesoSacaKg: lerNumeroBr(values.pesoSacaKg) ?? undefined,
    precoPorSaca: lerNumeroBr(values.precoPorSaca) ?? undefined,
    precoPorKg: lerNumeroBr(values.precoPorKg) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      {
        label: "Consumo por animal/dia",
        value: `${r.data.consumoMinGDiaPorAnimal} a ${r.data.consumoMaxGDiaPorAnimal} g`,
        highlight: true,
      },
      { label: "Consumo do rebanho/dia", value: `${r.data.consumoMinKgDiaRebanho} a ${r.data.consumoMaxKgDiaRebanho} kg` },
      {
        label: "Consumo do rebanho no periodo",
        value: r.data.consumoInformado
          ? `${r.data.consumoMaxKgPeriodoRebanho} kg`
          : `${r.data.consumoMinKgPeriodoRebanho} a ${r.data.consumoMaxKgPeriodoRebanho} kg`,
      },
      ...(r.data.sacas !== null
        ? [{ label: "Sacas a comprar", value: `${r.data.sacas}`, highlight: true }]
        : []),
      ...(r.data.sobraKg !== null && r.data.sobraKg > 0
        ? [{ label: "Sobra", value: `${r.data.sobraKg} kg` }]
        : []),
      ...(r.data.custoTotal !== null
        ? [{ label: "Custo estimado", value: reaisBr(r.data.custoTotal) }]
        : []),
    ],
  };
}

export default function SalMineralPage() {
  return (
    <CalcPage
      title="Sal mineral"
      description="Consumo diario estimado de sal mineral por animal e total do rebanho, por um periodo."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: as misturas minerais comerciais no Brasil sao formuladas, em geral, para consumo entre 20 g e 30 g " +
        "por 100 kg de peso vivo/dia. Fonte: Embrapa Gado de Corte (CNPGC), 'Qual e o consumo diario de sal mineral " +
        "de um bovino adulto?' (cloud.cnpgc.embrapa.br). Sempre confira o consumo indicado no rotulo do produto " +
        "especifico comprado, que pode fugir dessa faixa: esta calculadora e um ponto de partida, nao substitui o rotulo."
      }
    />
  );
}
