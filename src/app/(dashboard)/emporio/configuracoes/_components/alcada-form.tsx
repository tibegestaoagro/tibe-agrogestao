"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { MoneyInput } from "@/components/ui/money-input";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPatch } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { paraCampo } from "../../_components/formato";

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["payment_approval_limit"] as const;

/** O teto de pagamento sem aprovação (Q227). Vazio, sem alçada: todo mundo que pode pagar paga. */
export function AlcadaForm({ limite }: { limite: number | null }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "alcada");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [teto, setTeto] = useState(paraCampo(limite));

  function reiniciar() {
    setTeto(paraCampo(limite));
    err.limparTudo();
  }

  async function submit() {
    const valor = teto.trim() === "" ? null : lerNumeroBr(teto);
    if (teto.trim() !== "" && (valor === null || valor <= 0)) {
      err.setGlobal(null);
      err.reprovar({ payment_approval_limit: "Digite um valor em reais maior que zero, ou deixe vazio para não ter alçada." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPatch("/api/v1/emporio/settings/approval", { payment_approval_limit: valor });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(valor === null ? "Alçada desligada: todo pagamento sai sem aprovação." : "Teto de pagamento salvo.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button variant="outline">Mudar</Button>}
      title="Alçada de pagamento"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label="Teto sem aprovação (R$)"
        hint="Pagamento acima disto, feito por quem não é Dono nem Gerente geral, espera aprovação. Vazio, sem alçada."
        id={err.idDe("payment_approval_limit")}
        error={err.erros.payment_approval_limit}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            placeholder="Sem alçada"
            value={teto}
            onValueChange={(v) => {
              setTeto(v);
              err.limparCampo("payment_approval_limit");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
