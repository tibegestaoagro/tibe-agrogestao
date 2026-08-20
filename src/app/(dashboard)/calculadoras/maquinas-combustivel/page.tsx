"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { lerNumeroBr } from "@/lib/numero-br";
import { calcularCombustivel, MODOS_CONSUMO, type ModoConsumo } from "@/lib/calculadoras/maquinas-combustivel";

const FIELDS: CalcField[] = [
  {
    key: "modo",
    label: "Como voce sabe o consumo da maquina",
    kind: "select",
    defaultValue: "por_area",
    options: MODOS_CONSUMO.map((m) => ({ value: m.value, label: m.label })),
  },
  {
    key: "consumoLitros",
    label: "Consumo",
    kind: "number",
    suffix: "L (por ha ou por hora, conforme escolhido acima)",
    help: "Do manual da maquina ou de medicao propria: nao ha valor padrao (varia demais por marca/modelo/implemento).",
  },
  { key: "quantidade", label: "Area (ha) ou horas trabalhadas", kind: "number" },
  { key: "precoPorLitro", label: "Preco do combustivel por litro (opcional)", kind: "number", suffix: "R$/L" },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const precoPorLitro = lerNumeroBr(values.precoPorLitro) ?? undefined;
  const r = calcularCombustivel({
    modo: values.modo as ModoConsumo,
    consumoLitros: lerNumeroBr(values.consumoLitros) ?? NaN,
    quantidade: lerNumeroBr(values.quantidade) ?? NaN,
    precoPorLitro,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Combustivel total", value: `${r.data.litrosTotais} L`, highlight: true },
      ...(r.data.custoTotal !== null ? [{ label: "Custo total", value: `R$ ${r.data.custoTotal.toFixed(2)}` }] : []),
    ],
  };
}

export default function MaquinasCombustivelPage() {
  return (
    <CalcPage
      title="Maquinas e combustivel"
      description="Total de combustivel e custo, a partir do consumo real da sua maquina e da area/horas trabalhadas."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: litros totais = consumo informado x area (ou x horas). E multiplicacao simples, sem nenhum " +
        "coeficiente agronomico embutido: o consumo vem sempre do que o usuario digitar. Como contexto informativo " +
        "(nao normativo), tratores agricolas brasileiros costumam consumir entre 13 e 35 L/hora, crescendo com a " +
        "potencia (CV) da maquina. Fonte do contexto: Revista Cultivar, 'Quanto gasta seu trator'."
      }
    />
  );
}
