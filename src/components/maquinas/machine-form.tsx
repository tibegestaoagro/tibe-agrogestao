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
 * Cadastro de máquina.
 *
 * ⚠️ Este painel é a cicatriz do modo avião: em teste com um Android sem sinal
 * ele NÃO ABRIA, o que tornava a fila offline inútil justo no curral. O
 * `FormSheet` não busca nada do servidor para renderizar, e as propriedades
 * chegam por prop, já carregadas pela página. Não introduza nenhuma busca
 * aqui.
 */

type Property = { id: string; name: string };

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = [
  "name",
  "type",
  "property_id",
  "brand",
  "model",
  "year",
  "hour_meter",
  "acquisition_cost",
] as const;
type Campo = (typeof ORDEM)[number];

export default function MachineForm({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [hourMeter, setHourMeter] = useState("");

  function reset() {
    setName("");
    setType("");
    setBrand("");
    setModel("");
    setYear("");
    setPropertyId("");
    setAcquisitionCost("");
    setHourMeter("");
    err.limparTudo();
  }

  async function submit() {
    // Antes, os três obrigatórios dividiam UMA frase ("Preencha nome, tipo e
    // propriedade"), e quem tinha esquecido só a propriedade lia a cobrança
    // dos três.
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome da máquina.";
    if (!type.trim()) novos.type = "Informe o tipo.";
    if (!propertyId) novos.property_id = "Escolha a propriedade.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/machines", {
      name: name.trim(),
      type: type.trim(),
      brand: brand.trim() || null,
      model: model.trim() || null,
      year: year ? Number(year) : null,
      property_id: propertyId,
      acquisition_cost: lerValorDoCampo(acquisitionCost),
      hour_meter: lerValorDoCampo(hourMeter),
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
      trigger={<Button>Nova máquina</Button>}
      title="Nova máquina"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      onSubmit={submit}
      submitLabel="Cadastrar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
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
          />
        )}
      </Field>

      <Field label="Tipo" required id="type" error={err.erros.type}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              err.limparCampo("type");
            }}
            placeholder="Ex: trator, colheitadeira, pulverizador"
          />
        )}
      </Field>

      <Field label="Propriedade" required id="property_id" error={err.erros.property_id}>
        {({ id, ...aria }) => (
          <Select
            value={propertyId}
            onValueChange={(v) => {
              setPropertyId(v);
              err.limparCampo("property_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
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

      <Field label="Marca" id="brand" error={err.erros.brand}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={brand} onChange={(e) => setBrand(e.target.value)} />
        )}
      </Field>

      <Field label="Modelo" id="model" error={err.erros.model}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={model} onChange={(e) => setModel(e.target.value)} />
        )}
      </Field>

      {/*
        Único `type="number"` permitido do projeto, e por um motivo escrito em
        `NUMBER_PERMITIDO` no `check-repo.ts`: ano de fabricação é inteiro de 4
        dígitos, sem milhar e sem decimal. Um `MoneyInput` mostraria "1.998".
      */}
      <Field label="Ano" id="year" error={err.erros.year}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        )}
      </Field>

      <Field label="Horímetro (h)" id="hour_meter" error={err.erros.hour_meter}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="h"
            value={hourMeter}
            onValueChange={setHourMeter}
          />
        )}
      </Field>

      <Field
        label="Custo de aquisição (R$)"
        hint="Preenchido, gera uma despesa automática vinculada à máquina."
        id="acquisition_cost"
        error={err.erros.acquisition_cost}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={acquisitionCost}
            onValueChange={(v) => {
              setAcquisitionCost(v);
              err.limparCampo("acquisition_cost");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
