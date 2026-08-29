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

type Property = { id: string; name: string };

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name", "area_hectares", "property_id"] as const;
type Campo = (typeof ORDEM)[number];

export default function PlotForm({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [propertyId, setPropertyId] = useState("");

  function reset() {
    setName("");
    setArea("");
    setPropertyId("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome do talhão.";
    if (!area.trim()) novos.area_hectares = "Informe a área em hectares.";
    if (!propertyId) novos.property_id = "Escolha a propriedade.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/plots", {
      name: name.trim(),
      area_hectares: lerValorDoCampo(area),
      property_id: propertyId,
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
      trigger={<Button>Novo talhão</Button>}
      title="Novo talhão"
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

      <Field label="Área (ha)" required id="area_hectares" error={err.erros.area_hectares}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="ha"
            value={area}
            onValueChange={(v) => {
              setArea(v);
              err.limparCampo("area_hectares");
            }}
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
    </FormSheet>
  );
}
