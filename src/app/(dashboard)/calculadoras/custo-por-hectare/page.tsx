"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { calcularCustoPorHectare } from "@/lib/calculadoras/custo-da-operacao";

const FIELDS: CalcField[] = [
  { key: "custoTotal", label: "Custo total da operacao", kind: "number", suffix: "R$" },
  { key: "areaHectares", label: "Area trabalhada", kind: "number", suffix: "ha" },
  {
    key: "horasTotais",
    label: "Horas gastas (opcional)",
    kind: "number",
    suffix: "h",
    help: "Quando voce sabe as horas, sai tambem o rendimento e o custo por hora.",
  },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const r = calcularCustoPorHectare({
    custoTotal: lerNumeroBr(values.custoTotal) ?? NaN,
    areaHectares: lerNumeroBr(values.areaHectares) ?? NaN,
    horasTotais: lerNumeroBr(values.horasTotais) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Custo por hectare", value: `${reaisBr(r.data.custoPorHectare)}/ha`, highlight: true },
      ...(r.data.horasPorHectare !== null
        ? [{ label: "Horas por hectare", value: `${r.data.horasPorHectare} h/ha` }]
        : []),
      ...(r.data.custoPorHora !== null
        ? [{ label: "Custo por hora", value: `${reaisBr(r.data.custoPorHora)}/h` }]
        : []),
    ],
  };
}

export default function CustoPorHectarePage() {
  return (
    <CalcPage
      title="Custo por hectare"
      description="O custo de uma operacao dividido pela area que ela cobriu."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Divisao simples, sem coeficiente tecnico nenhum: tudo o que entra veio de voce. O valor da ferramenta " +
        "esta em comparar operacoes na mesma medida, que e o que permite dizer se a gradagem deste ano saiu mais " +
        "cara que a do ano passado."
      }
    />
  );
}
