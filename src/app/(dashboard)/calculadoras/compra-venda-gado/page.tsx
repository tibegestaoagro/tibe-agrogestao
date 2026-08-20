"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { lerNumeroBr } from "@/lib/numero-br";
import { calcularCompraVendaGado } from "@/lib/calculadoras/compra-venda-gado";

const FIELDS: CalcField[] = [
  { key: "pesoVivoCompraKg", label: "Peso vivo na compra", kind: "number", suffix: "kg" },
  { key: "rendimentoCarcacaCompraPercent", label: "Rendimento de carcaca esperado na compra", kind: "number", suffix: "%" },
  { key: "precoArrobaCompra", label: "Preco da arroba na compra", kind: "number", suffix: "R$" },
  { key: "pesoVivoVendaKg", label: "Peso vivo projetado na venda", kind: "number", suffix: "kg" },
  { key: "rendimentoCarcacaVendaPercent", label: "Rendimento de carcaca esperado na venda", kind: "number", suffix: "%" },
  { key: "precoArrobaVenda", label: "Preco da arroba na venda", kind: "number", suffix: "R$" },
  { key: "numeroAnimais", label: "Numero de animais (opcional)", kind: "number", step: "1" },
  {
    key: "custosAdicionais",
    label: "Custos adicionais por animal (opcional)",
    kind: "number",
    suffix: "R$",
    help: "Racao, frete, sanidade etc., se quiser incluir na margem.",
  },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const numeroAnimais = lerNumeroBr(values.numeroAnimais) ?? undefined;
  const custosAdicionais = lerNumeroBr(values.custosAdicionais) ?? undefined;

  const r = calcularCompraVendaGado({
    pesoVivoCompraKg: lerNumeroBr(values.pesoVivoCompraKg) ?? NaN,
    rendimentoCarcacaCompraPercent: lerNumeroBr(values.rendimentoCarcacaCompraPercent) ?? NaN,
    precoArrobaCompra: lerNumeroBr(values.precoArrobaCompra) ?? NaN,
    pesoVivoVendaKg: lerNumeroBr(values.pesoVivoVendaKg) ?? NaN,
    rendimentoCarcacaVendaPercent: lerNumeroBr(values.rendimentoCarcacaVendaPercent) ?? NaN,
    precoArrobaVenda: lerNumeroBr(values.precoArrobaVenda) ?? NaN,
    numeroAnimais,
    custosAdicionais,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Arrobas na compra", value: `${r.data.arrobasCompraPorAnimal} @/animal` },
      { label: "Valor na compra", value: `R$ ${r.data.valorCompraPorAnimal.toFixed(2)}/animal` },
      { label: "Arrobas na venda", value: `${r.data.arrobasVendaPorAnimal} @/animal` },
      { label: "Valor na venda", value: `R$ ${r.data.valorVendaPorAnimal.toFixed(2)}/animal` },
      { label: "Margem bruta por animal", value: `R$ ${r.data.margemBrutaPorAnimal.toFixed(2)}`, highlight: true },
      ...(r.data.margemBrutaTotal !== null
        ? [{ label: "Margem bruta total", value: `R$ ${r.data.margemBrutaTotal.toFixed(2)}`, highlight: true }]
        : []),
    ],
  };
}

export default function CompraVendaGadoPage() {
  return (
    <CalcPage
      title="Compra e venda de gado (simulacao)"
      description="Simulacao numerica isolada: converte peso vivo em arrobas e projeta margem. Nao integra com o rebanho real do sistema."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: arrobas de carcaca = (peso vivo x rendimento de carcaca) / 15 (1 arroba = 15 kg de carcaca), " +
        "conversao padrao do mercado brasileiro de gado de corte. Fontes: Nutrimosaic, 'Peso do boi: como calcular e " +
        "converter em arrobas'; Corteva, 'Precificacao do boi gordo'. A margem e aritmetica simples sobre valores " +
        "informados pelo usuario: risco de erro aqui e financeiro/planejamento, nao afeta nenhum animal real. Esta " +
        "ferramenta e so simulacao: nao le nem grava dado nenhum do rebanho real (AnimalBatch/Animal)."
      }
    />
  );
}
