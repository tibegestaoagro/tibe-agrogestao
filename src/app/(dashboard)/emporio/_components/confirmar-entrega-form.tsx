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
import { cent } from "./venda-estado";

// Ordem visual, de cima para baixo. Os nomes são os da API (`POST cash/handovers/:id/confirm`).
const ORDEM = ["received_amount", "notes"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * O gerente conta o que recebeu da sangria ou do malote. Diferente do
 * entregue, a observação é obrigatória e o servidor lança a "Diferença de
 * caixa". O valor recebido começa em branco de propósito: confirmar sem contar
 * seria aceitar o número do caixa no escuro.
 */
export function ConfirmarEntregaForm({
  entregaId,
  descricao,
  valorCent,
}: {
  entregaId: string;
  descricao: string;
  valorCent: number;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `entrega-${entregaId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<{ assinatura: string; key: string } | null>(null);
  const [recebido, setRecebido] = useState("");
  const [obs, setObs] = useState("");

  const n = lerNumeroBr(recebido);
  const diffCent = n === null || n < 0 ? null : cent(n) - valorCent;

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (n === null || n < 0) novos.received_amount = "Informe quanto você recebeu (zero ou mais).";
    else if (diffCent !== 0 && !obs.trim()) {
      novos.notes = `Veio ${(diffCent ?? 0) > 0 ? "a mais" : "a menos"} (${reaisBr(Math.abs(diffCent ?? 0) / 100)}): diga o motivo.`;
    }
    if (Object.keys(novos).length > 0 || n === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    const assinatura = JSON.stringify([entregaId, n, obs.trim()]);
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, key: crypto.randomUUID() };
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/cash/handovers/${entregaId}/confirm`, {
      operation_key: chave.current.key,
      received_amount: n,
      notes: obs.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    aviso.sucesso(diffCent === 0 ? "Entrega confirmada." : "Entrega confirmada e diferença lançada.");
    setOpen(false);
    setRecebido("");
    setObs("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button size="sm" variant="outline">
          Confirmar
        </Button>
      }
      title="Confirmar a entrega"
      description={descricao}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Confirmar o recebimento"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <p className="text-sm text-texto-secundario">
        Foi entregue <strong className="text-texto">{reaisBr(valorCent / 100)}</strong>. Conte e diga quanto chegou.
      </p>

      <Field label="Valor recebido (R$)" required id={err.idDe("received_amount")} error={err.erros.received_amount}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={recebido}
            onValueChange={(v) => {
              setRecebido(v);
              err.limparCampo("received_amount");
              err.limparCampo("notes");
            }}
          />
        )}
      </Field>

      <p className="text-sm" aria-live="polite">
        {diffCent === null ? (
          <span className="text-texto-secundario">Digite o valor recebido para ver a diferença.</span>
        ) : diffCent === 0 ? (
          <span className="text-sucesso-tinta">Bate com o entregue.</span>
        ) : (
          <span className={diffCent > 0 ? "text-atencao-tinta" : "text-perigo-tinta"}>
            {diffCent > 0 ? "Sobra" : "Falta"} de {reaisBr(Math.abs(diffCent) / 100)}.
          </span>
        )}
      </p>

      <Field
        label="Observação"
        required={diffCent !== null && diffCent !== 0}
        id={err.idDe("notes")}
        error={err.erros.notes}
        hint="Obrigatória quando o recebido não bate com o entregue."
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={obs}
            onChange={(e) => {
              setObs(e.target.value);
              err.limparCampo("notes");
            }}
            placeholder="Ex: faltou uma nota de 5"
          />
        )}
      </Field>
    </FormSheet>
  );
}
