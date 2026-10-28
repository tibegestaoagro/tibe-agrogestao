"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { reaisBr } from "@/lib/numero-br";
import { DevolucaoItens, montarDevolvidos, type EscolhaDevolucao, type ItemDevolvivel } from "./devolucao-itens";

// Ordem visual, de cima para baixo.
const ORDEM = ["items", "amount", "refund_kind", "reason"] as const;
type Campo = (typeof ORDEM)[number];

const FORMAS = [
  { valor: "dinheiro", rotulo: "Devolver em dinheiro (sai da gaveta)" },
  { valor: "abater_fiado", rotulo: "Abater do fiado do cliente" },
];

const VAZIA: EscolhaDevolucao = { qtds: {}, avarias: {} };

/**
 * Devolução parcial de uma venda. A `operation_key` nasce com o painel e só
 * troca depois de uma devolução gravada: reenviar depois de falha de rede
 * devolve a mesma devolução em vez de duplicar.
 *
 * O servidor limita o dinheiro ao que o cliente PAGOU e o abatimento ao que
 * ele AINDA DEVE; essas recusas chegam em `amount` e aparecem embaixo do total.
 */
export function DevolverForm({
  vendaId,
  itens,
  abertoCent,
}: {
  vendaId: string;
  itens: ItemDevolvivel[];
  /** Fiado ainda em aberto na venda: define a forma sugerida. */
  abertoCent: number;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "devolve-venda");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<string | null>(null);
  const [escolha, setEscolha] = useState<EscolhaDevolucao>(VAZIA);
  const [forma, setForma] = useState(abertoCent > 0 ? "abater_fiado" : "dinheiro");
  const [motivo, setMotivo] = useState("");

  const lido = montarDevolvidos(itens, escolha);
  const totalCent = lido.ok ? lido.totalCent : 0;

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!lido.ok) novos.items = lido.erro;
    if (Object.keys(novos).length > 0 || !lido.ok) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/sales/${vendaId}/return`, {
      operation_key: (chave.current ??= crypto.randomUUID()),
      refund_kind: forma,
      items: lido.itens,
      reason: motivo.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    aviso.sucesso("Devolução registrada.");
    setOpen(false);
    setEscolha(VAZIA);
    setMotivo("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button variant="outline">Devolver</Button>}
      title="Devolver itens"
      description="O que volta entra no estoque; o avariado entra e sai como perda."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        // Depois de uma falha o rascunho fica, para corrigir e reenviar com a mesma chave.
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Registrar devolução"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Itens devolvidos" required id={err.idDe("items")} error={err.erros.items}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria}>
            <DevolucaoItens
              itens={itens}
              escolha={escolha}
              aoMudar={(nova) => {
                setEscolha(nova);
                err.limparCampo("items");
                err.limparCampo("amount");
              }}
            />
          </div>
        )}
      </Field>

      <Field label="Valor a devolver" id={err.idDe("amount")} error={err.erros.amount}>
        {({ id, ...aria }) => (
          <p id={id} tabIndex={-1} {...aria} className="text-lg font-semibold text-texto">
            {reaisBr(totalCent / 100)}
          </p>
        )}
      </Field>

      <Field label="Como devolver o valor" required id={err.idDe("refund_kind")} error={err.erros.refund_kind}>
        {({ id, ...aria }) => (
          <Select
            value={forma}
            onValueChange={(v) => {
              setForma(v);
              err.limparCampo("refund_kind");
              err.limparCampo("amount");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAS.map((f) => (
                <SelectItem key={f.valor} value={f.valor}>
                  {f.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Motivo" id={err.idDe("reason")} error={err.erros.reason} hint="Opcional.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              err.limparCampo("reason");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
