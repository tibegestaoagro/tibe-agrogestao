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
import { CHARGE_LABEL } from "@/components/confinamento/labels";

/**
 * Entrada de animais no confinamento (§6, §7 da spec). O total do rebanho não
 * muda: é uma transferência de posição, do mesmo jeito que o resto da fase 2.
 */

type Site = { id: string; name: string; type: "proprio" | "boitel"; property_id: string | null };
type Property = { id: string; name: string };
type Pasture = { id: string; name: string; property_id: string };

const ORDEM = [
  "confinement_site_id",
  "quantity",
  "category_id",
  "property_id",
  "pasture_id",
  "started_at",
  "expected_end_at",
  "charge_type",
  "charge_value",
  "due_date",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function StayOpenForm({
  sites,
  properties,
  pastures,
  defaultPropertyId,
}: {
  sites: Site[];
  properties: Property[];
  pastures: Pasture[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [siteId, setSiteId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [categoryId, setCategoryId] = useState("");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [pastureId, setPastureId] = useState("");
  const [startedAt, setStartedAt] = useState(hoje());
  const [expectedEnd, setExpectedEnd] = useState("");
  const [chargeType, setChargeType] = useState("");
  const [chargeValue, setChargeValue] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const pastosDaFazenda = pastures.filter((p) => p.property_id === propertyId);

  /**
   * Confinamento próprio já sabe de qual fazenda ele é: escolher o site
   * pré-seleciona a fazenda de origem, e o produtor só troca se os animais
   * vierem de outra. Boitel não tem fazenda própria, então não há o que
   * sugerir. Decidido no clique (não num `useEffect`), porque um `setState`
   * síncrono dentro de efeito encadeia um segundo render à toa.
   */
  function escolherSite(id: string) {
    setSiteId(id);
    err.limparCampo("confinement_site_id");
    const escolhido = sites.find((s) => s.id === id) ?? null;
    if (escolhido?.type === "proprio" && escolhido.property_id) {
      setPropertyId(escolhido.property_id);
      err.limparCampo("property_id");
    }
  }

  function limpar() {
    setSiteId("");
    setQuantity("1");
    setCategoryId("");
    setPropertyId(defaultPropertyId ?? "");
    setPastureId("");
    setStartedAt(hoje());
    setExpectedEnd("");
    setChargeType("");
    setChargeValue("");
    setDueDate("");
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const qtd = lerValorDoCampo(quantity) ?? 0;
    const novos: Partial<Record<Campo, string>> = {};
    if (!siteId) novos.confinement_site_id = "Escolha o confinamento.";
    if (!Number.isInteger(qtd) || qtd <= 0) {
      novos.quantity = "Informe uma quantidade inteira maior que zero.";
    }
    if (!categoryId) novos.category_id = "Escolha a categoria.";
    if (!propertyId) novos.property_id = "Informe a fazenda de origem dos animais.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/confinement/stays", {
      confinement_site_id: siteId,
      category_id: categoryId,
      quantity: qtd,
      property_id: propertyId,
      pasture_id: pastureId || null,
      started_at: startedAt ? new Date(`${startedAt}T12:00:00`).toISOString() : null,
      expected_end_at: expectedEnd ? new Date(`${expectedEnd}T12:00:00`).toISOString() : null,
      charge_type: chargeType || null,
      charge_value: lerValorDoCampo(chargeValue),
      due_date: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
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
      trigger={<Button>Registrar entrada</Button>}
      title="Registrar entrada no confinamento"
      description="As cabeças saem do pasto e entram no confinamento, sem sair do rebanho."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar entrada"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label="Confinamento"
        required
        id="confinement_site_id"
        error={err.erros.confinement_site_id}
      >
        {({ id, ...aria }) => (
          <Select value={siteId} onValueChange={escolherSite}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o confinamento" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
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

      <Field
        label="Fazenda de origem"
        required
        hint="De onde as cabeças estão saindo."
        id="property_id"
        error={err.erros.property_id}
      >
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

      {pastosDaFazenda.length > 0 && (
        <Field label="Pasto de origem" hint="Opcional." id="pasture_id">
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

      <Field label="Data de entrada" id="started_at" error={err.erros.started_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={startedAt}
            onChange={(e) => setStartedAt(e.target.value)}
          />
        )}
      </Field>

      <Field label="Saída prevista" hint="Opcional." id="expected_end_at">
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

      <Field
        label="Forma de cobrança"
        hint="Opcional. A tela mostra o valor combinado, sem calcular nada em cima dele."
        id="charge_type"
      >
        {({ id, ...aria }) => (
          <Select value={chargeType} onValueChange={setChargeType}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Sem cobrança combinada" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CHARGE_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Valor combinado em R$"
        hint="Opcional."
        id="charge_value"
        error={err.erros.charge_value}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={chargeValue}
            onValueChange={(v) => {
              setChargeValue(v);
              err.limparCampo("charge_value");
            }}
          />
        )}
      </Field>

      <Field label="Vencimento" hint="Opcional." id="due_date">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        )}
      </Field>

      <Field label="Observações" hint="Opcional." id="notes">
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
    </FormSheet>
  );
}
