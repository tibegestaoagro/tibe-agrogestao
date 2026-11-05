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

// Ordem visual, de cima para baixo. Os nomes são os da API (`POST cash/sessions/:id/close`).
const ORDEM = ["counted", "justification", "malote_amount"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Encerrar o turno: conta o caixa, diz o que vai no malote, e o resto fica de
 * troco para o próximo turno (calculado na tela, antes de enviar). Depois de
 * encerrado o painel continua aberto com os links do relatório: a página só
 * atualiza quando o painel fecha, porque o caixa volta a "fechado" e este
 * componente deixa de existir.
 */
export function EncerrarTurnoForm({
  turnoId,
  caixaId,
  caixaNome,
  esperadoCent,
}: {
  turnoId: string;
  caixaId: string;
  caixaNome: string;
  esperadoCent: number;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `encerrar-${caixaId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [encerrado, setEncerrado] = useState(false);
  const chave = useRef<{ assinatura: string; key: string } | null>(null);
  const [contado, setContado] = useState("");
  const [motivo, setMotivo] = useState("");
  const [malote, setMalote] = useState("");

  const n = lerNumeroBr(contado);
  const m = malote.trim() ? lerNumeroBr(malote) : 0;
  const diffCent = n === null || n < 0 ? null : cent(n) - esperadoCent;
  const trocoCent = n === null || m === null || n < 0 || m < 0 ? null : cent(n) - cent(m);

  async function submit() {
    if (encerrado) {
      setOpen(false);
      router.refresh();
      return;
    }
    const novos: Partial<Record<Campo, string>> = {};
    if (n === null || n < 0) novos.counted = "Informe quanto há no caixa (zero ou mais).";
    else if (diffCent !== 0 && !motivo.trim()) {
      novos.justification = `O caixa tem ${(diffCent ?? 0) > 0 ? "sobra" : "falta"} de ${reaisBr(Math.abs(diffCent ?? 0) / 100)}: diga o motivo.`;
    }
    if (m === null || m < 0) novos.malote_amount = "Informe o malote (zero ou mais) ou deixe em branco.";
    else if (n !== null && n >= 0 && m > n) novos.malote_amount = "O malote não pode passar do que foi contado.";
    if (Object.keys(novos).length > 0 || n === null || m === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    const assinatura = JSON.stringify([turnoId, n, m, motivo.trim()]);
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, key: crypto.randomUUID() };
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/cash/sessions/${turnoId}/close`, {
      operation_key: chave.current.key,
      counted: n,
      justification: motivo.trim() || null,
      malote_amount: m,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    aviso.sucesso(`${caixaNome} encerrado.`);
    setEncerrado(true);
  }

  return (
    <FormSheet
      trigger={
        <Button size="sm" variant="outline">
          Encerrar
        </Button>
      }
      title={`Encerrar o ${caixaNome}`}
      description={encerrado ? undefined : "Conte o caixa, separe o malote e deixe o troco para o próximo turno."}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          err.limparTudo();
          if (encerrado) router.refresh();
        }
      }}
      onSubmit={submit}
      submitLabel={encerrado ? "Concluir" : "Encerrar o turno"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      {encerrado ? (
        <div className="space-y-3">
          <p className="text-sm text-texto">Turno encerrado. O relatório do fechamento:</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/emporio/imprimir/turno/${turnoId}?formato=a4`} target="_blank" rel="noopener noreferrer">
                Relatório A4
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/emporio/imprimir/turno/${turnoId}?formato=cupom`} target="_blank" rel="noopener noreferrer">
                Relatório na bobina
              </a>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm text-texto-secundario">
            O sistema espera <strong className="text-texto">{reaisBr(esperadoCent / 100)}</strong> no caixa.
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
                  err.limparCampo("malote_amount");
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

          <Field
            label="Malote (R$)"
            id={err.idDe("malote_amount")}
            error={err.erros.malote_amount}
            hint="O que vai para o gerente. Em branco, nada vai: tudo fica de troco."
          >
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                value={malote}
                onValueChange={(v) => {
                  setMalote(v);
                  err.limparCampo("malote_amount");
                }}
              />
            )}
          </Field>

          <p className="text-sm" aria-live="polite">
            {trocoCent === null ? (
              <span className="text-texto-secundario">Digite o contado e o malote para ver o troco que fica.</span>
            ) : trocoCent < 0 ? (
              <span className="text-perigo-tinta">O malote passa do que foi contado.</span>
            ) : (
              <span className="text-texto">
                Troco que fica no caixa: <strong>{reaisBr(trocoCent / 100)}</strong>
              </span>
            )}
          </p>
        </>
      )}
    </FormSheet>
  );
}
