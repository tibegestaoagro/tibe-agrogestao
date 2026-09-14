"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiPost } from "@/lib/client-api";

/**
 * Nova tarefa do Meu Dia (§18).
 *
 * ⚠️ **"O cadastro deverá ser extremamente simples"**, e só o título é
 * obrigatório. A data deixou de ser (§19, decisão 19): "preciso consertar a
 * porteira" é tarefa legítima. Todo o resto fica embaixo, opcional, e o
 * produtor que só quer anotar escreve uma linha e toca em Criar.
 */

const ORDEM = [
  "title",
  "due_date",
  "due_time",
  "priority",
  "worker_id",
  "assignee",
  "property_id",
  "recurrence",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

const NINGUEM = "__ninguem__";
const TODAS = "__todas__";
const NUNCA = "__nunca__";

export type OpcaoSimples = { id: string; name: string };

export default function TaskForm({
  workers,
  properties,
}: {
  workers: OpcaoSimples[];
  properties: OpcaoSimples[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgente">("normal");
  const [workerId, setWorkerId] = useState(NINGUEM);
  const [assignee, setAssignee] = useState("");
  const [propertyId, setPropertyId] = useState(TODAS);
  const [recurrence, setRecurrence] = useState(NUNCA);
  const [notes, setNotes] = useState("");
  const [remind, setRemind] = useState(true);

  function reset() {
    setTitle("");
    setDueDate("");
    setDueTime("");
    setPriority("normal");
    setWorkerId(NINGUEM);
    setAssignee("");
    setPropertyId(TODAS);
    setRecurrence(NUNCA);
    setNotes("");
    setRemind(true);
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!title.trim()) novos.title = "Diga o que precisa ser feito.";
    /*
     * As mesmas duas regras que o servidor aplica, repetidas aqui para o
     * produtor não ter que esperar a rede para descobrir: horário e repetição
     * não fazem sentido sem o dia.
     */
    if (dueTime && !dueDate) novos.due_time = "Para marcar horário, escolha também o dia.";
    if (recurrence !== NUNCA && !dueDate) novos.recurrence = "Para repetir, escolha o dia da primeira vez.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/tasks", {
      title: title.trim(),
      /* Meio-dia, e não meia-noite: a data do input é de calendário, e é
         assim que as outras telas do projeto a gravam para não escorregar de
         dia no fuso. */
      due_date: dueDate ? new Date(`${dueDate}T12:00:00.000Z`).toISOString() : null,
      due_time: dueTime || null,
      priority,
      worker_id: workerId !== NINGUEM ? workerId : null,
      assignee: assignee.trim() || null,
      property_id: propertyId !== TODAS ? propertyId : null,
      recurrence: recurrence !== NUNCA ? recurrence : null,
      notes: notes.trim() || null,
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
      description="Só o que precisa ser feito é obrigatório. O resto, preencha se ajudar."
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
            placeholder="Ex: arrumar a cerca do Pasto da Baixada"
          />
        )}
      </Field>

      <Field label="Dia" id="due_date" error={err.erros.due_date} hint="Sem dia, a tarefa fica na lista até você concluir.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              err.limparCampo("due_date");
              err.limparCampo("due_time");
              err.limparCampo("recurrence");
            }}
          />
        )}
      </Field>

      <Field label="Horário" id="due_time" error={err.erros.due_time}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="time"
            value={dueTime}
            onChange={(e) => {
              setDueTime(e.target.value);
              err.limparCampo("due_time");
            }}
          />
        )}
      </Field>

      <Field label="Prioridade" id="priority" error={err.erros.priority}>
        {({ id, ...aria }) => (
          <Select
            value={priority}
            onValueChange={(v) => {
              setPriority(v as "normal" | "urgente");
              err.limparCampo("priority");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      {workers.length > 0 && (
        <Field label="Responsável" id="worker_id" error={err.erros.worker_id}>
          {({ id, ...aria }) => (
            <Select
              value={workerId}
              onValueChange={(v) => {
                setWorkerId(v);
                err.limparCampo("worker_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUEM}>Eu mesmo</SelectItem>
                {workers.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field
        label={workers.length > 0 ? "Ou outra pessoa" : "Responsável"}
        id="assignee"
        error={err.erros.assignee}
        hint="Quem não está cadastrado na Mão de Obra: o vizinho, o veterinário."
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={assignee}
            onChange={(e) => {
              setAssignee(e.target.value);
              err.limparCampo("assignee");
            }}
            placeholder="Ex: Pedro"
          />
        )}
      </Field>

      {properties.length > 1 && (
        <Field label="Fazenda" id="property_id" error={err.erros.property_id}>
          {({ id, ...aria }) => (
            <Select
              value={propertyId}
              onValueChange={(v) => {
                setPropertyId(v);
                err.limparCampo("property_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Qualquer uma</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field label="Repetir" id="recurrence" error={err.erros.recurrence}>
        {({ id, ...aria }) => (
          <Select
            value={recurrence}
            onValueChange={(v) => {
              setRecurrence(v);
              err.limparCampo("recurrence");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NUNCA}>Não repetir</SelectItem>
              <SelectItem value="diaria">Todo dia</SelectItem>
              <SelectItem value="semanal">Toda semana</SelectItem>
              <SelectItem value="mensal">Todo mês</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Observação" id="notes" error={err.erros.notes}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              err.limparCampo("notes");
            }}
          />
        )}
      </Field>

      {dueDate && (
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
      )}
    </FormSheet>
  );
}
