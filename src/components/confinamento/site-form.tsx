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
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

/**
 * Cadastro de um confinamento (§5, fase 3 do Módulo 30): próprio, que aponta
 * para uma fazenda, ou Boitel, que aponta para uma contraparte. Só cria: a
 * rota de edição não existe, e "arquivar" é a saída, como em Fazenda e Pasto.
 */

type Property = { id: string; name: string };
type Tipo = "proprio" | "boitel";

const ORDEM = [
  "type",
  "name",
  "property_id",
  "counterparty_name",
  "city",
  "capacity",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

export default function SiteForm({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [type, setType] = useState<Tipo | "">("");
  const [name, setName] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("");
  const [notes, setNotes] = useState("");

  function limpar() {
    setType("");
    setName("");
    setPropertyId("");
    setCounterparty("");
    setCity("");
    setCapacity("");
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!type) novos.type = "Escolha o tipo de confinamento.";
    if (!name.trim()) novos.name = "Informe o nome.";
    if (type === "proprio" && !propertyId) {
      novos.property_id = "Escolha a fazenda relacionada.";
    }
    if (type === "boitel" && !counterparty.trim()) {
      novos.counterparty_name = "Informe a empresa ou o proprietário do Boitel.";
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/confinement/sites", {
      type,
      name: name.trim(),
      property_id: type === "proprio" ? propertyId : null,
      counterparty_name: type === "boitel" ? counterparty.trim() : null,
      city: city.trim() || null,
      capacity: lerValorDoCampo(capacity),
      notes: notes.trim() || null,
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
      trigger={<Button variant="outline">+ Novo confinamento</Button>}
      title="Cadastrar confinamento"
      description="Um local próprio ou um Boitel de terceiro. É para aqui que a entrada de animais aponta."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Cadastrar"
      submitPendingLabel="Cadastrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Tipo" required id="type" error={err.erros.type}>
        {({ id, ...aria }) => (
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as Tipo);
              err.limparCampo("type");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="proprio">Confinamento próprio</SelectItem>
              <SelectItem value="boitel">Boitel</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Nome" required id="name" error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              err.limparCampo("name");
            }}
            placeholder="Ex: Curral do brejo"
          />
        )}
      </Field>

      {type === "proprio" && (
        <Field label="Fazenda" required id="property_id" error={err.erros.property_id}>
          {({ id, ...aria }) => (
            <Select
              value={propertyId}
              onValueChange={(v) => {
                setPropertyId(v);
                err.limparCampo("property_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Escolha a fazenda" />
              </SelectTrigger>
              <SelectContent>
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

      {type === "boitel" && (
        <Field
          label="Empresa ou proprietário"
          required
          id="counterparty_name"
          error={err.erros.counterparty_name}
        >
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              value={counterparty}
              onChange={(e) => {
                setCounterparty(e.target.value);
                err.limparCampo("counterparty_name");
              }}
              placeholder="Ex: Boitel Santa Fé"
            />
          )}
        </Field>
      )}

      <Field label="Cidade" hint="Opcional." id="city" error={err.erros.city}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={city} onChange={(e) => setCity(e.target.value)} />
        )}
      </Field>

      <Field
        label="Capacidade"
        hint="Quantas cabeças cabem aqui. Opcional."
        id="capacity"
        error={err.erros.capacity}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="cabeças"
            value={capacity}
            onValueChange={(v) => {
              setCapacity(v);
              err.limparCampo("capacity");
            }}
          />
        )}
      </Field>

      <Field label="Observações" hint="Opcional." id="notes" error={err.erros.notes}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
    </FormSheet>
  );
}
