"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["reason"] as const;

/**
 * Q275: desfaz um acordo sem movimento. O motivo é obrigatório e fica no Histórico. O servidor confere de novo se o
 * acordo continua sem parcela paga, abatida ou extra de cheque devolvido.
 */
export function DesfazerAcordo({ customerId, agreementId }: { customerId: string; agreementId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "desfazer-acordo");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function submit() {
    if (!motivo.trim()) {
      err.setGlobal(null);
      err.reprovar({ reason: "Diga por que o acordo está sendo desfeito." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/customers/${customerId}/agreements/${agreementId}/undo`, {
      reason: motivo.trim(),
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Acordo desfeito. Os fiados voltaram para a cobrança.");
    setOpen(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button type="button" variant="outline" size="sm">
          Desfazer acordo
        </Button>
      }
      title="Desfazer acordo"
      description="As parcelas são canceladas e os fiados do acordo voltam para a cobrança, com o mesmo vencimento. Só dá enquanto nenhuma parcela foi paga."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setMotivo("");
          err.limparTudo();
        }
      }}
      onSubmit={submit}
      submitLabel="Desfazer o acordo"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Motivo" required hint="Até 500 caracteres. Fica no Histórico." id={err.idDe("reason")} error={err.erros.reason}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            autoComplete="off"
            maxLength={500}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              err.limparCampo("reason");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
