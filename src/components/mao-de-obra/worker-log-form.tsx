"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";
import { WORKER_LOG_KIND_LABELS } from "@/components/servicos/labels";

/**
 * Registra uma atividade (§12) ou ausência (§34) do trabalhador.
 *
 * ⚠️ A descrição do painel diz que nada aqui vira desconto, e isso não é
 * decoração: o §34 tira o cálculo trabalhista de escopo, e sem o aviso o
 * produtor registraria uma falta esperando que o pagamento diminuísse sozinho.
 * Descobrir que não diminuiu só no dia 5, olhando o valor cheio, seria pior.
 */

const ORDEM = ["kind", "occurred_at", "description"] as const;
type Campo = (typeof ORDEM)[number];

export default function WorkerLogForm({
  workerId,
  workerName,
}: {
  workerId: string;
  workerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, `log-${workerId}`);

  const hoje = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState("atividade");
  const [occurredAt, setOccurredAt] = useState(hoje);
  const [description, setDescription] = useState("");

  const ehAtividade = kind === "atividade";

  function limpar() {
    setKind("atividade");
    setOccurredAt(hoje);
    setDescription("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!occurredAt) novos.occurred_at = "Informe a data.";
    if (ehAtividade && !description.trim()) novos.description = "Descreva a atividade.";

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/workers/${workerId}/logs`, {
      kind,
      occurred_at: new Date(`${occurredAt}T12:00:00.000Z`).toISOString(),
      description: description.trim() || null,
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
      trigger={<Button variant="outline">Anotar</Button>}
      title={`Anotação sobre ${workerName}`}
      description="Uma atividade que ele fez, ou uma ausência. É só anotação: não vira desconto nem cálculo nenhum."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Anotar"
      submitPendingLabel="Anotando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="O que foi" required id={err.idDe("kind")} error={err.erros.kind}>
        {({ id, ...aria }) => (
          <Select
            value={kind}
            onValueChange={(v) => {
              setKind(v);
              err.limparCampo("kind");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(WORKER_LOG_KIND_LABELS).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Data" required id={err.idDe("occurred_at")} error={err.erros.occurred_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={occurredAt}
            onChange={(e) => {
              setOccurredAt(e.target.value);
              err.limparCampo("occurred_at");
            }}
          />
        )}
      </Field>

      <Field
        label="Descrição"
        required={ehAtividade}
        hint={ehAtividade ? "Ex: Conserto de cerca, vacinação, ordenha." : "Opcional."}
        id={err.idDe("description")}
        error={err.erros.description}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              err.limparCampo("description");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
