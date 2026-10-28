"use client";

import { useState } from "react";
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

// Ordem visual, de cima para baixo. Os nomes são os da API (`POST cash/counts`).
const ORDEM = ["counted", "justification"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Conferir a gaveta (Q93): a pessoa conta o dinheiro, o painel mostra o
 * esperado e a diferença na hora. Havendo diferença, o motivo é obrigatório e
 * o servidor lança o ajuste e a "Diferença de caixa". O esperado da tela é o
 * saldo de quando a página abriu: se entrou venda no meio, o servidor usa o
 * dele e recusa em `justification` quando a diferença mudou.
 */
export function ConferirGavetaForm({
  lojaId,
  lojaNome,
  esperadoCent,
}: {
  lojaId: string;
  lojaNome: string;
  esperadoCent: number;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `confere-${lojaId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contado, setContado] = useState("");
  const [motivo, setMotivo] = useState("");

  const n = lerNumeroBr(contado);
  const diffCent = n === null || n < 0 ? null : cent(n) - esperadoCent;

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (n === null || n < 0) novos.counted = "Informe quanto há na gaveta (zero ou mais).";
    else if (diffCent !== 0 && !motivo.trim()) {
      novos.justification = `A gaveta tem ${(diffCent ?? 0) > 0 ? "sobra" : "falta"} de ${reaisBr(Math.abs(diffCent ?? 0) / 100)}: diga o motivo.`;
    }
    if (Object.keys(novos).length > 0 || n === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/cash/counts", {
      establishment_id: lojaId,
      counted: n,
      justification: motivo.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(diffCent === 0 ? "Gaveta conferida: o dinheiro bate." : "Gaveta conferida e diferença lançada.");
    setOpen(false);
    setContado("");
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button size="sm" variant="outline">
          Conferir
        </Button>
      }
      title={`Conferir a gaveta da ${lojaNome}`}
      description="Conte o dinheiro que está na gaveta e diga quanto é."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Registrar conferência"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <p className="text-sm text-texto-secundario">
        O sistema espera <strong className="text-texto">{reaisBr(esperadoCent / 100)}</strong> na gaveta.
      </p>

      <Field label="Valor contado (R$)" required id={err.idDe("counted")} error={err.erros.counted}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={contado}
            onValueChange={(v) => {
              setContado(v);
              err.limparCampo("counted");
              err.limparCampo("justification");
            }}
          />
        )}
      </Field>

      <p className="text-sm" aria-live="polite">
        {diffCent === null ? (
          <span className="text-texto-secundario">Digite o valor contado para ver a diferença.</span>
        ) : diffCent === 0 ? (
          <span className="text-sucesso-tinta">O dinheiro bate com o esperado.</span>
        ) : (
          <span className={diffCent > 0 ? "text-atencao-tinta" : "text-perigo-tinta"}>
            {diffCent > 0 ? "Sobra" : "Falta"} de {reaisBr(Math.abs(diffCent) / 100)}.
          </span>
        )}
      </p>

      <Field
        label="Motivo da diferença"
        required={diffCent !== null && diffCent !== 0}
        id={err.idDe("justification")}
        error={err.erros.justification}
        hint="Obrigatório quando o contado não bate com o esperado."
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              err.limparCampo("justification");
            }}
            placeholder="Ex: troco dado a mais"
          />
        )}
      </Field>
    </FormSheet>
  );
}
