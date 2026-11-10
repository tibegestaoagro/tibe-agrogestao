"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

// Ordem visual, de cima para baixo.
const ORDEM = ["reason"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Cancelar o orçamento (Q287): definitivo, com motivo. Não mexe em estoque nem em
 * caixa (o orçamento não reserva nada). A recusa sem campo (já faturado, já
 * cancelado) cai no rodapé do painel.
 */
export function CancelarOrcamentoForm({ orcamentoId, numero }: { orcamentoId: string; numero: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "cancela-orcamento");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!motivo.trim()) novos.reason = "Diga o motivo do cancelamento.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/quotes/${orcamentoId}/cancel`, { reason: motivo.trim() });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Orçamento cancelado.");
    setOpen(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Cancelar orçamento
        </Button>
      }
      title={`Cancelar orçamento nº ${numero}`}
      description="O cancelamento não tem volta: o orçamento não pode mais ser editado nem faturado. Ele continua na lista, no filtro Cancelados."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Cancelar orçamento"
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
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              err.limparCampo("reason");
            }}
            placeholder="Ex: cliente desistiu da compra"
          />
        )}
      </Field>
    </FormSheet>
  );
}
