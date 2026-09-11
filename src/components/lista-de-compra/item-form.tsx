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
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

/**
 * Anota um item na lista (§4).
 *
 * Só a descrição é obrigatória, e isso é o coração do módulo: "comprar arame",
 * sem quantidade nem nada, precisa funcionar (§5). Todo o resto está aqui para
 * quem quiser, não para quem precisar.
 */

const ORDEM = [
  "description",
  "quantity",
  "unit",
  "property_id",
  "category_id",
  "purpose",
  "place",
  "notes",
] as const;

const FINALIDADES: { valor: string; rotulo: string }[] = [
  { valor: "rebanho", rotulo: "Rebanho" },
  { valor: "pasto", rotulo: "Pasto" },
  { valor: "confinamento", rotulo: "Confinamento" },
  { valor: "leite", rotulo: "Leite" },
  { valor: "maquina", rotulo: "Máquina" },
  { valor: "cerca", rotulo: "Cerca" },
  { valor: "fazenda_geral", rotulo: "Fazenda em geral" },
  { valor: "outro", rotulo: "Outro" },
];

const SEM_ESCOLHA = "__nenhum__";

export type Opcao = { id: string; name: string };
export type UnidadeOpcao = { id: string; label: string };

export default function ItemForm({
  fazendas,
  categorias,
  unidades,
}: {
  fazendas: Opcao[];
  categorias: Opcao[];
  unidades: UnidadeOpcao[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [purpose, setPurpose] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [place, setPlace] = useState("");
  const [notes, setNotes] = useState("");

  function limpar() {
    setDescription("");
    setQuantity("");
    setUnit("");
    setPropertyId("");
    setCategoryId("");
    setPurpose("");
    setUrgente(false);
    setPlace("");
    setNotes("");
    err.limparTudo();
  }

  async function enviar(permitirDuplicata: boolean) {
    const texto = description.trim();
    if (!texto) {
      err.setGlobal(null);
      err.reprovar({ description: "Diga o que precisa comprar." });
      return false;
    }

    // Aceita "2,5" como o resto do painel: o produtor digita vírgula.
    const quantidadeDigitada = quantity.trim().replace(",", ".");
    const quantidade = quantidadeDigitada === "" ? null : Number(quantidadeDigitada);
    if (quantidade !== null && (!Number.isFinite(quantidade) || quantidade <= 0)) {
      err.setGlobal(null);
      err.reprovar({ quantity: "A quantidade precisa ser um número maior que zero." });
      return false;
    }

    setLoading(true);
    const res = await apiPost("/api/v1/shopping-items", {
      description: texto,
      quantity: quantidade,
      unit: unit || null,
      property_id: propertyId || null,
      category_id: categoryId || null,
      purpose: purpose || null,
      priority: urgente ? "urgente" : "normal",
      place: place || null,
      notes: notes || null,
      permitir_duplicata: permitirDuplicata,
    });
    setLoading(false);

    if (res.ok) return true;

    // §19.7: a duplicata PERGUNTA. Quem confirma, anota mesmo assim.
    if (res.code === "ITEM_JA_NA_LISTA" && !permitirDuplicata) {
      if (window.confirm(res.message)) return enviar(true);
      return false;
    }

    err.doServidor(res);
    return false;
  }

  async function submit() {
    const foi = await enviar(false);
    if (!foi) return;
    aviso.sucesso("Anotado na sua lista.");
    limpar();
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Anotar item</Button>}
      title="Anotar na lista"
      description="Só o que você precisa comprar já basta. Quantidade e o resto podem ficar para depois."
      open={open}
      onOpenChange={(aberto) => {
        setOpen(aberto);
        if (!aberto) limpar();
      }}
      onSubmit={submit}
      submitLabel="Anotar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="O que comprar" required id="description" error={err.erros.description}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              err.limparCampo("description");
            }}
            placeholder="Ex: sal mineral, arame, óleo do trator"
          />
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantidade" id="quantity" error={err.erros.quantity}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              inputMode="decimal"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                err.limparCampo("quantity");
              }}
              placeholder="10"
            />
          )}
        </Field>

        <Field label="Unidade" id="unit" error={err.erros.unit}>
          {({ id, ...aria }) => (
            <Select
              value={unit || SEM_ESCOLHA}
              onValueChange={(v) => {
                setUnit(v === SEM_ESCOLHA ? "" : v);
                err.limparCampo("unit");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Não informar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_ESCOLHA}>Não informar</SelectItem>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      <Field label="Fazenda" id="property_id" error={err.erros.property_id}>
        {({ id, ...aria }) => (
          <Select
            value={propertyId || SEM_ESCOLHA}
            onValueChange={(v) => {
              setPropertyId(v === SEM_ESCOLHA ? "" : v);
              err.limparCampo("property_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_ESCOLHA}>Todas</SelectItem>
              {fazendas.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoria" id="category_id" error={err.erros.category_id}>
          {({ id, ...aria }) => (
            <Select
              value={categoryId || SEM_ESCOLHA}
              onValueChange={(v) => {
                setCategoryId(v === SEM_ESCOLHA ? "" : v);
                err.limparCampo("category_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Não informar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_ESCOLHA}>Não informar</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label="Para que é" id="purpose" error={err.erros.purpose}>
          {({ id, ...aria }) => (
            <Select
              value={purpose || SEM_ESCOLHA}
              onValueChange={(v) => {
                setPurpose(v === SEM_ESCOLHA ? "" : v);
                err.limparCampo("purpose");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Não informar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_ESCOLHA}>Não informar</SelectItem>
                {FINALIDADES.map((f) => (
                  <SelectItem key={f.valor} value={f.valor}>
                    {f.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      </div>

      <Field
        label="Onde comprar"
        id="place"
        error={err.erros.place}
        hint="Agropecuária, ferragens, posto. Serve para agrupar a lista."
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={place}
            onChange={(e) => {
              setPlace(e.target.value);
              err.limparCampo("place");
            }}
            placeholder="Ex: Casa Agropecuária"
          />
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
            placeholder="Ex: da marca que o veterinário indicou"
          />
        )}
      </Field>

      <label className="flex items-center gap-2 text-sm text-texto">
        <input
          type="checkbox"
          checked={urgente}
          onChange={(e) => setUrgente(e.target.checked)}
          className="size-4 rounded border-borda-forte"
        />
        É urgente
      </label>
    </FormSheet>
  );
}
