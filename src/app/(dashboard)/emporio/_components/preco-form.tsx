"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPut } from "@/lib/client-api";
import { lerOpcional, paraCampo } from "./formato";

export type PrecoParaForm = {
  establishment_id: string;
  presentation_id: string;
  price: number | null;
  expense_pct: number | null;
  profit_pct: number | null;
  suggested_price: number | null;
};

const ORDEM = ["price", "expense_pct", "profit_pct"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * O PUT é um upsert que troca os três valores de uma vez, e `null` limpa. Por
 * isso os dois componentes abaixo sempre reenviam as exceções que já existem:
 * gravar só o preço apagaria os percentuais em silêncio.
 */

export function PrecoForm({
  preco,
  titulo,
}: {
  preco: PrecoParaForm;
  /** "Loja X, Apresentação Y": diz ao usuário o que ele está editando. */
  titulo: string;
}) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, `preco-${preco.establishment_id}-${preco.presentation_id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [valor, setValor] = useState(paraCampo(preco.price));
  const [despesa, setDespesa] = useState(paraCampo(preco.expense_pct));
  const [lucro, setLucro] = useState(paraCampo(preco.profit_pct));

  function reiniciar() {
    setValor(paraCampo(preco.price));
    setDespesa(paraCampo(preco.expense_pct));
    setLucro(paraCampo(preco.profit_pct));
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const p = lerOpcional(valor);
    const d = lerOpcional(despesa);
    const l = lerOpcional(lucro);
    if (p === "invalido") novos.price = "Não consegui ler esse número.";
    if (d === "invalido") novos.expense_pct = "Não consegui ler esse número.";
    if (l === "invalido") novos.profit_pct = "Não consegui ler esse número.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPut("/api/v1/emporio/prices", {
      establishment_id: preco.establishment_id,
      presentation_id: preco.presentation_id,
      price: p as number | null,
      expense_pct: d as number | null,
      profit_pct: l as number | null,
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
      trigger={
        <Button variant="outline" size="sm">
          Editar
        </Button>
      }
      title="Preço na loja"
      description={titulo}
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
      <Field
        label="Preço (R$)"
        hint="Em branco, a apresentação fica sem preço nesta loja."
        id={err.idDe("price")}
        error={err.erros.price}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={valor}
            onValueChange={(v) => {
              setValor(v);
              err.limparCampo("price");
            }}
          />
        )}
      </Field>

      <Field
        label="Despesas desta apresentação (%)"
        hint="Exceção. Em branco, vale a do produto ou a da loja."
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
        label="Lucro desta apresentação (%)"
        hint="Exceção. Em branco, vale o do produto ou o da loja."
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
    </FormSheet>
  );
}

/** Q54: grava o preço sugerido como preço cadastrado, sem painel. */
export function AplicarSugeridoBotao({ preco }: { preco: PrecoParaForm }) {
  const router = useRouter();
  const aviso = useAviso();
  const [pending, setPending] = useState(false);

  async function aplicar() {
    if (preco.suggested_price == null) return;
    setPending(true);
    const res = await apiPut("/api/v1/emporio/prices", {
      establishment_id: preco.establishment_id,
      presentation_id: preco.presentation_id,
      price: preco.suggested_price,
      expense_pct: preco.expense_pct,
      profit_pct: preco.profit_pct,
    });
    setPending(false);
    if (res.ok) router.refresh();
    else aviso.erro(res.message);
  }

  return (
    <Button
      size="sm"
      onClick={aplicar}
      disabled={pending || preco.suggested_price == null}
      title={preco.suggested_price == null ? "Informe o custo do produto para ter um preço sugerido." : undefined}
    >
      {pending ? "..." : "Aplicar sugerido"}
    </Button>
  );
}
