"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPatch, apiPost } from "@/lib/client-api";

const ORDEM_ADIAR = ["due_date"] as const;

/** Adia o vencimento de uma conta pendente. Um painel por linha. */
export function AdiarVencimentoForm({ entryId, nome, vencimento }: { entryId: string; nome: string; vencimento: string | null }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_ADIAR, `adiar-${entryId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const inicial = vencimento ? vencimento.slice(0, 10) : "";
  const [data, setData] = useState(inicial);

  async function submit() {
    if (!data) {
      err.setGlobal(null);
      err.reprovar({ due_date: "Informe o novo vencimento." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPatch(`/api/v1/emporio/payables/${entryId}/due-date`, { due_date: `${data}T12:00:00-03:00` });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Vencimento adiado.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Adiar
        </Button>
      }
      title="Adiar o vencimento"
      description={`${nome}: escolha a nova data. Só vale para conta pendente.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setData(inicial);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Adiar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Novo vencimento" required id={err.idDe("due_date")} error={err.erros.due_date}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              err.limparCampo("due_date");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}

const ORDEM_CANCELAR = ["reason"] as const;

/** Cancela uma conta sem pagamento. Cancelar a conta de uma compra não cancela a compra. */
export function CancelarContaForm({ entryId, nome }: { entryId: string; nome: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM_CANCELAR, `cancelar-conta-${entryId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [motivo, setMotivo] = useState("");

  async function submit() {
    if (!motivo.trim()) {
      err.setGlobal(null);
      err.reprovar({ reason: "Diga o motivo do cancelamento." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/payables/${entryId}/cancel`, { reason: motivo.trim() });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Conta cancelada.");
    setOpen(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Cancelar
        </Button>
      }
      title="Cancelar a conta"
      description={`${nome}: a conta deixa de ser cobrada. Se veio de uma compra, a compra continua valendo. Nada é apagado.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Cancelar conta"
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
            placeholder="Ex: lançada em duplicidade"
          />
        )}
      </Field>
    </FormSheet>
  );
}
