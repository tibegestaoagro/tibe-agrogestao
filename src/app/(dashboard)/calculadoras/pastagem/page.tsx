"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { calcularCapacidadeSuportePastagem } from "@/lib/calculadoras/pastagem";

const FIELDS: CalcField[] = [
  {
    key: "producaoForragemKgMsHaAno",
    label: "Producao anual de forragem",
    kind: "number",
    suffix: "kg MS/ha/ano",
    help: "Vem de analise de pastagem ou de tabela por especie forrageira (ex.: braquiaria adubada produz mais que degradada).",
  },
  {
    key: "areaHectares",
    label: "Area da pastagem (opcional)",
    kind: "number",
    suffix: "ha",
    help: "Preencha para saber quantas UA a area toda comporta.",
  },
  {
    key: "numeroAnimaisRebanho",
    label: "Numero de animais do rebanho (opcional)",
    kind: "number",
    step: "1",
    help: "Preencha junto com o peso medio abaixo para saber quantos hectares o rebanho precisa.",
  },
  { key: "pesoMedioKg", label: "Peso vivo medio por animal (opcional)", kind: "number", suffix: "kg" },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const areaHectares = values.areaHectares ? Number(values.areaHectares) : undefined;
  const numeroAnimaisRebanho = values.numeroAnimaisRebanho ? Number(values.numeroAnimaisRebanho) : undefined;
  const pesoMedioKg = values.pesoMedioKg ? Number(values.pesoMedioKg) : undefined;

  const r = calcularCapacidadeSuportePastagem({
    producaoForragemKgMsHaAno: Number(values.producaoForragemKgMsHaAno),
    areaHectares,
    numeroAnimaisRebanho,
    pesoMedioKg,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Capacidade de suporte", value: `${r.data.capacidadeUaHaAno} UA/ha/ano`, highlight: true },
      ...(r.data.capacidadeTotalUa !== null
        ? [{ label: "Capacidade total da area", value: `${r.data.capacidadeTotalUa} UA` }]
        : []),
      ...(r.data.areaNecessariaHectares !== null
        ? [{ label: "Area necessaria para o rebanho", value: `${r.data.areaNecessariaHectares} ha` }]
        : []),
    ],
  };
}

export default function PastagemPage() {
  return (
    <CalcPage
      title="Pastagem"
      description="Capacidade de suporte da pastagem ao longo do ano, e area necessaria para o rebanho."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: Capacidade de suporte (UA/ha/ano) = producao de forragem (kg MS/ha/ano) / (450 x 11% x 365). " +
        "Fonte: Embrapa Gado de Corte (CNPGC), 'Como se calcula a capacidade de suporte de uma pastagem?' " +
        "(cloud.cnpgc.embrapa.br). Exemplo da propria Embrapa conferido: 25.000 kg MS/ha/ano resulta em 1,38 UA/ha/ano."
      }
    />
  );
}
