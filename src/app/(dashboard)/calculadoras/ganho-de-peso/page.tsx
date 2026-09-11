"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr } from "@/lib/numero-br";
import { calcularGanhoDePeso } from "@/lib/calculadoras/ganho-de-peso";

const FIELDS: CalcField[] = [
  { key: "pesoAtualKg", label: "Peso atual", kind: "number", suffix: "kg" },
  { key: "pesoDesejadoKg", label: "Peso desejado", kind: "number", suffix: "kg" },
  {
    key: "ganhoMedioDiarioKg",
    label: "Ganho medio diario",
    kind: "number",
    suffix: "kg/dia",
    help: "O ritmo que voce observa no seu rebanho, ou o que o seu tecnico projetou.",
  },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const r = calcularGanhoDePeso({
    pesoAtualKg: lerNumeroBr(values.pesoAtualKg) ?? NaN,
    pesoDesejadoKg: lerNumeroBr(values.pesoDesejadoKg) ?? NaN,
    ganhoMedioDiarioKg: lerNumeroBr(values.ganhoMedioDiarioKg) ?? NaN,
    dataInicial: new Date(),
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Falta ganhar", value: `${r.data.ganhoNecessarioKg} kg` },
      { label: "Tempo aproximado", value: `${r.data.dias} dias`, highlight: true },
      { label: "Em meses", value: `${r.data.meses}` },
      ...(r.data.dataPrevista
        ? [
            {
              label: "Chega ao peso perto de",
              value: r.data.dataPrevista.toLocaleDateString("pt-BR", { timeZone: "UTC" }),
            },
          ]
        : []),
    ],
  };
}

export default function GanhoDePesoPage() {
  return (
    <CalcPage
      title="Ganho de peso"
      description="Quantos dias faltam para o animal chegar ao peso que voce quer, no ritmo que ele vem ganhando."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "A conta e divisao, e por isso a confianca e alta: o que ela vale depende inteiramente do ganho medio " +
        "diario que voce informou. Esse ritmo muda com dieta, categoria, sanidade e estacao do ano, e o sistema " +
        "nao o estima por voce de proposito: um numero inventado aqui viraria promessa de data de venda."
      }
    />
  );
}
