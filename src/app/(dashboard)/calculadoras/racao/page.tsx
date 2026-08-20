"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { lerNumeroBr } from "@/lib/numero-br";
import { calcularRacao, TIPOS_ALIMENTO, type TipoAlimento } from "@/lib/calculadoras/racao";

const FIELDS: CalcField[] = [
  { key: "pesoMedioKg", label: "Peso vivo medio por animal", kind: "number", suffix: "kg" },
  { key: "numeroAnimais", label: "Numero de animais", kind: "number", step: "1" },
  {
    key: "tipoAlimento",
    label: "Tipo de alimento",
    kind: "select",
    defaultValue: "materia_seca",
    options: TIPOS_ALIMENTO.map((t) => ({ value: t.value, label: t.label })),
  },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const r = calcularRacao({
    pesoMedioKg: lerNumeroBr(values.pesoMedioKg) ?? NaN,
    numeroAnimais: lerNumeroBr(values.numeroAnimais) ?? NaN,
    tipoAlimento: values.tipoAlimento as TipoAlimento,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Materia seca (MS) por animal/dia", value: `${r.data.materiaSecaKgDiaPorAnimal} kg` },
      { label: "Materia seca (MS) do rebanho/dia", value: `${r.data.materiaSecaKgDiaRebanho} kg` },
      {
        label: "Alimento in natura por animal/dia",
        value: `${r.data.alimentoNaturalKgDiaPorAnimal} kg`,
        highlight: true,
      },
      { label: "Alimento in natura do rebanho/dia", value: `${r.data.alimentoNaturalKgDiaRebanho} kg`, highlight: true },
    ],
  };
}

export default function RacaoPage() {
  return (
    <CalcPage
      title="Racao / volumoso"
      description="Necessidade diaria de materia seca (MS) do rebanho, e conversao para alimento in natura."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: consumo de MS de um bovino adulto aproximadamente 2,5% do peso vivo/dia. Fonte: Embrapa Gado de " +
        "Corte (CNPGC), 'Quantos quilos de materia seca um animal adulto consome por dia?' (cloud.cnpgc.embrapa.br). " +
        "O percentual de MS e ALTA confianca (direto da Embrapa); as conversoes por tipo de volumoso (silagem/capim/feno) " +
        "sao MEDIA confianca, derivadas de um unico exemplo numerico da Embrapa, nao de tabela bromatologica completa."
      }
    />
  );
}
