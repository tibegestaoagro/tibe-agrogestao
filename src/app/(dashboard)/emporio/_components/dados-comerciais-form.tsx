"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPatch } from "@/lib/client-api";
import { lerOpcional, paraCampo, rotuloCustoBase } from "./formato";

export type ProdutoParaForm = {
  id: string;
  base_unit: string;
  brand: string | null;
  reference_cost: number | null;
  track_sealed: boolean | null;
  track_sealed_efetivo: boolean;
  track_lot: boolean;
  track_expiry: boolean;
  expense_pct: number | null;
  profit_pct: number | null;
};

const ORDEM = [
  "brand",
  "reference_cost",
  "track_sealed",
  "track_lot",
  "track_expiry",
  "expense_pct",
  "profit_pct",
] as const;
type Campo = (typeof ORDEM)[number];

type Tri = "auto" | "sim" | "nao";
const paraTri = (v: boolean | null): Tri => (v === null ? "auto" : v ? "sim" : "nao");
const deTri = (t: Tri): boolean | null => (t === "auto" ? null : t === "sim");

export function DadosComerciaisForm({
  produto,
  podeExcecao,
}: {
  produto: ProdutoParaForm;
  /** OWNER e ADMIN: só eles mexem nas exceções de percentual (Q55). */
  podeExcecao: boolean;
}) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, "dados");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [brand, setBrand] = useState(produto.brand ?? "");
  const [custo, setCusto] = useState(paraCampo(produto.reference_cost));
  const [lacrado, setLacrado] = useState<Tri>(paraTri(produto.track_sealed));
  const [lote, setLote] = useState(produto.track_lot);
  const [validade, setValidade] = useState(produto.track_expiry);
  const [despesa, setDespesa] = useState(paraCampo(produto.expense_pct));
  const [lucro, setLucro] = useState(paraCampo(produto.profit_pct));

  function reiniciar() {
    setBrand(produto.brand ?? "");
    setCusto(paraCampo(produto.reference_cost));
    setLacrado(paraTri(produto.track_sealed));
    setLote(produto.track_lot);
    setValidade(produto.track_expiry);
    setDespesa(paraCampo(produto.expense_pct));
    setLucro(paraCampo(produto.profit_pct));
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const c = lerOpcional(custo);
    const d = lerOpcional(despesa);
    const l = lerOpcional(lucro);
    if (c === "invalido") novos.reference_cost = "Não consegui ler esse número.";
    if (podeExcecao && d === "invalido") novos.expense_pct = "Não consegui ler esse número.";
    if (podeExcecao && l === "invalido") novos.profit_pct = "Não consegui ler esse número.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPatch(`/api/v1/emporio/products/${produto.id}`, {
      brand: brand.trim() || null,
      reference_cost: c as number | null,
      track_sealed: deTri(lacrado),
      track_lot: lote,
      track_expiry: validade,
      // Operador não pode tocar nas exceções: nem enviar, para o servidor não recusar.
      ...(podeExcecao ? { expense_pct: d as number | null, profit_pct: l as number | null } : {}),
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button variant="outline" size="sm">Editar</Button>}
      title="Dados comerciais"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Marca" id={err.idDe("brand")} error={err.erros.brand}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              err.limparCampo("brand");
            }}
          />
        )}
      </Field>

      <Field
        label={`${rotuloCustoBase(produto.base_unit)} (R$)`}
        id={err.idDe("reference_cost")}
        error={err.erros.reference_cost}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={custo}
            onValueChange={(v) => {
              setCusto(v);
              err.limparCampo("reference_cost");
            }}
          />
        )}
      </Field>

      <Field
        label="Controlar lacrado e avulso"
        hint={
          lacrado === "auto"
            ? `Automático: hoje está ${produto.track_sealed_efetivo ? "ligado" : "desligado"}.`
            : undefined
        }
        id={err.idDe("track_sealed")}
        error={err.erros.track_sealed}
      >
        {({ id, ...aria }) => (
          <Select
            value={lacrado}
            onValueChange={(v) => {
              setLacrado(v as Tri);
              err.limparCampo("track_sealed");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automático</SelectItem>
              <SelectItem value="sim">Ligado</SelectItem>
              <SelectItem value="nao">Desligado</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Lote" id={err.idDe("track_lot")} error={err.erros.track_lot}>
        {({ id, ...aria }) => (
          <label className="flex items-center gap-2 text-sm text-texto-secundario">
            <input
              id={id}
              {...aria}
              type="checkbox"
              checked={lote}
              onChange={(e) => {
                setLote(e.target.checked);
                err.limparCampo("track_lot");
              }}
              className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
            />
            Controlar por lote
          </label>
        )}
      </Field>

      <Field label="Validade" id={err.idDe("track_expiry")} error={err.erros.track_expiry}>
        {({ id, ...aria }) => (
          <label className="flex items-center gap-2 text-sm text-texto-secundario">
            <input
              id={id}
              {...aria}
              type="checkbox"
              checked={validade}
              onChange={(e) => {
                setValidade(e.target.checked);
                err.limparCampo("track_expiry");
              }}
              className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
            />
            Controlar por validade
          </label>
        )}
      </Field>

      {podeExcecao && (
        <>
          <Field
            label="Despesas deste produto (%)"
            hint="Exceção à loja. Em branco, vale o padrão da loja."
            id={err.idDe("expense_pct")}
            error={err.erros.expense_pct}
          >
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                kind="quantidade"
                unit="%"
                value={despesa}
                onValueChange={(v) => {
                  setDespesa(v);
                  err.limparCampo("expense_pct");
                }}
              />
            )}
          </Field>

          <Field
            label="Lucro deste produto (%)"
            hint="Exceção à loja. Em branco, vale o padrão da loja."
            id={err.idDe("profit_pct")}
            error={err.erros.profit_pct}
          >
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                kind="quantidade"
                unit="%"
                value={lucro}
                onValueChange={(v) => {
                  setLucro(v);
                  err.limparCampo("profit_pct");
                }}
              />
            )}
          </Field>
        </>
      )}
    </FormSheet>
  );
}
