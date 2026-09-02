"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";
import { moeda } from "@/components/servicos/labels";

/**
 * Registra um pagamento do serviço (§21, §22).
 *
 * O painel mostra o restante no cabeçalho porque é o número que o produtor
 * precisa para decidir quanto pagar, e porque a action recusa valor maior que
 * ele. Mostrar a recusa sem ter mostrado o limite antes seria fazer o produtor
 * descobrir a regra errando.
 */

const ORDEM = ["amount", "paid_at", "notes"] as const;
type Campo = (typeof ORDEM)[number];

export default function ServicePaymentForm({
  serviceJobId,
  descricao,
  restante,
}: {
  serviceJobId: string;
  descricao: string;
  restante: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, `pgto-${serviceJobId}`);

  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [notes, setNotes] = useState("");

  function limpar() {
    setAmount("");
    setPaidAt("");
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const valor = lerValorDoCampo(amount);
    if (valor === null || valor <= 0) {
      novos.amount = "Informe um valor maior que zero.";
    } else if (valor > restante) {
      novos.amount = `Faltam ${moeda(restante)} neste serviço.`;
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/service-jobs/${serviceJobId}/payments`, {
      amount: valor,
      paid_at: paidAt ? new Date(`${paidAt}T12:00:00.000Z`).toISOString() : null,
      notes: notes.trim() || null,
    });
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    setOpen(false);
    limpar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Registrar pagamento</Button>}
      title={`Pagamento de ${descricao}`}
      description={`Faltam ${moeda(restante)}. Você pode pagar tudo ou uma parte.`}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label="Valor pago"
        required
        hint={`No máximo ${moeda(restante)}.`}
        id={err.idDe("amount")}
        error={err.erros.amount}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="dinheiro"
            value={amount}
            onValueChange={(v) => {
              setAmount(v);
              err.limparCampo("amount");
            }}
          />
        )}
      </Field>

      <Field
        label="Data"
        hint="Opcional. Em branco, é hoje."
        id={err.idDe("paid_at")}
        error={err.erros.paid_at}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={paidAt}
            onChange={(e) => {
              setPaidAt(e.target.value);
              err.limparCampo("paid_at");
            }}
          />
        )}
      </Field>

      <Field label="Observações" hint="Opcional." id={err.idDe("notes")} error={err.erros.notes}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              err.limparCampo("notes");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
