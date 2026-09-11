"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import {
  calcularServicoTerceirizado,
  UNIDADES_DE_SERVICO,
  type UnidadeDeServico,
} from "@/lib/calculadoras/custo-da-operacao";

const ROTULO: Record<UnidadeDeServico, string> = {
  hora: "por hora",
  hectare: "por hectare",
  metro: "por metro",
  quilometro: "por quilometro",
  saca: "por saca",
  animal: "por animal",
  diaria: "por diaria",
};

const FIELDS: CalcField[] = [
  {
    key: "unidade",
    label: "Como o servico e cobrado",
    kind: "select",
    defaultValue: "hectare",
    options: UNIDADES_DE_SERVICO.map((u) => ({ value: u, label: ROTULO[u] })),
  },
  { key: "precoPorUnidade", label: "Preco cobrado", kind: "number", suffix: "R$" },
  {
    key: "quantidade",
    label: "Tamanho da operacao",
    kind: "number",
    help: "Na mesma medida da cobranca: horas, hectares, metros.",
  },
  {
    key: "areaHectares",
    label: "Area envolvida (opcional)",
    kind: "number",
    suffix: "ha",
    help: "Preencha quando a cobranca nao for por hectare mas voce quiser o custo por hectare.",
  },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const unidade = String(values.unidade || "hectare") as UnidadeDeServico;
  const r = calcularServicoTerceirizado({
    precoPorUnidade: lerNumeroBr(values.precoPorUnidade) ?? NaN,
    quantidade: lerNumeroBr(values.quantidade) ?? NaN,
    unidade,
    areaHectares: lerNumeroBr(values.areaHectares) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      {
        label: `Cobranca por ${r.data.unidadeLabel}`,
        value: reaisBr(lerNumeroBr(values.precoPorUnidade) ?? 0),
      },
      { label: "Custo total do servico", value: reaisBr(r.data.custoTotal), highlight: true },
      ...(r.data.custoPorHectare !== null
        ? [{ label: "Custo por hectare", value: `${reaisBr(r.data.custoPorHectare)}/ha` }]
        : []),
    ],
  };
}

export default function ServicoTerceirizadoPage() {
  return (
    <CalcPage
      title="Servico terceirizado"
      description="Quanto sai o servico contratado, na unidade em que o prestador cobra."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Multiplicacao do preco pelo tamanho da operacao. O resultado repete a unidade escolhida de proposito: " +
        "trocar hora por hectare sem perceber e o erro que essa conta costuma ter, e ele custa dinheiro na hora " +
        "de fechar o orcamento."
      }
    />
  );
}
