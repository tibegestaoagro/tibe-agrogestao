"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { calcularCustoDeMaoDeObra } from "@/lib/calculadoras/custo-de-mao-de-obra";

const FIELDS: CalcField[] = [
  { key: "numeroTrabalhadores", label: "Trabalhadores", kind: "number", defaultValue: 1 },
  { key: "valorDiaria", label: "Valor da diaria", kind: "number", suffix: "R$" },
  {
    key: "numeroDias",
    label: "Dias de servico",
    kind: "number",
    help: "Deixe vazio se preferir que a conta descubra pelos dois campos seguintes.",
  },
  {
    key: "producaoPorDia",
    label: "Producao da equipe por dia (opcional)",
    kind: "number",
    help: "Por exemplo: 200 metros de cerca por dia.",
  },
  {
    key: "tamanhoDoServico",
    label: "Tamanho total do servico (opcional)",
    kind: "number",
    help: "Na mesma medida da producao: 1.000 metros, 20 hectares.",
  },
  { key: "alimentacao", label: "Alimentacao (opcional)", kind: "number", suffix: "R$" },
  { key: "transporte", label: "Transporte (opcional)", kind: "number", suffix: "R$" },
  { key: "hospedagem", label: "Hospedagem (opcional)", kind: "number", suffix: "R$" },
  { key: "outros", label: "Outros custos (opcional)", kind: "number", suffix: "R$" },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const r = calcularCustoDeMaoDeObra({
    numeroTrabalhadores: lerNumeroBr(values.numeroTrabalhadores) ?? NaN,
    valorDiaria: lerNumeroBr(values.valorDiaria) ?? NaN,
    numeroDias: lerNumeroBr(values.numeroDias) ?? undefined,
    producaoPorDia: lerNumeroBr(values.producaoPorDia) ?? undefined,
    tamanhoDoServico: lerNumeroBr(values.tamanhoDoServico) ?? undefined,
    alimentacao: lerNumeroBr(values.alimentacao) ?? undefined,
    transporte: lerNumeroBr(values.transporte) ?? undefined,
    hospedagem: lerNumeroBr(values.hospedagem) ?? undefined,
    outros: lerNumeroBr(values.outros) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      {
        label: r.data.diasCalculados ? "Dias de trabalho estimados" : "Dias de trabalho",
        value: `${r.data.dias}`,
        highlight: r.data.diasCalculados,
      },
      { label: "Custo das diarias", value: reaisBr(r.data.custoDiarias) },
      ...(r.data.custosAdicionais > 0
        ? [{ label: "Custos adicionais", value: reaisBr(r.data.custosAdicionais) }]
        : []),
      { label: "Custo total", value: reaisBr(r.data.custoTotal), highlight: true },
      { label: "Custo por dia", value: reaisBr(r.data.custoPorDia) },
    ],
  };
}

export default function CustoDeMaoDeObraPage() {
  return (
    <CalcPage
      title="Custo de mao de obra"
      description="Quanto custa um servico por diaria, e quantos dias ele leva no ritmo da sua equipe."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Multiplicacao de diaria por gente e por dia, mais os extras. O dia arredonda para cima: 4,3 dias sao 5 " +
        "diarias pagas, porque ninguem contrata meia diaria para terminar o ultimo trecho. Para saber quantos " +
        "FUNCIONARIOS a fazenda precisa, e a outra calculadora, a de mao de obra."
      }
    />
  );
}
