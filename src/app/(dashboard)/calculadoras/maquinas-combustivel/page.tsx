"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
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
  { key: "valorOperadorPorHora", label: "Valor do operador por hora (opcional)", kind: "number", suffix: "R$/h" },
  {
    key: "horasTrabalhadas",
    label: "Horas trabalhadas (opcional)",
    kind: "number",
    suffix: "h",
    help: "So no modo por area: no modo por hora o campo de quantidade ja sao as horas.",
  },
  { key: "outrosCustos", label: "Outros custos (opcional)", kind: "number", suffix: "R$" },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const precoPorLitro = lerNumeroBr(values.precoPorLitro) ?? undefined;
  const r = calcularCombustivel({
    modo: values.modo as ModoConsumo,
    consumoLitros: lerNumeroBr(values.consumoLitros) ?? NaN,
    quantidade: lerNumeroBr(values.quantidade) ?? NaN,
    precoPorLitro,
    valorOperadorPorHora: lerNumeroBr(values.valorOperadorPorHora) ?? undefined,
    horasTrabalhadas: lerNumeroBr(values.horasTrabalhadas) ?? undefined,
    outrosCustos: lerNumeroBr(values.outrosCustos) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Combustivel total", value: `${r.data.litrosTotais} L`, highlight: true },
      ...(r.data.custoCombustivel !== null
        ? [{ label: "Custo do combustivel", value: reaisBr(r.data.custoCombustivel) }]
        : []),
      ...(r.data.custoOperador !== null
        ? [{ label: "Custo do operador", value: reaisBr(r.data.custoOperador) }]
        : []),
      ...(r.data.custoTotal !== null
        ? [{ label: "Custo total", value: reaisBr(r.data.custoTotal), highlight: true }]
        : []),
      ...(r.data.custoPorHora !== null
        ? [{ label: "Custo por hora", value: `${reaisBr(r.data.custoPorHora)}/h` }]
        : []),
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
