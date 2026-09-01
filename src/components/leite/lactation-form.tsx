"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { LactationEntryType } from "@/generated/prisma/client";
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
 * Vacas em lactação: definir, entrada e saída (§4 e §7 da Área Leite).
 *
 * Os três verbos num painel só, com o tipo escolhido por botão, porque são a
 * mesma pergunta ("quantas vacas?") com três significados. Três painéis irmãos
 * exigiriam `prefixoDeId` em cada um e triplicariam o mesmo formulário.
 *
 * O rótulo da quantidade muda com o tipo: "quantas vacas estão em lactação"
 * não é a mesma pergunta que "quantas entraram", e um rótulo genérico faria o
 * produtor digitar o total onde o sistema espera a diferença.
 */

type Property = { id: string; name: string };
type Pasture = { id: string; name: string; property_id: string };
type Group = { id: string; name: string; property_id: string };

const ORDEM = [
  "property_id",
  "quantity",
  "recorded_at",
  "pasture_id",
  "group_id",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

const TIPOS: { valor: LactationEntryType; botao: string; rotulo: string; titulo: string }[] = [
  {
    valor: "definir",
    botao: "Informar total",
    rotulo: "Vacas em lactação agora",
    titulo: "Informar quantas vacas estão em lactação",
  },
  {
    valor: "entrada",
    botao: "Entraram",
    rotulo: "Quantas vacas entraram",
    titulo: "Registrar entrada na lactação",
  },
  {
    valor: "saida",
    botao: "Secaram",
    rotulo: "Quantas vacas secaram",
    titulo: "Registrar saída da lactação",
  },
];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function LactationForm({
  properties,
  pastures,
  groups,
  defaultPropertyId,
}: {
  properties: Property[];
  pastures: Pasture[];
  groups: Group[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, "lact");

  const [tipo, setTipo] = useState<LactationEntryType>("definir");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [quantity, setQuantity] = useState("");
  const [data, setData] = useState(hoje());
  const [pastureId, setPastureId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [notes, setNotes] = useState("");

  const escolhido = TIPOS.find((t) => t.valor === tipo) ?? TIPOS[0];
  const pastosDaFazenda = pastures.filter((p) => p.property_id === propertyId);
  const lotesDaFazenda = groups.filter((g) => g.property_id === propertyId);

  function limpar() {
    setTipo("definir");
    setPropertyId(defaultPropertyId ?? "");
    setQuantity("");
    setData(hoje());
    setPastureId("");
    setGroupId("");
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!propertyId) novos.property_id = "Escolha a fazenda.";
    if (!data) novos.recorded_at = "Informe a data.";

    const qtd = lerValorDoCampo(quantity);
    if (qtd === null || !Number.isInteger(qtd) || qtd < 0) {
      novos.quantity = "Informe um número inteiro de vacas.";
    } else if (qtd === 0 && tipo !== "definir") {
      // "Entraram zero vacas" não afirma nada. Já "tenho zero em lactação" é
      // uma afirmação legítima, e a rota aceita.
      novos.quantity = "Informe quantas vacas entraram ou saíram.";
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/milk/lactation", {
      property_id: propertyId,
      type: tipo,
      quantity: qtd,
      recorded_at: data ? new Date(`${data}T12:00:00`).toISOString() : null,
      pasture_id: pastureId || null,
      group_id: groupId || null,
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
      trigger={<Button variant="outline">Atualizar lactação</Button>}
      title={escolhido.titulo}
      description="Muda só quantas vacas estão produzindo. O total do rebanho continua o mesmo."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <div className="space-y-1">
        <p className="text-sm font-medium text-texto">O que aconteceu?</p>
        <div className="flex flex-wrap gap-2">
          {TIPOS.map((t) => (
            <Button
              key={t.valor}
              type="button"
              variant={tipo === t.valor ? "default" : "outline"}
              onClick={() => {
                setTipo(t.valor);
                err.limparCampo("quantity");
              }}
            >
              {t.botao}
            </Button>
          ))}
        </div>
      </div>

      <Field label="Fazenda" required id="lact-property_id" error={err.erros.property_id}>
        {({ id, ...aria }) => (
          <Select
            value={propertyId}
            onValueChange={(v) => {
              setPropertyId(v);
              err.limparCampo("property_id");
              setPastureId("");
              setGroupId("");
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

      <Field label={escolhido.rotulo} required id="lact-quantity" error={err.erros.quantity}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            value={quantity}
            onValueChange={(v) => {
              setQuantity(v);
              err.limparCampo("quantity");
            }}
          />
        )}
      </Field>

      <Field label="Data" required id="lact-recorded_at" error={err.erros.recorded_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              err.limparCampo("recorded_at");
            }}
          />
        )}
      </Field>

      {pastosDaFazenda.length > 0 && (
        <Field label="Pasto" id="lact-pasture_id" error={err.erros.pasture_id} hint="Opcional.">
          {({ id, ...aria }) => (
            <Select
              value={pastureId}
              onValueChange={(v) => {
                setPastureId(v);
                err.limparCampo("pasture_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem pasto" />
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

      {lotesDaFazenda.length > 0 && (
        <Field label="Lote" id="lact-group_id" error={err.erros.group_id} hint="Opcional.">
          {({ id, ...aria }) => (
            <Select
              value={groupId}
              onValueChange={(v) => {
                setGroupId(v);
                err.limparCampo("group_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem lote" />
              </SelectTrigger>
              <SelectContent>
                {lotesDaFazenda.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field label="Observação" id="lact-notes" error={err.erros.notes} hint="Opcional.">
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
