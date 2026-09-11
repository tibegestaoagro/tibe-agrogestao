"use client";

import { useState } from "react";
import Link from "next/link";
import { MoneyInput } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import MateriaisParaLista, { type Material } from "./materiais-para-lista";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Casca compartilhada pelas 22 telas de calculadora: renderiza um formulario
 * generico a partir de uma lista de campos,
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

/**
 * Lista de ingredientes com nome, porcentagem e preco opcional, que cresce e
 * encolhe (§18 do documento do cliente).
 *
 * ⚠️ Existe por causa de UMA ferramenta, a de receitas, e isso foi pesado: a
 * alternativa era tela propria, e ela duplicaria a casca inteira (cabecalho,
 * pilula de confianca, bloco de resultado, nota de fonte) para ganhar um
 * campo. Um quarto membro numa uniao que ja tinha tres sai mais barato que a
 * segunda copia de tudo o mais.
 */
export type CalcIngredientesField = {
  key: string;
  label: string;
  kind: "ingredientes";
  help?: string;
  /** Receitas prontas que preenchem a lista de uma vez. */
  presets?: { nome: string; ingredientes: { nome: string; percentual: number }[] }[];
  /** Quando falso, a coluna de preco nao aparece. */
  comPreco?: boolean;
};

export type LinhaDeIngrediente = { nome: string; percentual: string; preco: string };

export type CalcField =
  | CalcNumberField
  | CalcSelectField
  | CalcCheckboxField
  | CalcIngredientesField;

/** O valor de um campo de ingredientes, dentro do mapa de valores do formulario. */
export type ValorDeCampo = string | boolean | LinhaDeIngrediente[];

export type ResultRow = { label: string; value: string; highlight?: boolean };

/**
 * §37: o que o calculo diz que o produtor precisa COMPRAR.
 *
 * Sai do `compute` da tela, e nao das funcoes de `src/lib/calculadoras/**`,
 * porque elas continuam puras e sem saber que a Lista de Compra existe. A tela
 * ja traduz o resultado em linhas; traduzir tambem em material e o mesmo
 * trabalho, no mesmo lugar.
 */
export type CalcOutcome =
  | { ok: true; rows: ResultRow[]; materiais?: Material[] }
  | { ok: false; error: string };

type Confidence = "alta" | "media" | "baixa";

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  alta: "Confianca alta",
  media: "Confianca media",
  baixa: "Confianca baixa",
};

/**
 * A borda sai da própria tinta, a 30%: os tokens semânticos têm `tinta` e
 * `suave`, e nenhum tom intermediário para contorno. Inventar um token só
 * para três pílulas decorativas seria caro, e a opacidade dá o mesmo efeito
 * sem acrescentar vocabulário.
 */
const CONFIDENCE_CLASS: Record<Confidence, string> = {
  alta: "bg-sucesso-suave text-sucesso-tinta border-sucesso-tinta/30",
  media: "bg-atencao-suave text-atencao-tinta border-atencao-tinta/30",
  baixa: "bg-perigo-suave text-perigo-tinta border-perigo-tinta/30",
};

const LINHA_VAZIA: LinhaDeIngrediente = { nome: "", percentual: "", preco: "" };

