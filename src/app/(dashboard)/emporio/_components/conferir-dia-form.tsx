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
import { perguntaDeDiferenca, valorParaCampo } from "./conferir-parcela-form";

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["received_total", "notes"] as const;
type Campo = (typeof ORDEM)[number];

const cent = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

export type GrupoDoDia = {
  chave: string;
  effective_on: string;
  bank_account_id: string;
  bank_account_name: string;
  acquirer_id: string;
  acquirer_name: string;
  parcelas: CartaoAReceberView[];
};

/** Conferir o dia: as parcelas não conferidas de uma data, adquirente e conta, com o total que caiu. */
export function ConferirDiaForm({ grupo, loja = "" }: { grupo: GrupoDoDia; loja?: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `dia-${grupo.chave}`);
  const previstoCent = grupo.parcelas.reduce((s, p) => s + cent(p.effective_net), 0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(valorParaCampo(previstoCent / 100));
  const [notas, setNotas] = useState("");
  const [pergunta, setPergunta] = useState<string | null>(null);

  async function submit() {
    const n = lerNumeroBr(total);
    const novos: Partial<Record<Campo, string>> = {};
    if (n === null || n < 0) novos.received_total = "Informe o total que caiu, zero ou mais.";
    if (Object.keys(novos).length > 0 || n === null) {
      setPergunta(null);
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    if (pergunta === null) {
      const p = perguntaDeDiferenca(previstoCent, cent(n));
      if (p) {
        err.limparTudo();
        setPergunta(p);
        return;
      }
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/finance/card-receivables/confirm-day", {
      bank_account_id: grupo.bank_account_id,
      acquirer_id: grupo.acquirer_id,
      effective_on: grupo.effective_on,
      received_total: n,
      ...(loja ? { establishment_id: loja } : {}),
      ...(notas.trim() ? { notes: notas.trim() } : {}),
    });
    setLoading(false);
    if (!res.ok) {
      setPergunta(null);
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Dia conferido.");
    setOpen(false);
    setPergunta(null);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-0">
          Conferir o dia
        </Button>
      }
      title="Conferir o dia"
      description={`${grupo.acquirer_name}, ${dataBr(grupo.effective_on)}, conta ${grupo.bank_account_name}. Informe o total que caiu: a diferença se reparte entre as parcelas.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setTotal(valorParaCampo(previstoCent / 100));
          setNotas("");
          setPergunta(null);
        }
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={pergunta ? "Confirmar e conferir" : "Conferir o dia"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <div className="space-y-1 text-sm">
        <p className="font-medium text-texto">
          {grupo.parcelas.length === 1 ? "1 parcela" : `${grupo.parcelas.length} parcelas`}, previsto{" "}
          {reaisBr(previstoCent / 100)}
        </p>
        <ul className="divide-y divide-borda rounded-md border border-borda">
          {grupo.parcelas.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 px-3 py-1.5 text-texto-secundario">
              <span className="min-w-0">
                Venda nº {p.sale_number}, parcela {p.installment}/{p.installments}
              </span>
              <span className="shrink-0 text-texto">{reaisBr(p.effective_net)}</span>
            </li>
          ))}
        </ul>
      </div>

      <Field label="Total que caiu (R$)" required id={err.idDe("received_total")} error={err.erros.received_total}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={total}
            onValueChange={(v) => {
              setTotal(v);
              setPergunta(null);
              err.limparCampo("received_total");
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
