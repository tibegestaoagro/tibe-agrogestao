"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { lerNumeroBr } from "@/lib/numero-br";
import { calcularMaoDeObra } from "@/lib/calculadoras/mao-de-obra";

const FIELDS: CalcField[] = [
  { key: "numeroAnimais", label: "Numero de animais do rebanho", kind: "number", step: "1" },
  {
    key: "capacidadePorFuncionario",
    label: "Cabecas que um funcionario da sua operacao consegue tocar",
    kind: "number",
    step: "1",
    help:
      "Nao ha um numero padrao consensual: a imprensa especializada cita faixas de ~100-200 (manejo manual) a " +
      "~1.500-3.500 (recria/terminacao a pasto mecanizada), so como referencia grosseira.",
  },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const r = calcularMaoDeObra({
    numeroAnimais: lerNumeroBr(values.numeroAnimais) ?? NaN,
    capacidadePorFuncionario: lerNumeroBr(values.capacidadePorFuncionario) ?? NaN,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [{ label: "Funcionarios necessarios", value: `${r.data.funcionariosNecessarios}`, highlight: true }],
  };
}

export default function MaoDeObraPage() {
  return (
    <CalcPage
      title="Mao de obra"
      description="Quantos funcionarios sao necessarios para tocar o rebanho, a partir da capacidade da sua operacao."
      confidence="media"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: funcionarios = numero de animais / capacidade por funcionario (arredondado para cima). Nao existe " +
        "referencia Embrapa/zootecnica consolidada de 'cabecas por funcionario': por isso o campo e obrigatorio, sem " +
        "valor padrao. Fontes (so contexto informativo): Giro do Boi/Canal Rural, 'Dimensionando a equipe'; Acrissul. " +
        "Recomenda-se revisao de um consultor de gestao rural antes de usar como base de contratacao real."
      }
    />
  );
}
