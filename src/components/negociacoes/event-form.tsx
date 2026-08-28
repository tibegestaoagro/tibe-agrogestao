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
import { HERD_CATEGORIES } from "@/lib/herd/categories";

/**
 * Abrir a remessa para leilão, feira ou evento (Módulo 31, missão 3).
 *
 * O formulário NÃO tem campo de valor, e essa ausência é o contrato: o §17.8
 * diz que o envio não pode virar venda antes da confirmação, e um campo de
 * valor aqui seria o convite para preencher. O valor entra no encerramento.
 *
 * A frase fixa embaixo existe porque é a coisa que o produtor mais precisa
 * entender antes de tocar em salvar, e uma explicação depois do fato não
 * conserta um registro que ele achou que era venda.
 *
 * Importa `@/lib/herd/categories` (módulo puro) e NUNCA a action: é a mesma
 * armadilha de bundle já documentada no `movement-form`.
 */

type Property = { id: string; name: string };
type Pasture = { id: string; name: string; property_id: string };

const ORDEM = [
  "event_name",
  "event_type",
  "organizer_name",
  "city",
  "property_id",
  "category_id",
  "quantity",
  "pasture_id",
  "occurred_at",
  "expected_end_at",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

const TIPOS_DE_EVENTO = ["Leilão", "Feira", "Exposição"];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function EventForm({
  properties,
  pastures,
  defaultPropertyId,
}: {
  properties: Property[];
  pastures: Pasture[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [eventName, setEventName] = useState("");
  const [eventType, setEventType] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [city, setCity] = useState("");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? properties[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [pastureId, setPastureId] = useState("");
  const [occurredAt, setOccurredAt] = useState(hoje());
  const [expectedEnd, setExpectedEnd] = useState("");
  const [notes, setNotes] = useState("");

  const pastosDaFazenda = pastures.filter((p) => p.property_id === propertyId);

  function limpar() {
    setEventName("");
    setEventType("");
    setOrganizer("");
    setCity("");
    setCategoryId("");
    setQuantity("1");
    setPastureId("");
    setOccurredAt(hoje());
    setExpectedEnd("");
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const qtd = lerValorDoCampo(quantity) ?? 0;
    const novos: Partial<Record<Campo, string>> = {};
    if (!eventName.trim()) novos.event_name = "Informe o nome do evento.";
    if (!propertyId) novos.property_id = "Escolha a fazenda.";
    if (!categoryId) novos.category_id = "Escolha a categoria.";
    if (!Number.isInteger(qtd) || qtd <= 0) {
      novos.quantity = "Informe uma quantidade inteira maior que zero.";
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/negotiations/events", {
      property_id: propertyId,
      category_id: categoryId,
      quantity: qtd,
      pasture_id: pastureId || null,
      event_name: eventName.trim(),
      event_type: eventType.trim() || null,
      city: city.trim() || null,
      organizer_name: organizer.trim() || null,
      occurred_at: occurredAt ? new Date(`${occurredAt}T12:00:00`).toISOString() : null,
      expected_end_at: expectedEnd ? new Date(`${expectedEnd}T12:00:00`).toISOString() : null,
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
      trigger={<Button variant="outline">Mandar para leilão ou evento</Button>}
      title="Remessa para leilão ou evento"
      description="O gado sai da fazenda e continua sendo seu. A venda só existe quando o evento terminar."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar remessa"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome do evento" required id="event_name" error={err.erros.event_name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            placeholder="Ex: Leilão de Outubro"
            value={eventName}
            onChange={(e) => {
              setEventName(e.target.value);
              err.limparCampo("event_name");
            }}
          />
        )}
      </Field>

      <Field label="Tipo do evento" id="event_type" error={err.erros.event_type}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            list="tipos-de-evento"
            placeholder="Leilão, feira, exposição..."
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          />
        )}
      </Field>
      {/* Lista de sugestão, não de escolha: o documento do cliente não fecha
          os tipos, e uma constante nossa recusaria o que o produtor escrever. */}
      <datalist id="tipos-de-evento">
        {TIPOS_DE_EVENTO.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <Field
        label="Leiloeira ou organizador"
        hint="Vira um contato, para você encontrar o negócio por ele depois."
        id="organizer_name"
        error={err.erros.organizer_name}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={organizer}
            onChange={(e) => setOrganizer(e.target.value)}
          />
        )}
      </Field>

      <Field label="Município do evento" id="city" error={err.erros.city}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={city} onChange={(e) => setCity(e.target.value)} />
        )}
      </Field>

      <Field label="Fazenda" required id="property_id" error={err.erros.property_id}>
        {({ id, ...aria }) => (
          <Select
            value={propertyId}
            onValueChange={(v) => {
              setPropertyId(v);
              setPastureId("");
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

      <Field label="Categoria" required id="category_id" error={err.erros.category_id}>
        {({ id, ...aria }) => (
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              err.limparCampo("category_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a categoria" />
            </SelectTrigger>
            <SelectContent>
              {HERD_CATEGORIES.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Quantidade de cabeças" required id="quantity" error={err.erros.quantity}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="cabeças"
            value={quantity}
            onValueChange={(v) => {
              setQuantity(v);
              err.limparCampo("quantity");
            }}
          />
        )}
      </Field>

      {pastosDaFazenda.length > 0 && (
        <Field
          label="Pasto de origem"
          hint="De onde as cabeças saem. Opcional."
          id="pasture_id"
          error={err.erros.pasture_id}
        >
          {({ id, ...aria }) => (
            <Select value={pastureId} onValueChange={setPastureId}>
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem pasto informado" />
              </SelectTrigger>
              <SelectContent>
                {pastosDaFazenda.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field label="Data da saída" id="occurred_at" error={err.erros.occurred_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        )}
      </Field>

      <Field label="Retorno previsto" id="expected_end_at" error={err.erros.expected_end_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={expectedEnd}
            onChange={(e) => setExpectedEnd(e.target.value)}
          />
        )}
      </Field>

      <Field label="Observação" id="notes" error={err.erros.notes}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>

      <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
        Mandar para o evento <span className="font-medium text-texto">não é vender</span>. As
        cabeças continuam no seu rebanho, saem da contagem da fazenda, e nada é lançado no
        Financeiro agora. Quando o evento terminar, você diz quantas venderam.
      </p>
    </FormSheet>
  );
}
