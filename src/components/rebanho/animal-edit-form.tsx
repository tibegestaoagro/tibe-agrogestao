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
import { apiPatch } from "@/lib/client-api";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";

type Property = { id: string; name: string };

/**
 * A ordem é a da TELA, de cima para baixo, e os nomes são os da API: é o que
 * o servidor devolve em `error.field`, então a recusa casa com o campo sem
 * tradutor no meio.
 */
const ORDEM = ["ear_tag", "breed", "sex", "property_id", "birth_date"] as const;
type Campo = (typeof ORDEM)[number];
type Erros = Partial<Record<Campo, string>>;

export default function AnimalEditForm({
  animal,
  properties,
}: {
  animal: {
    id: string;
    ear_tag: string;
    breed: string | null;
    sex: "male" | "female";
    property_id: string;
    birth_date: string | null; // ISO ou null
  };
  properties: Property[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [earTag, setEarTag] = useState(animal.ear_tag);
  const [breed, setBreed] = useState(animal.breed ?? "");
  const [sex, setSex] = useState<"male" | "female">(animal.sex);
  const [propertyId, setPropertyId] = useState(animal.property_id);
  const [birthDate, setBirthDate] = useState(
    animal.birth_date ? animal.birth_date.slice(0, 10) : "",
  );

  async function submit() {
    const novos: Erros = {};
    if (!earTag.trim()) novos.ear_tag = "Informe o brinco.";
    if (!breed.trim()) novos.breed = "Informe a raça.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    setLoading(true);
    err.limparTudo();
    const res = await apiPatch(`/api/v1/animals/${animal.id}`, {
      ear_tag: earTag,
      breed,
      sex,
      property_id: propertyId,
      birth_date: birthDate ? new Date(birthDate).toISOString() : null,
    });
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Editar
        </Button>
      }
      title="Editar animal"
      open={open}
      onOpenChange={setOpen}
      onSubmit={submit}
      submitLabel="Salvar alterações"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Brinco" required id="ear_tag" error={err.erros.ear_tag}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={earTag}
            onChange={(e) => { setEarTag(e.target.value); err.limparCampo("ear_tag"); }}
          />
        )}
      </Field>

      <Field label="Raça" required id="breed" error={err.erros.breed}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={breed} onChange={(e) => { setBreed(e.target.value); err.limparCampo("breed"); }} />
        )}
      </Field>

      <Field label="Sexo" required id="sex" error={err.erros.sex}>
        {({ id, ...aria }) => (
          <Select value={sex} onValueChange={(v) => { setSex(v as "male" | "female"); err.limparCampo("sex"); }}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="male">Macho</SelectItem>
              <SelectItem value="female">Fêmea</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Propriedade" required id="property_id" error={err.erros.property_id}>
        {({ id, ...aria }) => (
          <Select value={propertyId} onValueChange={(v) => { setPropertyId(v); err.limparCampo("property_id"); }}>
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

      <Field label="Data de nascimento" id="birth_date" error={err.erros.birth_date}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={birthDate}
            onChange={(e) => { setBirthDate(e.target.value); err.limparCampo("birth_date"); }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
