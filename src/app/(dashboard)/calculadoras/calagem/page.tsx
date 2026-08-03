"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { calcularCalagem } from "@/lib/calculadoras/calagem";

const FIELDS: CalcField[] = [
  { key: "ctc", label: "CTC (T) a pH 7", kind: "number", suffix: "cmolc/dm3", help: "Vem do laudo de analise de solo." },
  { key: "saturacaoAtualPercent", label: "Saturacao por bases atual (V1)", kind: "number", suffix: "%" },
  {
    key: "saturacaoDesejadaPercent",
    label: "Saturacao por bases desejada (V2)",
    kind: "number",
    suffix: "%",
    help: "Definida pela cultura/regiao (usual entre 50% e 70% no Brasil): confirme com agronomo.",
  },
  { key: "prntPercent", label: "PRNT do calcario", kind: "number", suffix: "%", help: "Vem do rotulo do calcario." },
  { key: "areaHectares", label: "Area a corrigir (opcional)", kind: "number", suffix: "ha" },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const areaHectares = values.areaHectares ? Number(values.areaHectares) : undefined;
  const r = calcularCalagem({
    ctc: Number(values.ctc),
    saturacaoAtualPercent: Number(values.saturacaoAtualPercent),
    saturacaoDesejadaPercent: Number(values.saturacaoDesejadaPercent),
    prntPercent: Number(values.prntPercent),
    areaHectares,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Necessidade de calagem (100% PRNT)", value: `${r.data.necessidadeCalagemTHa} t/ha` },
      { label: "Dose corrigida pelo PRNT informado", value: `${r.data.doseCorrigidaTHa} t/ha`, highlight: true },
      ...(r.data.toneladasTotais !== null
        ? [{ label: "Toneladas totais para a area", value: `${r.data.toneladasTotais} t` }]
        : []),
    ],
  };
}

export default function CalagemPage() {
  return (
    <CalcPage
      title="Calagem"
      description="Necessidade de calcario pelo metodo da saturacao por bases, a partir do laudo de analise de solo."
      confidence="media"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: NC (t/ha) = CTC x (V2 - V1) / 100; dose corrigida = NC x 100 / PRNT. Fonte: metodo padrao de " +
        "saturacao por bases (Agrolink, 'Calagem: criterios para a recomendacao'), exemplo conferido (CTC 14, V1 24%, " +
        "V2 70%, PRNT 92% = 7,0 t/ha). A formula e padrao e nao controversa, mas depende de dados de laudo de solo " +
        "(CTC, V1) e de uma meta (V2) que devem vir de recomendacao tecnica: revise com um agronomo antes de aplicar."
      }
    />
  );
}
