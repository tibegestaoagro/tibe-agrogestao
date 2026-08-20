"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { lerNumeroBr } from "@/lib/numero-br";
import { calcularAgua } from "@/lib/calculadoras/agua";

const FIELDS: CalcField[] = [
  { key: "pesoMedioKg", label: "Peso vivo medio por animal", kind: "number", suffix: "kg" },
  { key: "numeroAnimais", label: "Numero de animais", kind: "number", step: "1" },
  { key: "diasPeriodo", label: "Periodo (opcional)", kind: "number", suffix: "dias" },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const diasPeriodo = lerNumeroBr(values.diasPeriodo) ?? undefined;
  const r = calcularAgua({
    pesoMedioKg: lerNumeroBr(values.pesoMedioKg) ?? NaN,
    numeroAnimais: lerNumeroBr(values.numeroAnimais) ?? NaN,
    diasPeriodo,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Consumo por animal/dia", value: `${r.data.consumoLitrosDiaPorAnimal} L`, highlight: true },
      { label: "Consumo do rebanho/dia", value: `${r.data.consumoLitrosDiaRebanho} L`, highlight: true },
      ...(r.data.consumoLitrosPeriodoRebanho !== null
        ? [{ label: "Consumo do rebanho no periodo", value: `${r.data.consumoLitrosPeriodoRebanho} L` }]
        : []),
    ],
  };
}

export default function AguaPage() {
  return (
    <CalcPage
      title="Agua"
      description="Estimativa de consumo diario de agua do rebanho, para dimensionar bebedouro/reservatorio."
      confidence="media"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: consumo diario de agua aproximadamente 10% do peso vivo (regra pratica de campo, consistente com " +
        "estudo da Embrapa em confinamentos comerciais: media de 37,8 L/animal/dia para ingestao de 10 kg MS/dia). " +
        "Fonte: Portal Embrapa, 'Estudos indicam pegada hidrica de bovinos em confinamento no Brasil'. Nao e um " +
        "coeficiente fixo publicado como norma tecnica: consumo real varia com temperatura, categoria e sistema."
      }
    />
  );
}
