"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
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
  { key: "diasPeriodo", label: "Periodo a suprir (opcional)", kind: "number", suffix: "dias" },
  { key: "pesoSacaKg", label: "Peso da saca (opcional)", kind: "number", suffix: "kg" },
  { key: "precoPorSaca", label: "Preco da saca (opcional)", kind: "number", suffix: "R$" },
  { key: "precoPorKg", label: "Preco por quilo (opcional)", kind: "number", suffix: "R$" },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const r = calcularRacao({
    pesoMedioKg: lerNumeroBr(values.pesoMedioKg) ?? NaN,
    numeroAnimais: lerNumeroBr(values.numeroAnimais) ?? NaN,
    tipoAlimento: values.tipoAlimento as TipoAlimento,
    diasPeriodo: lerNumeroBr(values.diasPeriodo) ?? undefined,
    pesoSacaKg: lerNumeroBr(values.pesoSacaKg) ?? undefined,
    precoPorSaca: lerNumeroBr(values.precoPorSaca) ?? undefined,
    precoPorKg: lerNumeroBr(values.precoPorKg) ?? undefined,
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
      ...(r.data.alimentoNaturalKgPeriodoRebanho !== null
        ? [{ label: "Alimento no periodo", value: `${r.data.alimentoNaturalKgPeriodoRebanho} kg`, highlight: true }]
        : []),
      ...(r.data.sacas !== null
        ? [{ label: "Sacas a comprar", value: `${r.data.sacas}`, highlight: true }]
        : []),
      ...(r.data.sobraKg !== null && r.data.sobraKg > 0
        ? [{ label: "Sobra", value: `${r.data.sobraKg} kg` }]
        : []),
      ...(r.data.custoTotal !== null
        ? [{ label: "Custo estimado", value: reaisBr(r.data.custoTotal) }]
        : []),
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
