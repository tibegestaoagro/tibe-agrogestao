"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { calcularCerca } from "@/lib/calculadoras/cerca";

const FIELDS: CalcField[] = [
  { key: "comprimentoMetros", label: "Comprimento da cerca", kind: "number", suffix: "metros" },
  { key: "espacamentoMetros", label: "Espacamento entre mouroes", kind: "number", suffix: "metros", defaultValue: 3 },
  { key: "numeroFios", label: "Numero de fios de arame", kind: "number", defaultValue: 4, step: "1" },
  {
    key: "metrosPorRoloArame",
    label: "Metros por rolo de arame (opcional)",
    kind: "number",
    suffix: "metros",
    help: "Preencha se quiser saber quantos rolos comprar (rolos comuns tem 500m).",
  },
  {
    key: "espacamentoEstacasMetros",
    label: "Espacamento entre estacas (opcional)",
    kind: "number",
    suffix: "metros",
    help: "A estaca fica entre os mouroes, so segurando o fio. Precisa ser menor que o espacamento dos mouroes.",
  },
  { key: "quantidadePorteiras", label: "Porteiras (opcional)", kind: "number", step: "1" },
  {
    key: "margemSegurancaPercent",
    label: "Margem de seguranca (opcional)",
    kind: "number",
    suffix: "%",
    help: "Folga sobre todo o material, para quem prefere sobrar a voltar na loja.",
  },
  { key: "precoRoloArame", label: "Preco do rolo de arame (opcional)", kind: "number", suffix: "R$" },
  { key: "precoMourao", label: "Preco do mourao (opcional)", kind: "number", suffix: "R$" },
  { key: "precoEstaca", label: "Preco da estaca (opcional)", kind: "number", suffix: "R$" },
  { key: "precoGrampoPorKg", label: "Preco do grampo por kg (opcional)", kind: "number", suffix: "R$" },
  { key: "precoPorteira", label: "Preco da porteira (opcional)", kind: "number", suffix: "R$" },
  { key: "maoDeObraPorMetro", label: "Mao de obra por metro (opcional)", kind: "number", suffix: "R$" },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const r = calcularCerca({
    comprimentoMetros: lerNumeroBr(values.comprimentoMetros) ?? NaN,
    espacamentoMetros: lerNumeroBr(values.espacamentoMetros) ?? NaN,
    numeroFios: lerNumeroBr(values.numeroFios) ?? NaN,
    metrosPorRoloArame: lerNumeroBr(values.metrosPorRoloArame) ?? undefined,
    espacamentoEstacasMetros: lerNumeroBr(values.espacamentoEstacasMetros) ?? undefined,
    quantidadePorteiras: lerNumeroBr(values.quantidadePorteiras) ?? undefined,
    margemSegurancaPercent: lerNumeroBr(values.margemSegurancaPercent) ?? undefined,
    precoRoloArame: lerNumeroBr(values.precoRoloArame) ?? undefined,
    precoMourao: lerNumeroBr(values.precoMourao) ?? undefined,
    precoEstaca: lerNumeroBr(values.precoEstaca) ?? undefined,
    precoGrampoPorKg: lerNumeroBr(values.precoGrampoPorKg) ?? undefined,
    precoPorteira: lerNumeroBr(values.precoPorteira) ?? undefined,
    maoDeObraPorMetro: lerNumeroBr(values.maoDeObraPorMetro) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      { label: "Mouroes necessarios", value: `${r.data.mouroesNecessarios} un`, highlight: true },
      { label: "Arame necessario", value: `${r.data.metrosDeArameNecessarios} m` },
      ...(r.data.rolosDeArameNecessarios !== null
        ? [{ label: "Rolos de arame", value: `${r.data.rolosDeArameNecessarios} un` }]
        : []),
      ...(r.data.estacasNecessarias !== null
        ? [{ label: "Estacas", value: `${r.data.estacasNecessarias} un` }]
        : []),
      { label: "Grampos", value: `${r.data.gramposKg} kg` },
      ...(r.data.porteiras > 0 ? [{ label: "Porteiras", value: `${r.data.porteiras} un` }] : []),
      ...(r.data.custoMaterial !== null
        ? [{ label: "Custo do material", value: reaisBr(r.data.custoMaterial) }]
        : []),
      ...(r.data.custoMaoDeObra !== null
        ? [{ label: "Custo da mao de obra", value: reaisBr(r.data.custoMaoDeObra) }]
        : []),
      ...(r.data.custoTotal !== null
        ? [{ label: "Custo total", value: reaisBr(r.data.custoTotal), highlight: true }]
        : []),
      ...(r.data.custoPorMetro !== null
        ? [{ label: "Custo por metro de cerca", value: `${reaisBr(r.data.custoPorMetro)}/m` }]
        : []),
    ],
  };
}

export default function CercaPage() {
  return (
    <CalcPage
      title="Cerca"
      description="Material e custo de uma cerca retilinea simples, com estacas, grampos e porteiras."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: mouroes = comprimento/espacamento (arredondado para cima) + 1; arame = comprimento x numero de " +
        "fios x 1,05 (folga de 5%); grampos = 2 por fio em cada mourao, e 200 grampos fazem 1 kg. " +
        "Fontes: Calculadora Rural (calculadorarural.com.br/ferramentas/dimensionamento-cerca) e Casa das Cercas. " +
        "Canto e esticador ficam fora: exigem reforco a parte e variam demais entre propriedades. A porteira " +
        "entra como peca a comprar, e o vao que ela ocupa nao e descontado do arame, porque depende do modelo."
      }
    />
  );
}
