"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";

// Ordem visual, de cima para baixo. Os nomes são os da API (`POST cash/sessions/:id/withdrawals`).
const ORDEM = ["amount", "notes"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Sangria: tira dinheiro do caixa durante o turno e deixa numa entrega que
 * espera o gerente confirmar. Só vira "Com a gerência" quando ele confirma.
 */
export function SangriaForm({
  turnoId,
  caixaId,
  caixaNome,
  saldoCent,
}: {
  turnoId: string;
  caixaId: string;
  caixaNome: string;
  saldoCent: number;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `sangria-${caixaId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<{ assinatura: string; key: string } | null>(null);
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");

  async function submit() {
    const n = lerNumeroBr(valor);
    if (n === null || n <= 0) {
      err.setGlobal(null);
      err.reprovar({ amount: "O valor da sangria deve ser maior que zero." } satisfies Partial<Record<Campo, string>>);
      return;
    }

    err.limparTudo();
    const assinatura = JSON.stringify([turnoId, n, obs.trim()]);
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, key: crypto.randomUUID() };
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/cash/sessions/${turnoId}/withdrawals`, {
      operation_key: chave.current.key,
      amount: n,
      notes: obs.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    aviso.sucesso(`Sangria de ${reaisBr(n)} feita. Aguarda o gerente confirmar.`);
    setOpen(false);
    setValor("");
    setObs("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button size="sm" variant="outline">
          Sangria
        </Button>
      }
      title={`Sangria do ${caixaNome}`}
      description="Tire o excesso de dinheiro do caixa e leve ao gerente."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Registrar sangria"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <p className="text-sm text-texto-secundario">
        O caixa tem <strong className="text-texto">{reaisBr(saldoCent / 100)}</strong>.
      </p>

      <Field label="Valor retirado (R$)" required id={err.idDe("amount")} error={err.erros.amount}>
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

      <Field label="Observação" id={err.idDe("notes")} error={err.erros.notes} hint="Opcional. Ex: notas de 100.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={obs}
            onChange={(e) => {
              setObs(e.target.value);
              err.limparCampo("notes");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
