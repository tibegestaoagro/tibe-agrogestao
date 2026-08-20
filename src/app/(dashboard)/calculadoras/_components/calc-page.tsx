"use client";

import { useState } from "react";
import Link from "next/link";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Casca compartilhada por todas as 12 telas de calculadora (Onda 3, agente
 * C2): renderiza um formulario generico a partir de uma lista de campos,
 * chama a funcao de calculo pura de `src/lib/calculadoras/**` no submit, e
 * mostra o resultado. Nenhuma chamada de rede, nenhuma escrita no banco:
 * tudo roda no client, na hora.
 */

export type CalcNumberField = {
  key: string;
  label: string;
  kind: "number";
  placeholder?: string;
  suffix?: string;
  help?: string;
  defaultValue?: number;
  step?: string;
};

export type CalcSelectField = {
  key: string;
  label: string;
  kind: "select";
  options: { value: string; label: string }[];
  defaultValue?: string;
  help?: string;
};

export type CalcCheckboxField = {
  key: string;
  label: string;
  kind: "checkbox";
  defaultValue?: boolean;
  help?: string;
};

export type CalcField = CalcNumberField | CalcSelectField | CalcCheckboxField;

export type ResultRow = { label: string; value: string; highlight?: boolean };

export type CalcOutcome = { ok: true; rows: ResultRow[] } | { ok: false; error: string };

type Confidence = "alta" | "media" | "baixa";

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  alta: "Confianca alta",
  media: "Confianca media",
  baixa: "Confianca baixa",
};

const CONFIDENCE_CLASS: Record<Confidence, string> = {
  alta: "bg-green-50 text-green-700 border-green-200",
  media: "bg-amber-50 text-amber-700 border-amber-200",
  baixa: "bg-red-50 text-red-700 border-red-200",
};

function initialValues(fields: CalcField[]): Record<string, string | boolean> {
  const init: Record<string, string | boolean> = {};
  for (const f of fields) {
    if (f.kind === "checkbox") init[f.key] = f.defaultValue ?? false;
    else init[f.key] = f.defaultValue !== undefined ? String(f.defaultValue) : "";
  }
  return init;
}

export default function CalcPage({
  title,
  description,
  confidence,
  sourceNote,
  fields,
  compute,
}: {
  title: string;
  description: string;
  confidence: Confidence;
  sourceNote: string;
  fields: CalcField[];
  compute: (values: Record<string, string | boolean>) => CalcOutcome;
}) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() => initialValues(fields));
  const [result, setResult] = useState<CalcOutcome | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(compute(values));
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/calculadoras" className="text-xs text-gray-500 hover:text-tibe-dark hover:underline">
          &larr; Calculadoras
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">{title}</h1>
        <p className="mt-1 text-sm text-gray-600">{description}</p>
      </div>

      <span
        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${CONFIDENCE_CLASS[confidence]}`}
      >
        {CONFIDENCE_LABEL[confidence]}: revise com um tecnico antes de aplicar no campo em escala
      </span>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        {fields.map((f) => (
          <div key={f.key} className="space-y-1.5">
            {f.kind !== "checkbox" && <Label htmlFor={f.key}>{f.label}</Label>}

            {/* O campo era `type="number"`, e o parser do navegador e o do
                ingles: "1.500" virava 1,5 e a conta saia mil vezes menor, sem
                erro nenhum na tela. Numa calculadora isso pesa mais que num
                formulario, porque o resultado nao fica guardado, vira
                recomendacao levada para o campo. */}
            {f.kind === "number" && (
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <MoneyInput
                    id={f.key}
                    kind="quantidade"
                    unit={f.suffix}
                    placeholder={f.placeholder}
                    value={values[f.key] as string}
                    onValueChange={(valor) => setValues((v) => ({ ...v, [f.key]: valor }))}
                  />
                </div>
                {f.suffix && (
                  <span className="mt-2 whitespace-nowrap text-sm text-texto-secundario">
                    {f.suffix}
                  </span>
                )}
              </div>
            )}

            {f.kind === "select" && (
              <Select
                value={values[f.key] as string}
                onValueChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))}
              >
                <SelectTrigger id={f.key}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {f.kind === "checkbox" && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={values[f.key] as boolean}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-primaria-tinta focus:ring-tibe-primary"
                />
                {f.label}
              </label>
            )}

            {f.help && <p className="text-xs text-gray-500">{f.help}</p>}
          </div>
        ))}
        <Button type="submit">Calcular</Button>
      </form>

      {result && !result.ok && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{result.error}</p>
      )}

      {result && result.ok && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Resultado</h2>
          <dl className="space-y-2">
            {result.rows.map((r) => (
              <div
                key={r.label}
                className={`flex items-center justify-between gap-4 text-sm ${
                  r.highlight ? "font-semibold text-tibe-dark" : "text-gray-700"
                }`}
              >
                <dt>{r.label}</dt>
                <dd className="text-right">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <p className="text-xs leading-relaxed text-gray-500">{sourceNote}</p>
    </div>
  );
}
