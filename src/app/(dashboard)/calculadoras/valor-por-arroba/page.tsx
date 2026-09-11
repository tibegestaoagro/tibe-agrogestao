"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { calcularValorPorArroba } from "@/lib/calculadoras/compra-venda-gado";

const FIELDS: CalcField[] = [
  { key: "numeroAnimais", label: "Numero de animais", kind: "number", defaultValue: 1 },
  { key: "pesoMedioKg", label: "Peso medio", kind: "number", suffix: "kg" },
  {
    key: "rendimentoCarcacaPercent",
    label: "Rendimento de carcaca",
    kind: "number",
    suffix: "%",
    defaultValue: 52,
    help: "Quanto do peso vivo vira carcaca. Boi gordo costuma ficar entre 50% e 55%.",
  },
  {
    key: "valorTotal",
    label: "Valor total do negocio",
    kind: "number",
    suffix: "R$",
    help: "Informe este ou o valor por cabeca. Com os dois, o total vence.",
  },
  { key: "valorPorCabeca", label: "Valor por cabeca", kind: "number", suffix: "R$" },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const r = calcularValorPorArroba({
    numeroAnimais: lerNumeroBr(values.numeroAnimais) ?? NaN,
    pesoMedioKg: lerNumeroBr(values.pesoMedioKg) ?? NaN,
    rendimentoCarcacaPercent: lerNumeroBr(values.rendimentoCarcacaPercent) ?? NaN,
    valorTotal: lerNumeroBr(values.valorTotal) ?? undefined,
    valorPorCabeca: lerNumeroBr(values.valorPorCabeca) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Valor por arroba", value: `${reaisBr(r.data.valorPorArroba)}/@`, highlight: true },
      { label: "Valor total", value: reaisBr(r.data.valorTotal) },
      { label: "Valor por cabeca", value: reaisBr(r.data.valorPorCabeca) },
      { label: "Peso total do lote", value: `${r.data.pesoTotalKg} kg` },
      { label: "Arrobas por animal", value: `${r.data.arrobasPorAnimal} @` },
      { label: "Arrobas totais", value: `${r.data.arrobasTotais} @` },
    ],
  };
}

export default function ValorPorArrobaPage() {
  return (
    <CalcPage
      title="Valor por arroba"
      description="Quanto voce esta pagando ou recebendo por arroba num negocio de valor ja fechado."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "A conta e a inversa da simulacao de compra e venda: parte do valor oferecido e do peso para achar o " +
        "preco de arroba embutido nele. A arroba usada e a de carcaca, 15 kg, e por isso o rendimento importa: " +
        "com 52%, um boi de 500 kg rende 17,33 arrobas. Simular aqui nao registra venda nenhuma."
      }
    />
  );
}
