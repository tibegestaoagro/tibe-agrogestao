"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["title", "due_date"] as const;
type Campo = (typeof ORDEM)[number];

export default function TaskForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [remind, setRemind] = useState(true);

  function reset() {
    setTitle("");
    setDueDate("");
    setRemind(true);
    err.limparTudo();
  }

  async function submit() {
    // Antes, os dois campos obrigatórios compartilhavam UMA frase no rodapé
    // ("Preencha o que precisa ser feito e a data"), e o produtor que tinha
    // esquecido só a data lia a cobrança dos dois.
    const novos: Partial<Record<Campo, string>> = {};
    if (!title.trim()) novos.title = "Diga o que precisa ser feito.";
    if (!dueDate) novos.due_date = "Escolha a data.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/tasks", {
      title: title.trim(),
      due_date: new Date(dueDate).toISOString(),
      remind,
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
      trigger={<Button>Nova tarefa</Button>}
      title="Nova tarefa"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      onSubmit={submit}
      submitLabel="Criar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="O que precisa ser feito" required id="title" error={err.erros.title}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              err.limparCampo("title");
            }}
            placeholder="Ex: comprar sal mineral"
          />
        )}
      </Field>

      <Field label="Data" required id="due_date" error={err.erros.due_date}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              err.limparCampo("due_date");
            }}
          />
        )}
      </Field>

      <div className="flex items-center gap-2">
        <input
          id="remind"
          type="checkbox"
          checked={remind}
          onChange={(e) => setRemind(e.target.checked)}
          className="h-4 w-4 rounded border-borda-campo"
        />
        <Label htmlFor="remind" className="!mb-0">
          Me avisar no dia
        </Label>
      </div>
    </FormSheet>
  );
}
