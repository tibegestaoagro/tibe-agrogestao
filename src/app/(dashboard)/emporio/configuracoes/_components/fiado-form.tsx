"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPatch } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { paraCampo } from "../../_components/formato";

export type FiadoParaForm = {
  fiado_due_days: number;
  fiado_block_after_days: number;
  fiado_default_limit: number | null;
  fiado_collection_message: string | null;
};

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["fiado_due_days", "fiado_block_after_days", "fiado_default_limit", "fiado_collection_message"] as const;
type Campo = (typeof ORDEM)[number];

const CLASSE_TEXTAREA =
  "flex min-h-24 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-base shadow-sm " +
  "transition-colors placeholder:text-texto-discreto sm:text-sm " +
  "focus-visible:outline-none focus-visible:border-primaria-tinta focus-visible:ring-2 focus-visible:ring-primaria-tinta/40";

const diasValidos = (bruto: string) => {
  const n = Number(bruto);
  return /^\d+$/.test(bruto.trim()) && n >= 1 && n <= 365;
};

/** Prazo, bloqueio, limite padrão e mensagem de cobrança do fiado: da conta, gravam juntos. */
export function FiadoForm({ fiado }: { fiado: FiadoParaForm }) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, "fiado");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [prazo, setPrazo] = useState(String(fiado.fiado_due_days));
  const [bloqueio, setBloqueio] = useState(String(fiado.fiado_block_after_days));
  const [limite, setLimite] = useState(paraCampo(fiado.fiado_default_limit));
  const [mensagem, setMensagem] = useState(fiado.fiado_collection_message ?? "");

  function reiniciar() {
    setPrazo(String(fiado.fiado_due_days));
    setBloqueio(String(fiado.fiado_block_after_days));
    setLimite(paraCampo(fiado.fiado_default_limit));
    setMensagem(fiado.fiado_collection_message ?? "");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!diasValidos(prazo)) novos.fiado_due_days = "O prazo deve ser de 1 a 365 dias.";
    if (!diasValidos(bloqueio)) novos.fiado_block_after_days = "O bloqueio deve ser de 1 a 365 dias de atraso.";
    const valorDoLimite = limite.trim() === "" ? null : lerNumeroBr(limite);
    if (limite.trim() !== "" && (valorDoLimite === null || valorDoLimite < 0)) {
      novos.fiado_default_limit = "Digite um valor em reais, ou deixe vazio para não limitar.";
    }
    if (mensagem.length > 500) novos.fiado_collection_message = "A mensagem aceita até 500 caracteres.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPatch("/api/v1/emporio/settings/fiado", {
      fiado_due_days: Number(prazo),
      fiado_block_after_days: Number(bloqueio),
      fiado_default_limit: valorDoLimite,
      fiado_collection_message: mensagem.trim() || null,
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
      trigger={<Button variant="outline">Mudar</Button>}
      title="Fiado"
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
        label="Prazo padrão (dias)"
        hint="Quantos dias depois da venda o fiado vence, quando ninguém escolhe a data."
        id={err.idDe("fiado_due_days")}
        error={err.erros.fiado_due_days}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            inputMode="numeric"
            autoComplete="off"
            value={prazo}
            onChange={(e) => {
              setPrazo(e.target.value.replace(/\D/g, "").slice(0, 3));
              err.limparCampo("fiado_due_days");
            }}
          />
        )}
      </Field>

      <Field
        label="Bloquear o fiado após (dias de atraso)"
        hint="Com fiado vencido há mais dias que isto, o cliente não compra mais em fiado."
        id={err.idDe("fiado_block_after_days")}
        error={err.erros.fiado_block_after_days}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            inputMode="numeric"
            autoComplete="off"
            value={bloqueio}
            onChange={(e) => {
              setBloqueio(e.target.value.replace(/\D/g, "").slice(0, 3));
              err.limparCampo("fiado_block_after_days");
            }}
          />
        )}
      </Field>

      <Field
        label="Limite padrão (R$)"
        hint="Vale para quem não tem limite próprio. Vazio, sem limite de valor."
        id={err.idDe("fiado_default_limit")}
        error={err.erros.fiado_default_limit}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            placeholder="Sem limite de valor"
            value={limite}
            onValueChange={(valor) => {
              setLimite(valor);
              err.limparCampo("fiado_default_limit");
            }}
          />
        )}
      </Field>

      <Field
        label="Mensagem de cobrança"
        hint="Use {nome}, {valor}, {dias} (sai por extenso, como 20 dias) e {loja}. Até 500 caracteres. Em branco, vale a mensagem padrão."
        id={err.idDe("fiado_collection_message")}
        error={err.erros.fiado_collection_message}
      >
        {({ id, ...aria }) => (
          <textarea
            id={id}
            {...aria}
            rows={4}
            className={CLASSE_TEXTAREA}
            value={mensagem}
            onChange={(e) => {
              setMensagem(e.target.value);
              err.limparCampo("fiado_collection_message");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
