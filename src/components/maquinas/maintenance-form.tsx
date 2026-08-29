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

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["performed_at", "description", "cost", "next_due_at"] as const;

export default function MaintenanceForm({ machineId }: { machineId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [performedAt, setPerformedAt] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");

  function reset() {
    setPerformedAt("");
    setDescription("");
    setCost("");
    setNextDueAt("");
    err.limparTudo();
  }

  async function submit() {
    if (!description.trim()) {
      err.setGlobal(null);
      err.reprovar({ description: "Descreva o que foi feito." });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/machines/${machineId}/maintenances`, {
      performed_at: performedAt ? new Date(performedAt).toISOString() : null,
      description: description.trim(),
      cost: lerValorDoCampo(cost),
      next_due_at: nextDueAt ? new Date(nextDueAt).toISOString() : null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button variant="outline">Registrar manutenção</Button>}
      title="Registrar manutenção"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      onSubmit={submit}
      submitLabel="Registrar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label="Data"
        hint="Deixe em branco para hoje."
        id="performed_at"
        error={err.erros.performed_at}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={performedAt}
            onChange={(e) => setPerformedAt(e.target.value)}
          />
        )}
      </Field>

      <Field label="O que foi feito" required id="description" error={err.erros.description}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              err.limparCampo("description");
            }}
            placeholder="Ex: troca de óleo e filtros"
          />
        )}
      </Field>

      <Field
        label="Custo (R$)"
        hint="Preenchido, gera uma despesa automática vinculada a esta manutenção."
        id="cost"
        error={err.erros.cost}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={cost}
            onValueChange={(v) => {
              setCost(v);
              err.limparCampo("cost");
            }}
          />
        )}
      </Field>

      <Field
        label="Próxima manutenção prevista"
        hint="Se informada, substitui a previsão anterior e gera aviso quando estiver próxima."
        id="next_due_at"
        error={err.erros.next_due_at}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={nextDueAt}
            onChange={(e) => setNextDueAt(e.target.value)}
          />
        )}
      </Field>
    </FormSheet>
  );
}
