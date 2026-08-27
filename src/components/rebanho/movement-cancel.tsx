"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { apiPost } from "@/lib/client-api";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";

/**
 * Cancelar uma movimentação (§10.8). O motivo é obrigatório porque a linha
 * continua no histórico para conferência, e uma linha cancelada sem motivo
 * não explica nada a quem for conferir depois.
 */

/** Um campo só, mas em `ORDEM`: o segundo campo vai chegar um dia. */
const ORDEM = ["reason"] as const;

export default function MovementCancel({
  movementId,
  descricao,
}: {
  movementId: string;
  descricao: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);
  const [reason, setReason] = useState("");

  async function submit() {
    if (!reason.trim()) {
      err.setGlobal(null);
      err.reprovar({ reason: "Informe o motivo do cancelamento." });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/herd/movements/${movementId}/cancel`, {
      reason: reason.trim(),
    });
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <button
          type="button"
          className="inline-flex min-h-11 items-center text-sm text-texto-secundario underline hover:text-perigo-tinta sm:min-h-0"
        >
          Cancelar
        </button>
      }
      title="Cancelar movimentação"
      description="A movimentação para de contar no saldo, mas continua no histórico com o motivo, para conferência. Para corrigir um lançamento, cancele e registre de novo."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setReason("");
          err.limparTudo();
        }
      }}
      onSubmit={submit}
      submitLabel="Confirmar cancelamento"
      submitPendingLabel="Cancelando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
        {descricao}
      </p>

      <Field label="Motivo" required id="reason" error={err.erros.reason}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={reason}
            onChange={(e) => { setReason(e.target.value); err.limparCampo("reason"); }}
            placeholder="Ex: lançado errado"
          />
        )}
      </Field>
    </FormSheet>
  );
}
