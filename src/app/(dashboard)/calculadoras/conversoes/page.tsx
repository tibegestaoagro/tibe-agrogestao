"use client";

import CalcPage, { type CalcField, type CalcOutcome, type ValorDeCampo } from "../_components/calc-page";
import { lerNumeroBr } from "@/lib/numero-br";
import {
  converter,
  UNIDADES,
  UNIDADES_POR_DIMENSAO,
  type UnidadeKey,
} from "@/lib/calculadoras/conversoes";

/*
 * Uma lista so, com as quatro dimensoes juntas: separar por dimensao exigiria
 * dois seletores encadeados, e converter hectare em quilo nao e um erro que o
 * produtor comete. Quando acontece, a recusa explica.
 */
const OPCOES = (Object.keys(UNIDADES_POR_DIMENSAO) as (keyof typeof UNIDADES_POR_DIMENSAO)[])
  .flatMap((dimensao) => UNIDADES_POR_DIMENSAO[dimensao])
  .map((chave) => ({ value: chave, label: UNIDADES[chave].label }));

const FIELDS: CalcField[] = [
  { key: "valor", label: "Valor", kind: "number" },
  { key: "de", label: "De", kind: "select", defaultValue: "hectare", options: OPCOES },
  { key: "para", label: "Para", kind: "select", defaultValue: "alqueire_paulista", options: OPCOES },
  {
    key: "pesoSacaKg",
    label: "Peso da saca (kg)",
    kind: "number",
    help: "So e necessario quando a saca entra na conversao. A de semente costuma ter 10 kg, a de adubo 50.",
  },
];

function compute(values: Record<string, ValorDeCampo>): CalcOutcome {
  const r = converter({
    valor: lerNumeroBr(values.valor) ?? NaN,
    de: String(values.de || "hectare") as UnidadeKey,
    para: String(values.para || "hectare") as UnidadeKey,
    pesoSacaKg: lerNumeroBr(values.pesoSacaKg) ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [
      {
        label: `${lerNumeroBr(values.valor)} ${r.data.deLabel} em ${r.data.paraLabel}`,
        value: `${r.data.valorConvertido}`,
        highlight: true,
      },
    ],
  };
}

export default function ConversoesPage() {
  return (
    <CalcPage
      title="Conversoes rurais"
      description="Hectare, alqueire, metro quadrado, arroba, saca, tonelada, litro e quilometro."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Sao equivalencias legais e de uso consagrado, nao estimativa. O alqueire aparece com sobrenome de " +
        "proposito: o paulista tem 24.200 m2, o mineiro 48.400 e o do norte 27.225, entao 'alqueire' sozinho " +
        "pode significar o dobro ou a metade da area. A arroba usada e a de 15 kg, do comercio de boi gordo, e " +
        "a saca so converte quando voce diz quantos quilos ela tem."
      }
    />
  );
}
