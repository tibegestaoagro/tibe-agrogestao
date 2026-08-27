"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { apiPost } from "@/lib/client-api";
import { primeiroInvalido, aplicarErroDoServidor } from "@/lib/erros-de-formulario";

/**
 * Cancelar uma movimentação (§10.8). O motivo é obrigatório porque a linha
 * continua no histórico para conferência, e uma linha cancelada sem motivo
 * não explica nada a quem for conferir depois.
 */

/** Um campo só, mas em `ORDEM`: o segundo campo vai chegar um dia. */
const ORDEM = ["reason"] as const;
type Campo = (typeof ORDEM)[number];
type Erros = Partial<Record<Campo, string>>;

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
  const [error, setError] = useState<string | null>(null);
  const [erros, setErros] = useState<Erros>({});
  const [foco, setFoco] = useState<Campo | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [reason, setReason] = useState("");

  function reprovar(novos: Erros) {
    setErros(novos);
    setFoco(primeiroInvalido(novos, ORDEM));
    setTentativa((n) => n + 1);
  }

  async function submit() {
    if (!reason.trim()) {
      setError(null);
      reprovar({ reason: "Informe o motivo do cancelamento." });
      return;
    }

    setErros({});
    setError(null);
    setLoading(true);
    const res = await apiPost(`/api/v1/herd/movements/${movementId}/cancel`, {
      reason: reason.trim(),
    });
    setLoading(false);

    if (!res.ok) {
      const { erros: doServidor, global } = aplicarErroDoServidor(res, ORDEM);
      setError(global);
      reprovar(doServidor);
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
          setErros({});
          setError(null);
        }
      }}
      onSubmit={submit}
      submitLabel="Confirmar cancelamento"
      submitPendingLabel="Cancelando..."
      pending={loading}
      error={error}
      focarCampoId={foco}
      tentativa={tentativa}
    >
      <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
        {descricao}
      </p>

      <Field label="Motivo" required id="reason" error={erros.reason}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: lançado errado"
          />
        )}
      </Field>
    </FormSheet>
  );
}
