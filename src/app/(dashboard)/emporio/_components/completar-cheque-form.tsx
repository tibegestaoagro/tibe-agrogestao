"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

const ORDEM = ["number", "bank", "good_for", "holder_name"] as const;
type Campo = (typeof ORDEM)[number];

export type ChequeParaCompletar = {
  id: string;
  number: string | null;
  bank: string | null;
  good_for: string | null;
  holder_name: string;
  incomplete: boolean;
};

/**
 * Completar (cheque que entrou só com valor e nome) ou corrigir (cheque
 * completo, ainda na carteira). Pré-preenche com o que o cheque já tem e envia
 * só o que mudou. O servidor não deixa apagar o que já está preenchido.
 */
export function CompletarChequeForm({ cheque }: { cheque: ChequeParaCompletar }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `completa-${cheque.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inicial: Record<Campo, string> = {
    number: cheque.number ?? "",
    bank: cheque.bank ?? "",
    good_for: cheque.good_for ? cheque.good_for.slice(0, 10) : "",
    holder_name: cheque.holder_name,
  };
  const [valores, setValores] = useState<Record<Campo, string>>(inicial);

  const acao = cheque.incomplete ? "Completar" : "Corrigir";

  function mudar(campo: Campo, valor: string) {
    setValores((v) => ({ ...v, [campo]: valor }));
    err.limparCampo(campo);
  }

  async function submit() {
    const corpo: Partial<Record<Campo, string>> = {};
    for (const campo of ORDEM) {
      const novo = valores[campo].trim();
      if (novo !== inicial[campo].trim()) corpo[campo] = novo;
    }
    if (Object.keys(corpo).length === 0) {
      err.setGlobal(null);
      err.reprovar({ number: "Informe ao menos um dado do cheque." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPatch(`/api/v1/emporio/checks/${cheque.id}`, corpo);
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(cheque.incomplete ? "Cheque atualizado." : "Cheque corrigido.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button size="sm" variant="outline">
          {acao}
        </Button>
      }
      title={`${acao} o cheque`}
      description={
        cheque.incomplete
          ? "Preencha o que já tiver. O cheque só pode ser depositado com número, banco e bom para."
          : "Troque o que estiver errado. Não dá para apagar um dado, só trocar por outro."
      }
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValores(inicial);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Número do cheque" id={err.idDe("number")} error={err.erros.number}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            inputMode="numeric"
            autoComplete="off"
            value={valores.number}
            onChange={(e) => mudar("number", e.target.value)}
          />
        )}
      </Field>
      <Field label="Banco" id={err.idDe("bank")} error={err.erros.bank}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            autoComplete="off"
            value={valores.bank}
            onChange={(e) => mudar("bank", e.target.value)}
          />
        )}
      </Field>
      <Field label="Bom para (data)" id={err.idDe("good_for")} error={err.erros.good_for}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={valores.good_for}
            onChange={(e) => mudar("good_for", e.target.value)}
          />
        )}
      </Field>
      <Field label="Em nome de" id={err.idDe("holder_name")} error={err.erros.holder_name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            autoComplete="off"
            value={valores.holder_name}
            onChange={(e) => mudar("holder_name", e.target.value)}
          />
        )}
      </Field>
    </FormSheet>
  );
}
