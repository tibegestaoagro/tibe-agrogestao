"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CartaoAReceberView } from "@/lib/actions/emporio-financeiro";
import { apiPost } from "@/lib/client-api";
import { dataBr } from "@/lib/emporio/datas";
import { reaisBr } from "@/lib/numero-br";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["reason"] as const;
type Campo = (typeof ORDEM)[number];

/** Desfazer a conferência de uma parcela: apaga o ajuste e o carimbo, e o motivo vai para o Histórico. */
export function DesfazerConferenciaForm({ parcela }: { parcela: CartaoAReceberView }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `desfazer-${parcela.id}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function submit() {
    const texto = motivo.trim();
    const novos: Partial<Record<Campo, string>> = {};
    if (texto.length < 3) novos.reason = "Diga o motivo, com pelo menos 3 letras.";
    else if (texto.length > 300) novos.reason = "O motivo aceita até 300 caracteres.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/finance/card-receivables/${parcela.id}/unconfirm`, { reason: texto });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Conferência desfeita.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-0">
          Desfazer
        </Button>
      }
      title="Desfazer a conferência"
      description={`Parcela ${parcela.installment}/${parcela.installments} da venda nº ${parcela.sale_number}, conferida em ${reaisBr(parcela.confirmed_net ?? parcela.effective_net)} (caiu em ${dataBr(parcela.effective_on)}). O ajuste da diferença é apagado e a parcela volta a conferir.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setMotivo("");
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Desfazer conferência"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Motivo" required id={err.idDe("reason")} error={err.erros.reason}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            maxLength={300}
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
