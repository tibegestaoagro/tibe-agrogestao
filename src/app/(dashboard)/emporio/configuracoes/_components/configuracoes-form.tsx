"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPatch } from "@/lib/client-api";

export type ConfiguracoesParaForm = {
  quote_validity_days: number;
  quote_footer: string | null;
  sale_footer: string | null;
  receipt_width: 80 | 58;
};

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["quote_validity_days", "quote_footer", "sale_footer", "receipt_width"] as const;
type Campo = (typeof ORDEM)[number];

const CLASSE_TEXTAREA =
  "flex min-h-24 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-base shadow-sm " +
  "transition-colors placeholder:text-texto-discreto sm:text-sm " +
  "focus-visible:outline-none focus-visible:border-primaria-tinta focus-visible:ring-2 focus-visible:ring-primaria-tinta/40";

/** Validade, rodapés e largura da bobina: um painel só, porque são da conta e gravam juntos. */
export function ConfiguracoesForm({ configuracoes }: { configuracoes: ConfiguracoesParaForm }) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, "config");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [validade, setValidade] = useState(String(configuracoes.quote_validity_days));
  const [rodapeOrcamento, setRodapeOrcamento] = useState(configuracoes.quote_footer ?? "");
  const [rodapeVenda, setRodapeVenda] = useState(configuracoes.sale_footer ?? "");
  const [largura, setLargura] = useState(String(configuracoes.receipt_width));

  function reiniciar() {
    setValidade(String(configuracoes.quote_validity_days));
    setRodapeOrcamento(configuracoes.quote_footer ?? "");
    setRodapeVenda(configuracoes.sale_footer ?? "");
    setLargura(String(configuracoes.receipt_width));
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const dias = Number(validade);
    if (!/^\d+$/.test(validade.trim()) || dias < 1 || dias > 365) {
      novos.quote_validity_days = "A validade deve ser de 1 a 365 dias.";
    }
    if (rodapeOrcamento.length > 500) novos.quote_footer = "O rodapé aceita até 500 caracteres.";
    if (rodapeVenda.length > 500) novos.sale_footer = "O rodapé aceita até 500 caracteres.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPatch("/api/v1/emporio/settings", {
      quote_validity_days: dias,
      quote_footer: rodapeOrcamento.trim() || null,
      sale_footer: rodapeVenda.trim() || null,
      receipt_width: Number(largura),
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
      trigger={<Button variant="outline">Editar</Button>}
      title="Impressão e orçamento"
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
        label="Validade do orçamento (dias)"
        hint="De 1 a 365."
        id={err.idDe("quote_validity_days")}
        error={err.erros.quote_validity_days}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            inputMode="numeric"
            autoComplete="off"
            value={validade}
            onChange={(e) => {
              setValidade(e.target.value.replace(/\D/g, "").slice(0, 3));
              err.limparCampo("quote_validity_days");
            }}
          />
        )}
      </Field>

      <Field
        label="Rodapé do orçamento"
        hint="Até 500 caracteres. Em branco, sem rodapé."
        id={err.idDe("quote_footer")}
        error={err.erros.quote_footer}
      >
        {({ id, ...aria }) => (
          <textarea
            id={id}
            {...aria}
            rows={3}
            className={CLASSE_TEXTAREA}
            value={rodapeOrcamento}
            onChange={(e) => {
              setRodapeOrcamento(e.target.value);
              err.limparCampo("quote_footer");
            }}
          />
        )}
      </Field>

      <Field
        label="Rodapé da venda"
        hint="Até 500 caracteres. Em branco, sem rodapé."
        id={err.idDe("sale_footer")}
        error={err.erros.sale_footer}
      >
        {({ id, ...aria }) => (
          <textarea
            id={id}
            {...aria}
            rows={3}
            className={CLASSE_TEXTAREA}
            value={rodapeVenda}
            onChange={(e) => {
              setRodapeVenda(e.target.value);
              err.limparCampo("sale_footer");
            }}
          />
        )}
      </Field>

      <Field label="Largura da bobina" id={err.idDe("receipt_width")} error={err.erros.receipt_width}>
        {({ id, ...aria }) => (
          <Select
            value={largura}
            onValueChange={(v) => {
              setLargura(v);
              err.limparCampo("receipt_width");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="80">80 mm</SelectItem>
              <SelectItem value="58">58 mm</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
    </FormSheet>
  );
}
