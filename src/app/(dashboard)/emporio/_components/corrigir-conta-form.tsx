"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { paraCampo } from "./formato";

const ORDEM = ["amount"] as const;

/** Corrige o valor de uma conta pendente e sem pagamento (o comprovante real chegou diferente). Um painel por linha. */
export function CorrigirContaForm({ entryId, nome, valor }: { entryId: string; nome: string; valor: number }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `corrigir-${entryId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [campo, setCampo] = useState(paraCampo(valor));

  async function submit() {
    const novo = lerNumeroBr(campo);
    if (novo === null || novo <= 0) {
      err.setGlobal(null);
      err.reprovar({ amount: "O valor da conta deve ser maior que zero." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPatch(`/api/v1/emporio/payables/${entryId}`, { amount: novo });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Valor corrigido.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Corrigir valor
        </Button>
      }
      title="Corrigir valor da conta"
      description={`${nome}: informe o valor real. Só vale enquanto a conta não tem pagamento.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setCampo(paraCampo(valor));
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Salvar valor"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Valor real" required id={err.idDe("amount")} error={err.erros.amount}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={campo}
            onValueChange={(v) => {
              setCampo(v);
              err.limparCampo("amount");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
