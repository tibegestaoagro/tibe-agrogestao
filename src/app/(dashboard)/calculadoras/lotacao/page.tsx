"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { lerNumeroBr } from "@/lib/numero-br";
import { calcularTaxaLotacao } from "@/lib/calculadoras/lotacao";

const FIELDS: CalcField[] = [
  { key: "numeroAnimais", label: "Numero de animais", kind: "number", step: "1" },
  { key: "pesoMedioKg", label: "Peso vivo medio por animal", kind: "number", suffix: "kg" },
  { key: "areaHectares", label: "Area da pastagem", kind: "number", suffix: "ha" },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const r = calcularTaxaLotacao({
    numeroAnimais: lerNumeroBr(values.numeroAnimais) ?? NaN,
    pesoMedioKg: lerNumeroBr(values.pesoMedioKg) ?? NaN,
    areaHectares: lerNumeroBr(values.areaHectares) ?? NaN,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Taxa de lotacao", value: `${r.data.taxaLotacaoUaHa} UA/ha`, highlight: true },
      { label: "Peso vivo total do rebanho", value: `${r.data.pesoVivoTotalKg} kg` },
      { label: "Unidades Animais (UA)", value: `${r.data.unidadesAnimais} UA` },
      { label: "Cabecas por hectare", value: `${r.data.cabecasPorHectare}` },
    ],
  };
}

export default function LotacaoPage() {
  return (
    <CalcPage
      title="Lotacao"
      description="Taxa de lotacao atual do rebanho: quantas Unidades Animais (UA) por hectare."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: TL (UA/ha) = peso vivo total do rebanho / 450 / area, onde 1 UA = 450 kg de peso vivo. " +
        "Fonte: Embrapa Gado de Corte (CNPGC), Comunicado Tecnico 101, 'Area de Piquete e Taxa de Lotacao no Pastejo Rotacionado'. " +
        "Formula fixa e amplamente citada: o unico parametro fixo (450 kg = 1 UA) e convencao nacional."
      }
    />
  );
}
