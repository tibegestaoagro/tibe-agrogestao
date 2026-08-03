"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { calcularAdubacao } from "@/lib/calculadoras/adubacao";

const FIELDS: CalcField[] = [
  {
    key: "doseNutrienteKgHa",
    label: "Dose recomendada do nutriente",
    kind: "number",
    suffix: "kg/ha",
    help: "Vem da analise de solo/agronomo: esta calculadora nao recomenda a dose, so converte em produto.",
  },
  { key: "teorNutrientePercent", label: "Teor do nutriente no produto (rotulo)", kind: "number", suffix: "%" },
  { key: "areaHectares", label: "Area a adubar", kind: "number", suffix: "ha" },
  {
    key: "pesoSacoKg",
    label: "Peso do saco (opcional)",
    kind: "number",
    suffix: "kg",
    help: "Preencha para saber quantos sacos comprar (comum: 50 kg).",
  },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const pesoSacoKg = values.pesoSacoKg ? Number(values.pesoSacoKg) : undefined;
  const r = calcularAdubacao({
    doseNutrienteKgHa: Number(values.doseNutrienteKgHa),
    teorNutrientePercent: Number(values.teorNutrientePercent),
    areaHectares: Number(values.areaHectares),
    pesoSacoKg,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Produto por hectare", value: `${r.data.kgProdutoPorHectare} kg/ha` },
      { label: "Produto total", value: `${r.data.kgProdutoTotal} kg`, highlight: true },
      ...(r.data.numeroSacos !== null ? [{ label: "Sacos necessarios", value: `${r.data.numeroSacos} un` }] : []),
    ],
  };
}

export default function AdubacaoPage() {
  return (
    <CalcPage
      title="Adubacao"
      description="Converte uma dose recomendada de nutriente (kg/ha) em quantidade de adubo formulado a comprar."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: kg de produto/ha = dose recomendada do nutriente / (teor garantido no produto / 100). E regra de " +
        "tres a partir do rotulo, sem nenhuma dose agronomica inventada. Fontes: Portal Agriconline, 'Como calcular a " +
        "adubacao formulada'; Agrolink, 'Fertilizantes NPK'. Esta calculadora NAO recomenda quanto nutriente aplicar: " +
        "isso vem de analise de solo e de um agronomo, e deve ser informado pelo usuario."
      }
    />
  );
}
