"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";

const ORDEM = ["establishment_id", "bank_account_id", "amount"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Saldo inicial da gaveta de uma loja OU de uma conta, uma vez só. O destino é
 * fixo (vem do cartão em que o botão está), então só UM dos dois campos de
 * destino existe na tela, e é o que a requisição envia.
 */
export function SaldoInicialForm({
  tipo,
  destinoId,
  destinoNome,
}: {
  tipo: "loja" | "conta";
  destinoId: string;
  destinoNome: string;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const campoDestino: Campo = tipo === "loja" ? "establishment_id" : "bank_account_id";
  const err = useErrosDeFormulario(ORDEM, `saldo-${destinoId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [valor, setValor] = useState("");

  async function submit() {
    const n = lerNumeroBr(valor);
    if (n === null || n <= 0) {
      err.setGlobal(null);
      err.reprovar({ amount: "Informe o saldo inicial, maior que zero." });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/cash/opening", {
      [campoDestino]: destinoId,
      amount: n,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Saldo inicial lançado.");
    setOpen(false);
    setValor("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Saldo inicial
        </Button>
      }
      title="Saldo inicial"
      description="Quanto já havia no caixa antes de usar o sistema. Só pode ser lançado uma vez."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Lançar saldo inicial"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label={tipo === "loja" ? "Gaveta da loja" : "Conta"}
        id={err.idDe(campoDestino)}
        error={err.erros[campoDestino]}
      >
        {({ id, ...aria }) => (
          <p id={id} tabIndex={-1} {...aria} className="text-base font-medium text-texto">
            {destinoNome}
          </p>
        )}
      </Field>
      <Field label="Saldo inicial (R$)" required id={err.idDe("amount")} error={err.erros.amount}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={valor}
            onValueChange={(v) => {
              setValor(v);
              err.limparCampo("amount");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
