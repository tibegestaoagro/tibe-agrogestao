"use client";

import CalcPage, { type CalcField, type CalcOutcome } from "../_components/calc-page";
import { calcularCocho } from "@/lib/calculadoras/cocho";

const FIELDS: CalcField[] = [
  { key: "numeroAnimais", label: "Numero de animais", kind: "number", step: "1" },
  {
    key: "acessoDoisLados",
    label: "Cocho com acesso pelos 2 lados",
    kind: "checkbox",
    defaultValue: true,
    help: "Desmarque se o cocho ficar encostado numa cerca/parede (acesso so por 1 lado).",
  },
];

function compute(values: Record<string, string | boolean>): CalcOutcome {
  const r = calcularCocho({
    numeroAnimais: Number(values.numeroAnimais),
    acessoDoisLados: Boolean(values.acessoDoisLados),
  });
  if (!r.ok) return { ok: false, error: r.error };

  return {
    ok: true,
    rows: [{ label: "Comprimento de cocho necessario", value: `${r.data.comprimentoCochoMetros} m`, highlight: true }],
  };
}

export default function CochoPage() {
  return (
    <CalcPage
      title="Cocho (sal mineral)"
      description="Comprimento linear de cocho de sal mineral necessario para o rebanho ter acesso sem disputa."
      confidence="alta"
      fields={FIELDS}
      compute={compute}
      sourceNote={
        "Formula: 5 cm de acesso por cabeca, de cada lado do cocho. Fonte: Embrapa Gado de Corte (CNPGC), 'Qual e o " +
        "tamanho, o numero e a localizacao ideal do cocho de minerais?' (cloud.cnpgc.embrapa.br). Exemplo da propria " +
        "Embrapa conferido: 100 vacas precisam de 2,5 m de cocho com acesso nos 2 lados. Vale so para cocho de SAL " +
        "MINERAL, nao para cocho de racao/volumoso de confinamento (espacamento bem maior, sem fonte Embrapa unica " +
        "encontrada nesta rodada)."
      }
    />
  );
}
