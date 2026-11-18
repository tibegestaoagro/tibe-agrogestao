"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CartaoAReceberView } from "@/lib/actions/emporio-financeiro";
import { apiPost } from "@/lib/client-api";
import { dataBr } from "@/lib/emporio/datas";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["received_amount", "notes"] as const;
type Campo = (typeof ORDEM)[number];

const cent = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
/** O valor como o MoneyInput lê: vírgula decimal, sem milhar. */
export const valorParaCampo = (n: number) => n.toFixed(2).replace(".", ",");

/**
 * A pergunta de confirmação quando o que caiu difere mais de 10% do previsto (o servidor não recusa: a
 * confirmação é da tela). `null` quando a diferença é pequena ou não há diferença.
 */
export function perguntaDeDiferenca(previstoCent: number, recebidoCent: number): string | null {
  const diff = recebidoCent - previstoCent;
  if (diff === 0 || Math.abs(diff) * 10 <= previstoCent) return null;
  return diff < 0
    ? `Caiu ${reaisBr(Math.abs(diff) / 100)} a menos do que o previsto. Confirma?`
    : `Caiu ${reaisBr(diff / 100)} a mais do que o previsto. Confirma?`;
}

/** Conferir uma parcela: o que caiu de fato (padrão o previsto) e, se quiser, uma observação. */
export function ConferirParcelaForm({ parcela }: { parcela: CartaoAReceberView }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `conferir-${parcela.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [valor, setValor] = useState(valorParaCampo(parcela.effective_net));
  const [notas, setNotas] = useState("");
  const [pergunta, setPergunta] = useState<string | null>(null);

  async function submit() {
    const n = lerNumeroBr(valor);
    const novos: Partial<Record<Campo, string>> = {};
    if (n === null || n < 0) novos.received_amount = "Informe o valor que caiu, zero ou mais.";
    if (Object.keys(novos).length > 0 || n === null) {
      setPergunta(null);
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    if (pergunta === null) {
      const p = perguntaDeDiferenca(cent(parcela.effective_net), cent(n));
      if (p) {
        err.limparTudo();
        setPergunta(p);
        return;
      }
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/finance/card-receivables/${parcela.id}/confirm`, {
      received_amount: n,
      ...(notas.trim() ? { notes: notas.trim() } : {}),
    });
    setLoading(false);
    if (!res.ok) {
      setPergunta(null);
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Parcela conferida.");
    setOpen(false);
    setPergunta(null);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-0">
          Conferir
        </Button>
      }
      title="Conferir a parcela"
      description={`Parcela ${parcela.installment}/${parcela.installments} da venda nº ${parcela.sale_number}, que caiu em ${dataBr(parcela.effective_on)} na conta ${parcela.bank_account_name}. Previsto: ${reaisBr(parcela.effective_net)}.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setValor(valorParaCampo(parcela.effective_net));
          setNotas("");
          setPergunta(null);
        }
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={pergunta ? "Confirmar e conferir" : "Conferir"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Valor que caiu (R$)" required id={err.idDe("received_amount")} error={err.erros.received_amount}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={valor}
            onValueChange={(v) => {
              setValor(v);
              setPergunta(null);
              err.limparCampo("received_amount");
            }}
          />
        )}
      </Field>

      <Field label="Observação" id={err.idDe("notes")} error={err.erros.notes}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            maxLength={500}
            value={notas}
            onChange={(e) => {
              setNotas(e.target.value);
              err.limparCampo("notes");
            }}
          />
        )}
      </Field>

      {pergunta && (
        <p role="alert" className="rounded-md border border-atencao-tinta/30 bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
          {pergunta}
        </p>
      )}
    </FormSheet>
  );
}
