"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr } from "@/lib/numero-br";
import { calcularReservatorio } from "@/lib/calculadoras/reservatorio";

const FIELDS: CalcField[] = [
  { key: "numeroAnimais", label: "Numero de animais", kind: "number" },
  { key: "pesoMedioKg", label: "Peso medio", kind: "number", suffix: "kg" },
  {
    key: "diasAutonomia",
    label: "Dias de reserva desejados",
    kind: "number",
    defaultValue: 3,
    help: "Quantos dias o rebanho precisa aguentar sem reposicao.",
  },
  {
    key: "margemSegurancaPercent",
    label: "Folga de seguranca (opcional)",
    kind: "number",
    suffix: "%",
  },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const r = calcularReservatorio({
    numeroAnimais: lerNumeroBr(values.numeroAnimais) ?? NaN,
    pesoMedioKg: lerNumeroBr(values.pesoMedioKg) ?? NaN,
    diasAutonomia: lerNumeroBr(values.diasAutonomia) ?? NaN,
    margemSegurancaPercent: lerNumeroBr(values.margemSegurancaPercent) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Consumo do rebanho por dia", value: `${r.data.consumoLitrosDiaRebanho} litros` },
      {
        label: "Volume minimo a armazenar",
        value: `${r.data.volumeMinimoLitros} litros`,
        highlight: true,
      },
      { label: "Isso corresponde a", value: `${r.data.volumeMinimoMetrosCubicos} m3` },
      ...(r.data.volumeComMargemLitros !== null
        ? [
            {
              label: "Com a folga informada",
              value: `${r.data.volumeComMargemLitros} litros`,
              highlight: true,
            },
          ]
        : []),
    ],
  };
}

export default function ReservatorioPage() {
  return (
    <CalcPage
      title="Reservatorio de agua"
      description="Quanto armazenar para o rebanho aguentar os dias de reserva que voce escolher."
      confidence="media"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "O consumo vem da mesma estimativa da calculadora de agua (perto de 10% do peso vivo por dia), e por " +
        "isso herda a mesma confianca media: o consumo real sobe muito com calor e com vaca em lactacao. Este " +
        "numero dimensiona reserva, nao e projeto hidraulico: bomba, tubulacao e pressao ficam fora, como o " +
        "documento do cliente pede."
      }
    />
  );
}