function initialValues(fields: CalcField[]): Record<string, ValorDeCampo> {
  const init: Record<string, ValorDeCampo> = {};
  for (const f of fields) {
    if (f.kind === "checkbox") init[f.key] = f.defaultValue ?? false;
    else if (f.kind === "ingredientes") init[f.key] = [{ ...LINHA_VAZIA }, { ...LINHA_VAZIA }];
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
  compute: (values: Record<string, ValorDeCampo>) => CalcOutcome;
}) {
  const [values, setValues] = useState<Record<string, ValorDeCampo>>(() => initialValues(fields));
  const [result, setResult] = useState<CalcOutcome | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(compute(values));
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <Link href="/calculadoras" className="text-xs text-texto-discreto hover:text-tibe-dark hover:underline">
          &larr; Calculadoras
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-texto">{title}</h1>
        <p className="mt-1 text-sm text-texto-secundario">{description}</p>
      </div>

      <span
        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${CONFIDENCE_CLASS[confidence]}`}
      >
        {CONFIDENCE_LABEL[confidence]}: revise com um tecnico antes de aplicar no campo em escala
      </span>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-borda bg-superficie p-4">
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
              <label className="flex items-center gap-2 text-sm text-texto-secundario">
                <input
                  type="checkbox"
                  checked={values[f.key] as boolean}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-tibe-primary"
                />
                {f.label}
              </label>
            )}

            {f.kind === "ingredientes" && (
              <div className="space-y-2">
                {f.presets && f.presets.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {f.presets.map((preset) => (
                      <button
                        key={preset.nome}
                        type="button"
                        onClick={() =>
                          setValues((v) => ({
                            ...v,
                            [f.key]: preset.ingredientes.map((i) => ({
                              nome: i.nome,
                              percentual: String(i.percentual).replace(".", ","),
                              preco: "",
                            })),
                          }))
                        }
                        className="rounded-full border border-borda px-3 py-1 text-xs text-texto-secundario hover:border-tibe-primary hover:text-tibe-dark"
                      >
                        {preset.nome}
                      </button>
                    ))}
                  </div>
                )}

                {(values[f.key] as LinhaDeIngrediente[]).map((linha, indice) => (
                  <div key={indice} className="flex flex-wrap items-start gap-2">
                    <Input
                      aria-label={`Ingrediente ${indice + 1}`}
                      placeholder="Ingrediente"
                      value={linha.nome}
                      onChange={(e) =>
                        setValues((v) => ({
                          ...v,
                          [f.key]: (v[f.key] as LinhaDeIngrediente[]).map((l, i) =>
                            i === indice ? { ...l, nome: e.target.value } : l,
                          ),
                        }))
                      }
                      className="min-w-[8rem] flex-1"
                    />
                    <div className="w-24">
                      <MoneyInput
                        kind="quantidade"
                        aria-label={`Porcentagem do ingrediente ${indice + 1}`}
                        placeholder="%"
                        value={linha.percentual}
                        onValueChange={(valor) =>
                          setValues((v) => ({
                            ...v,
                            [f.key]: (v[f.key] as LinhaDeIngrediente[]).map((l, i) =>
                              i === indice ? { ...l, percentual: valor } : l,
                            ),
                          }))
                        }
                      />
                    </div>
                    {f.comPreco !== false && (
                      <div className="w-28">
                        <MoneyInput
                          kind="quantidade"
                          aria-label={`Preco por quilo do ingrediente ${indice + 1}`}
                          placeholder="R$/kg"
                          value={linha.preco}
                          onValueChange={(valor) =>
                            setValues((v) => ({
                              ...v,
                              [f.key]: (v[f.key] as LinhaDeIngrediente[]).map((l, i) =>
                                i === indice ? { ...l, preco: valor } : l,
                              ),
                            }))
                          }
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      aria-label={`Remover ingrediente ${indice + 1}`}
                      onClick={() =>
                        setValues((v) => {
                          const atual = v[f.key] as LinhaDeIngrediente[];
                          /* Some com a linha, mas a lista nunca fica vazia:
                             formulario sem nenhum campo nao tem como voltar. */
                          const restante = atual.filter((_, i) => i !== indice);
                          return {
                            ...v,
                            [f.key]: restante.length > 0 ? restante : [{ ...LINHA_VAZIA }],
                          };
                        })
                      }
                      className="mt-2 text-sm text-texto-discreto hover:text-perigo-tinta"
                    >
                      remover
                    </button>
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setValues((v) => ({
                      ...v,
                      [f.key]: [...(v[f.key] as LinhaDeIngrediente[]), { ...LINHA_VAZIA }],
                    }))
                  }
                >
                  Adicionar ingrediente
                </Button>
              </div>
            )}

            {f.help && <p className="text-xs text-texto-discreto">{f.help}</p>}
          </div>
        ))}
        <Button type="submit">Calcular</Button>
      </form>

      {result && !result.ok && (
        <p className="rounded-md bg-perigo-suave px-4 py-3 text-sm text-perigo-tinta">{result.error}</p>
      )}

      {result && result.ok && (
        <div className="rounded-lg border border-borda bg-superficie p-4">
          <h2 className="mb-3 text-sm font-semibold text-texto">Resultado</h2>
          <dl className="space-y-2">
            {result.rows.map((r) => (
              <div
                key={r.label}
                className={`flex items-center justify-between gap-4 text-sm ${
                  r.highlight ? "font-semibold text-tibe-dark" : "text-texto-secundario"
                }`}
              >
                <dt>{r.label}</dt>
                <dd className="text-right">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* A `key` derivada do proprio material remonta o painel quando o
          produtor recalcula. As escolhas dele (produto, incluir ou nao) sao
          por POSICAO, e sem isso a marca de "nao incluir" o segundo item
          sobreviveria a um calculo em que o segundo item e outra coisa. */}
      {result && result.ok && result.materiais && result.materiais.length > 0 && (
        <MateriaisParaLista
          key={result.materiais.map((m) => `${m.descricao}:${m.quantidade}`).join("|")}
          materiais={result.materiais}
        />
      )}

      <p className="text-xs leading-relaxed text-texto-discreto">{sourceNote}</p>
    </div>
  );
}
