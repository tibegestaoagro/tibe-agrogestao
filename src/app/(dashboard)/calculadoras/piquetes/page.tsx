"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr } from "@/lib/numero-br";
import { calcularPiquetes } from "@/lib/calculadoras/piquetes";

const FIELDS: CalcField[] = [
  { key: "areaHectares", label: "Area disponivel", kind: "number", suffix: "ha" },
  { key: "numeroLotes", label: "Lotes de animais", kind: "number", defaultValue: 1 },
  { key: "diasOcupacao", label: "Dias de ocupacao por piquete", kind: "number" },
  {
    key: "diasDescanso",
    label: "Dias de descanso",
    kind: "number",
    help: "O tempo que o capim precisa para rebrotar. Deixe vazio se voce ja sabe quantos piquetes quer.",
  },
  {
    key: "piquetesDesejados",
    label: "Piquetes desejados (opcional)",
    kind: "number",
    help: "Informe se a divisao ja esta decidida: a conta mostra que descanso ela entrega.",
  },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const r = calcularPiquetes({
    areaHectares: lerNumeroBr(values.areaHectares) ?? NaN,
    numeroLotes: lerNumeroBr(values.numeroLotes) ?? NaN,
    diasOcupacao: lerNumeroBr(values.diasOcupacao) ?? NaN,
    diasDescanso: lerNumeroBr(values.diasDescanso) ?? undefined,
    piquetesDesejados: lerNumeroBr(values.piquetesDesejados) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      {
        label: r.data.veioDoProdutor ? "Piquetes informados" : "Piquetes sugeridos",
        value: `${r.data.piquetesSugeridos}`,
        highlight: true,
      },
      { label: "Piquetes por lote", value: `${r.data.piquetesPorLote}` },
      { label: "Area media por piquete", value: `${r.data.areaMediaPorPiqueteHectares} ha` },
      { label: "Area por lote", value: `${r.data.areaPorLoteHectares} ha` },
      { label: "Descanso que este arranjo entrega", value: `${r.data.descansoResultanteDias} dias` },
    ],
  };
}

export default function PiquetesPage() {
  return (
    <CalcPage
      title="Piquetes"
      description="Em quantos piquetes dividir a area para pastejo rotacionado, e quanto descanso o arranjo entrega."
      confidence="media"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "A conta e de calendario: para o lote voltar ao mesmo piquete so depois do descanso, sao precisos " +
        "descanso dividido por ocupacao, mais um (o piquete onde o lote esta enquanto os outros descansam). " +
        "Quantos animais cabem em cada piquete e outra conta, a de lotacao, e ela tambem e estimativa: o " +
        "descanso certo depende da forragem, da chuva e da epoca, e quem define e o seu tecnico."
      }
    />
  );
}
