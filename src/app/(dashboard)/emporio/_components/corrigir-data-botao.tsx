"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";
import { JANELA_DA_BAIXA_DIAS } from "@/lib/emporio/data-da-baixa";

const ORDEM = ["occurred_on"] as const;

/**
 * Q372: corrige o dia em que o PIX ou a transferência de uma venda caiu na conta, para o extrato
 * bater com o do banco. Só aparece para quem tem a chave do dinheiro; o servidor confere de novo.
 */
export function CorrigirDataBotao({ id, diaAtual }: { id: string; diaAtual: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `data-${id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dia, setDia] = useState(diaAtual);

  async function submit() {
    if (!dia) {
      err.setGlobal(null);
      err.reprovar({ occurred_on: "Informe a data em que o dinheiro caiu." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPatch(`/api/v1/emporio/finance/statement/movements/${id}`, { occurred_on: dia });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Data corrigida.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-0">
          Corrigir a data
        </Button>
      }
      title="Corrigir a data"
      description="O dia em que o dinheiro caiu na conta, para o extrato bater com o do banco."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDia(diaAtual);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Corrigir"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label="Data em que caiu"
        required
        id={err.idDe("occurred_on")}
        error={err.erros.occurred_on}
        hint={`Até ${JANELA_DA_BAIXA_DIAS} dias para trás ou para frente. Linha com carimbo precisa perder o carimbo antes.`}
      >
        {({ id: campo, ...aria }) => (
          <Input
            id={campo}
            {...aria}
            type="date"
            value={dia}
            onChange={(e) => {
              setDia(e.target.value);
              err.limparCampo("occurred_on");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
