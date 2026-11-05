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

// Ordem visual, de cima para baixo. Os nomes são os da API (`POST cash/sessions`).
const ORDEM = ["cash_register_id", "reinforcement", "counted", "justification"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Abrir o turno de um caixa: abrir é conferir o troco. O reforço (opcional)
 * sai da gerência da loja e entra no caixa antes de o esperado ser calculado,
 * então o esperado da tela é o saldo do caixa mais o reforço digitado. Havendo
 * diferença, o motivo é obrigatório. A chave de operação muda só quando o
 * conteúdo muda: um toque repetido por falha de rede devolve o mesmo turno.
 */
export function AbrirTurnoForm({
  caixaId,
  caixaNome,
  saldoCent,
  trigger,
  aoAbrir,
}: {
  caixaId: string;
  caixaNome: string;
  saldoCent: number;
  /** O botão que abre o painel; o da tela do Caixa por padrão. */
  trigger?: React.ReactNode;
  /** O balcão abre o caixa sem sair da venda: segue por aqui em vez de recarregar a página. */
  aoAbrir?: (caixaId: string) => void;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `abrir-${caixaId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<{ assinatura: string; key: string } | null>(null);
  const [reforco, setReforco] = useState("");
  const [contado, setContado] = useState("");
  const [motivo, setMotivo] = useState("");

  const r = reforco.trim() ? lerNumeroBr(reforco) : 0;
  const n = lerNumeroBr(contado);
  const esperadoCent = saldoCent + (r !== null && r > 0 ? cent(r) : 0);
  const diffCent = n === null || n < 0 ? null : cent(n) - esperadoCent;

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (r === null || r < 0) novos.reinforcement = "Informe o reforço (zero ou mais) ou deixe em branco.";
    if (n === null || n < 0) novos.counted = "Informe quanto há no caixa (zero ou mais).";
    else if (diffCent !== 0 && !motivo.trim()) {
      novos.justification = `O caixa tem ${(diffCent ?? 0) > 0 ? "sobra" : "falta"} de ${reaisBr(Math.abs(diffCent ?? 0) / 100)}: diga o motivo.`;
    }
    if (Object.keys(novos).length > 0 || n === null || r === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    const assinatura = JSON.stringify([caixaId, r, n, motivo.trim()]);
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, key: crypto.randomUUID() };
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/cash/sessions", {
      operation_key: chave.current.key,
      cash_register_id: caixaId,
      counted: n,
      justification: motivo.trim() || null,
      reinforcement: r > 0 ? r : null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    aviso.sucesso(`${caixaNome} aberto.`);
    setOpen(false);
    setReforco("");
    setContado("");
    setMotivo("");
    if (aoAbrir) aoAbrir(caixaId);
    else router.refresh();
  }

  return (
    <FormSheet
      trigger={trigger ?? <Button size="sm">Abrir</Button>}
      title={`Abrir o ${caixaNome}`}
      description="Conte o troco que está no caixa. Se faltar troco, peça um reforço à gerência."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Abrir o caixa"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Caixa" id={err.idDe("cash_register_id")} error={err.erros.cash_register_id}>
        {({ id, ...aria }) => (
          <p id={id} tabIndex={-1} {...aria} className="text-base font-medium text-texto">
            {caixaNome}
          </p>
        )}
      </Field>

      <Field
        label="Reforço da gerência (R$)"
        id={err.idDe("reinforcement")}
        error={err.erros.reinforcement}
        hint="Opcional. Sai de Com a gerência e entra no caixa."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={reforco}
            onValueChange={(v) => {
              setReforco(v);
              err.limparCampo("reinforcement");
              err.limparCampo("justification");
            }}
          />
        )}
      </Field>

      <p className="text-sm text-texto-secundario">
        O sistema espera <strong className="text-texto">{reaisBr(esperadoCent / 100)}</strong> no caixa.
      </p>

      <Field label="Troco contado (R$)" required id={err.idDe("counted")} error={err.erros.counted}>
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
          <span className="text-sucesso-tinta">O troco bate com o esperado.</span>
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
            placeholder="Ex: troco levado ontem"
          />
        )}
      </Field>
    </FormSheet>
  );
}
