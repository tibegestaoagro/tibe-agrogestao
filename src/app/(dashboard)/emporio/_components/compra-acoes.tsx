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

/** Receber a compra pendente: sem formulário, a recusa vai para o aviso. */
export function ReceberCompraBotao({ compraId }: { compraId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [pending, setPending] = useState(false);

  async function receber() {
    setPending(true);
    const res = await apiPost(`/api/v1/emporio/purchases/${compraId}/receive`, {});
    setPending(false);
    if (res.ok) {
      aviso.sucesso("Compra recebida: o estoque foi atualizado.");
      router.refresh();
    } else aviso.erro(res.message);
  }

  return (
    <Button size="sm" onClick={receber} disabled={pending}>
      {pending ? "..." : "Receber"}
    </Button>
  );
}

const ORDEM = ["reason"] as const;

/**
 * Cancelar a compra (OWNER e ADMIN, o servidor confere). Pagamento já feito
 * (409 `PURCHASE_HAS_PAYMENT`) não pertence a campo: vai para o aviso.
 */
export function CancelarCompraForm({ compraId }: { compraId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `cancela-${compraId}`);
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
    const res = await apiPost(`/api/v1/emporio/purchases/${compraId}/cancel`, { reason: motivo.trim() });
    setLoading(false);
    if (!res.ok) {
      if (res.code === "PURCHASE_HAS_PAYMENT") {
        aviso.erro(res.message);
        setOpen(false);
        return;
      }
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Compra cancelada.");
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
      title="Cancelar compra"
      description="As contas a pagar pendentes são canceladas e a entrada no estoque é desfeita. Nada é apagado."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Cancelar compra"
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
            placeholder="Ex: fornecedor não entregou"
          />
        )}
      </Field>
    </FormSheet>
  );
}
