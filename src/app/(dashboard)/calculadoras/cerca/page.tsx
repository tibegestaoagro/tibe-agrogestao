"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { calcularCerca } from "@/lib/calculadoras/cerca";

const FIELDS: CalcField[] = [
  { key: "comprimentoMetros", label: "Comprimento da cerca", kind: "number", suffix: "metros" },
  { key: "espacamentoMetros", label: "Espacamento entre mouroes", kind: "number", suffix: "metros", defaultValue: 3 },
  { key: "numeroFios", label: "Numero de fios de arame", kind: "number", defaultValue: 4, step: "1" },
  {
    key: "metrosPorRoloArame",
    label: "Metros por rolo de arame (opcional)",
    kind: "number",
    suffix: "metros",
    help: "Preencha se quiser saber quantos rolos comprar (rolos comuns tem 500m).",
  },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const comprimentoMetros = Number(values.comprimentoMetros);
  const espacamentoMetros = Number(values.espacamentoMetros);
  const numeroFios = Number(values.numeroFios);
  const metrosPorRoloArame = values.metrosPorRoloArame ? Number(values.metrosPorRoloArame) : undefined;

  const r = calcularCerca({ comprimentoMetros, espacamentoMetros, numeroFios, metrosPorRoloArame });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Mouroes necessarios", value: `${r.data.mouroesNecessarios} un`, highlight: true },
      { label: "Arame necessario", value: `${r.data.metrosDeArameNecessarios} m` },
      ...(r.data.rolosDeArameNecessarios !== null
        ? [{ label: "Rolos de arame", value: `${r.data.rolosDeArameNecessarios} un` }]
        : []),
    ],
  };
}

export default function CercaPage() {
  return (
    <CalcPage
      title="Cerca"
      description="Quantidade de mouroes e de arame para uma cerca retilinea simples (sem cantos/porteiras)."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: mouroes = comprimento/espacamento (arredondado para cima) + 1; arame = comprimento x numero de fios x 1,05 (folga de 5%). " +
        "Fontes: Calculadora Rural (calculadorarural.com.br/ferramentas/dimensionamento-cerca) e Casa das Cercas. " +
        "Geometria e regra de compra de material, nao dosagem biologica: erro aqui e financeiro/logistico, nao afeta o rebanho."
      }
    />
  );
}
