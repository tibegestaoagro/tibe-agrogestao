"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

/** O único campo, mas com o nome que a API usa: é ele que casa com `field`. */
const ORDEM = ["reason"] as const;

/**
 * Cancelar uma negociação (§17.9). O motivo é obrigatório porque a linha
 * continua no histórico para conferência (§17.10), e linha cancelada sem
 * motivo não explica nada a quem for conferir depois.
 */
export default function NegotiationCancel({
  negotiationId,
  descricao,
  venda,
  valorRecebido,
  valorPago,
}: {
  negotiationId: string;
  descricao: string;
  /** Muda a pergunta: numa venda o dinheiro ENTROU, não saiu. */
  venda: boolean;
  /** O que já entrou (o principal de uma venda). */
  valorRecebido: number;
  /** O que já saiu (o principal de uma compra, e os custos dos dois lados). */
  valorPago: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);
  const [reason, setReason] = useState("");
  // Padrão "mantem": é o único que não inventa nada sobre o dinheiro do
  // produtor. Só aparece quando existe pagamento, e resolve na mesma tela.
  const [dinheiroPago, setDinheiroPago] = useState<"mantem" | "devolvido" | "engano">("mantem");

  /**
   * "Pago" e "recebido" não se somam, e não são a mesma frase.
   *
   * Numa venda o principal ENTROU e os custos do §15 saíram: somar os dois num
   * número só e chamar de "dinheiro que já foi pago" mostrava um valor inflado
   * com um rótulo errado, na tela em que o produtor decide desfazer um negócio.
   */
  const moeda = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const partes: string[] = [];
  if (valorRecebido > 0) partes.push(`${moeda(valorRecebido)} já recebidos`);
  if (valorPago > 0) partes.push(`${moeda(valorPago)} já pagos`);
  const resumoDoDinheiro = partes.join(" e ");

  async function submit() {
    if (!reason.trim()) {
      err.setGlobal(null);
      err.reprovar({ reason: "Informe o motivo do cancelamento." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/negotiations/${negotiationId}/cancel`, {
      reason: reason.trim(),
      dinheiro_pago: dinheiroPago,
    });
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
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
      title="Cancelar negócio"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setReason("");
          setDinheiroPago("mantem");
          err.limparTudo();
        }
      }}
      onSubmit={submit}
      submitLabel="Confirmar cancelamento"
      submitPendingLabel="Cancelando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
        {descricao}
      </p>
      <p className="text-sm text-texto-discreto">
            Os animais voltam ao rebanho e as contas em aberto saem do financeiro. O
            negócio continua no histórico, marcado, com o motivo. Se parte dos animais
            já foi vendida ou movimentada, o cancelamento é recusado.
          </p>

          {valorRecebido + valorPago > 0 && (
            <div className="rounded-md border border-atencao-tinta/30 bg-atencao-suave p-3">
              <p className="text-sm font-medium text-atencao-tinta">
                E o dinheiro deste negócio ({resumoDoDinheiro})?
              </p>
              <div className="mt-2 space-y-2">
                {(
                  [
                    [
                      "mantem",
                      "Continua lançado",
                      venda
                        ? "Eu recebi mesmo, e não devolvi."
                        : "Eu paguei mesmo, e o dinheiro não voltou.",
                    ],
                    [
                      "devolvido",
                      venda ? "Eu devolvi" : "O dinheiro voltou",
                      "Lanço a devolução com a data de hoje.",
                    ],
                    [
                      "engano",
                      "Foi engano meu",
                      venda
                        ? "Esse recebimento não existiu, pode apagar."
                        : "Esse pagamento não existiu, pode apagar.",
                    ],
                  ] as const
                ).map(([valor, titulo, explicacao]) => (
                  <label key={valor} className="flex cursor-pointer gap-2 text-sm text-atencao-tinta">
                    <input
                      type="radio"
                      name="dinheiro-pago"
                      className="mt-1"
                      checked={dinheiroPago === valor}
                      onChange={() => setDinheiroPago(valor)}
                    />
                    <span>
                      <span className="font-medium">{titulo}.</span> {explicacao}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

      <Field label="Motivo" required id="reason" error={err.erros.reason}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              err.limparCampo("reason");
            }}
            placeholder="Ex: negócio desfeito"
          />
        )}
      </Field>
    </FormSheet>
  );
}
