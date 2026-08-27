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
import { primeiroInvalido, aplicarErroDoServidor } from "@/lib/erros-de-formulario";

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
  const [error, setError] = useState<string | null>(null);
  const [erros, setErros] = useState<Erros>({});
  const [foco, setFoco] = useState<Campo | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const [earTag, setEarTag] = useState(animal.ear_tag);
  const [breed, setBreed] = useState(animal.breed ?? "");
  const [sex, setSex] = useState<"male" | "female">(animal.sex);
  const [propertyId, setPropertyId] = useState(animal.property_id);
  const [birthDate, setBirthDate] = useState(
    animal.birth_date ? animal.birth_date.slice(0, 10) : "",
  );

  function reprovar(novos: Erros) {
    setErros(novos);
    setFoco(primeiroInvalido(novos, ORDEM));
    setTentativa((n) => n + 1);
  }

  async function submit() {
    const novos: Erros = {};
    if (!earTag.trim()) novos.ear_tag = "Informe o brinco.";
    if (!breed.trim()) novos.breed = "Informe a raça.";
    if (Object.keys(novos).length > 0) {
      setError(null);
      reprovar(novos);
      return;
    }

    setLoading(true);
    setErros({});
    setError(null);
    const res = await apiPatch(`/api/v1/animals/${animal.id}`, {
      ear_tag: earTag,
      breed,
      sex,
      property_id: propertyId,
      birth_date: birthDate ? new Date(birthDate).toISOString() : null,
    });
    setLoading(false);

    if (!res.ok) {
      const { erros: doServidor, global } = aplicarErroDoServidor(res, ORDEM);
      setError(global);
      reprovar(doServidor);
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
      error={error}
      focarCampoId={foco}
      tentativa={tentativa}
    >
      <Field label="Brinco" required id="ear_tag" error={erros.ear_tag}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={earTag}
            onChange={(e) => setEarTag(e.target.value)}
          />
        )}
      </Field>

      <Field label="Raça" required id="breed" error={erros.breed}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={breed} onChange={(e) => setBreed(e.target.value)} />
        )}
      </Field>

      <Field label="Sexo" required id="sex" error={erros.sex}>
        {({ id, ...aria }) => (
          <Select value={sex} onValueChange={(v) => setSex(v as "male" | "female")}>
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

      <Field label="Propriedade" required id="property_id" error={erros.property_id}>
        {({ id, ...aria }) => (
          <Select value={propertyId} onValueChange={setPropertyId}>
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

      <Field label="Data de nascimento" id="birth_date" error={erros.birth_date}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        )}
      </Field>
    </FormSheet>
  );
}
