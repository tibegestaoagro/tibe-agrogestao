"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MilkSiteType } from "@/generated/prisma/client";
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
 * Cadastro de tanque próprio e de ponto de coleta de terceiros (§13 e §16).
 *
 * Um formulário só, com o tipo escolhido por botão, porque são o mesmo
 * conceito: um lugar onde o leite pode estar. O que muda entre eles é UM
 * campo, e o rótulo diz qual.
 */

type Property = { id: string; name: string };

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

export default function SiteForm({
  properties,
  defaultPropertyId,
}: {
  properties: Property[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, "local");

  const [tipo, setTipo] = useState<MilkSiteType>("proprio");
  const [name, setName] = useState("");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [counterparty, setCounterparty] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("");
  const [notes, setNotes] = useState("");

  function limpar() {
    setTipo("proprio");
    setName("");
    setPropertyId(defaultPropertyId ?? "");
    setCounterparty("");
    setCity("");
    setCapacity("");
    setNotes("");
    err.limparTudo();
  }

  function trocarTipo(novo: MilkSiteType) {
    setTipo(novo);
    // O campo do tipo abandonado sai do DOM. Deixar o valor no estado mandaria
    // um dado que a tela não mostra mais, e a recusa cairia num campo
    // invisível: a armadilha registrada em .claude/rules/ui.md.
    if (novo === "proprio") {
      setCounterparty("");
      err.limparCampo("counterparty_name");
    } else {
      setPropertyId("");
      err.limparCampo("property_id");
    }
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome.";
    if (tipo === "proprio" && !propertyId) novos.property_id = "Escolha a fazenda.";
    if (tipo === "terceiro" && !counterparty.trim()) {
      novos.counterparty_name = "Informe de quem é o ponto de coleta.";
    }
    const cap = capacity.trim() === "" ? null : lerValorDoCampo(capacity);
    if (capacity.trim() !== "" && (cap === null || !Number.isInteger(cap) || cap <= 0)) {
      novos.capacity = "A capacidade deve ser um número inteiro maior que zero.";
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/milk/sites", {
      name: name.trim(),
      type: tipo,
      property_id: tipo === "proprio" ? propertyId : null,
      counterparty_name: tipo === "terceiro" ? counterparty.trim() : null,
      city: city.trim() || null,
      capacity: cap,
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
      trigger={
        <Button variant="outline" size="sm">
          Novo local
        </Button>
      }
      title={tipo === "proprio" ? "Cadastrar tanque próprio" : "Cadastrar ponto de coleta"}
      description="Onde o leite pode estar: um tanque seu, ou o ponto de coleta de outra pessoa."
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
      <div className="space-y-1">
        <p className="text-sm font-medium text-texto">De quem é o local?</p>
        <div className="flex gap-2">
          {(
            [
              ["proprio", "Tanque meu"],
              ["terceiro", "Ponto de coleta de outro"],
            ] as const
          ).map(([valor, rotulo]) => (
            <Button
              key={valor}
              type="button"
              variant={tipo === valor ? "default" : "outline"}
              onClick={() => trocarTipo(valor)}
            >
              {rotulo}
            </Button>
          ))}
        </div>
      </div>

      <Field
        label="Nome"
        required
        id="local-name"
        error={err.erros.name}
        hint={tipo === "proprio" ? "Exemplo: Tanque Principal." : "Exemplo: Ponto do Zé."}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              err.limparCampo("name");
            }}
          />
        )}
      </Field>

      {tipo === "proprio" ? (
        <Field label="Fazenda" required id="local-property_id" error={err.erros.property_id}>
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
      ) : (
        <Field
          label="De quem é o ponto de coleta"
          required
          id="local-counterparty_name"
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
            />
          )}
        </Field>
      )}

      <Field label="Município" id="local-city" error={err.erros.city} hint="Opcional.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              err.limparCampo("city");
            }}
          />
        )}
      </Field>

      <Field
        label="Capacidade (litros)"
        id="local-capacity"
        error={err.erros.capacity}
        hint="Opcional. Serve de aviso, não de limite: o TIBÉ não recusa leite por causa dela."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="L"
            value={capacity}
            onValueChange={(v) => {
              setCapacity(v);
              err.limparCampo("capacity");
            }}
          />
        )}
      </Field>

      <Field label="Observação" id="local-notes" error={err.erros.notes} hint="Opcional.">
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
    </FormSheet>
  );
}
