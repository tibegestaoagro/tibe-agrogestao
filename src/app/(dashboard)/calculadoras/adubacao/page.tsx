"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
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
  { key: "precoPorSaca", label: "Preco da saca (opcional)", kind: "number", suffix: "R$" },
  { key: "precoPorKg", label: "Preco por quilo (opcional)", kind: "number", suffix: "R$" },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const pesoSacoKg = lerNumeroBr(values.pesoSacoKg) ?? undefined;
  const r = calcularAdubacao({
    doseNutrienteKgHa: lerNumeroBr(values.doseNutrienteKgHa) ?? NaN,
    teorNutrientePercent: lerNumeroBr(values.teorNutrientePercent) ?? NaN,
    areaHectares: lerNumeroBr(values.areaHectares) ?? NaN,
    pesoSacoKg,
    precoPorSaca: lerNumeroBr(values.precoPorSaca) ?? undefined,
    precoPorKg: lerNumeroBr(values.precoPorKg) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Produto por hectare", value: `${r.data.kgProdutoPorHectare} kg/ha` },
      { label: "Produto total", value: `${r.data.kgProdutoTotal} kg`, highlight: true },
      ...(r.data.numeroSacos !== null ? [{ label: "Sacos necessarios", value: `${r.data.numeroSacos} un` }] : []),
      ...(r.data.sobraKg !== null && r.data.sobraKg > 0
        ? [{ label: "Sobra", value: `${r.data.sobraKg} kg` }]
        : []),
      ...(r.data.custoTotal !== null
        ? [{ label: "Custo estimado", value: reaisBr(r.data.custoTotal) }]
        : []),
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
