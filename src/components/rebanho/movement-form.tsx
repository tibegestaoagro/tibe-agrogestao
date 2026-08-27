"use client";

import { useMemo, useState } from "react";
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
import { apiPost } from "@/lib/client-api";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { HERD_CATEGORIES } from "@/lib/herd/categories";

/**
 * Registrar movimentação (Módulo 30).
 *
 * Importa `@/lib/herd/categories` (módulo puro, sem Prisma) e NUNCA
 * `@/lib/actions/herd-ledger`, que arrastaria o Prisma para o bundle do
 * navegador: mesma armadilha já documentada para `@/lib/permissions`.
 *
 * A fase 1 sempre envia `situation: "presente"` e `owner: "proprio"`. Os
 * outros valores desses dois eixos existem no banco desde já, mas só ganham
 * fluxo próprio na fase 2 (leilão, boitel, confinamento, pasto de terceiro).
 */

type Property = { id: string; name: string };
type Pasture = { id: string; name: string; property_id: string };

type Shape = "entrada" | "saida" | "transferencia" | "ajuste";

const TYPES: { id: string; label: string; shape: Shape; group: string }[] = [
  { id: "saldo_inicial", label: "Saldo inicial", shape: "entrada", group: "Entradas" },
  { id: "nascimento", label: "Nascimento", shape: "entrada", group: "Entradas" },
  { id: "compra", label: "Compra", shape: "entrada", group: "Entradas" },
  { id: "venda", label: "Venda", shape: "saida", group: "Saídas" },
  { id: "morte", label: "Morte", shape: "saida", group: "Saídas" },
  { id: "transferencia_pasto", label: "Mudar de pasto", shape: "transferencia", group: "Movimentações" },
  { id: "transferencia_fazenda", label: "Mudar de fazenda", shape: "transferencia", group: "Movimentações" },
  { id: "mudanca_categoria", label: "Mudar de categoria", shape: "transferencia", group: "Movimentações" },
  { id: "ajuste", label: "Ajuste de saldo", shape: "ajuste", group: "Correção" },
];

const WITH_VALUE = new Set(["compra", "venda"]);

/**
 * A ordem é a da TELA, de cima para baixo, e os nomes são os que a API usa no
 * corpo: `movement_type`, `quantity`, e as posições achatadas com o prefixo do
 * lado (`from_category_id`). O achatamento existe porque `error.field` é uma
 * string: o servidor que recusar a categoria de origem diz
 * `from_category_id`, e o painel acha o campo sem tradutor no meio.
 */
const ORDEM = [
  "movement_type",
  "quantity",
  "from_category_id",
  "from_property_id",
  "from_pasture_id",
  "to_category_id",
  "to_property_id",
  "to_pasture_id",
  "value",
  "occurred_at",
  "reason",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];
type Erros = Partial<Record<Campo, string>>;

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function MovementForm({
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

  const [type, setType] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [value, setValue] = useState("");
  const [occurredAt, setOccurredAt] = useState(hoje());
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [ajusteDirection, setAjusteDirection] = useState<"aumentar" | "diminuir">("aumentar");

  const primeiraFazenda = defaultPropertyId ?? properties[0]?.id ?? "";
  const [fromCategory, setFromCategory] = useState("");
  const [fromProperty, setFromProperty] = useState(primeiraFazenda);
  const [fromPasture, setFromPasture] = useState("");
  const [toCategory, setToCategory] = useState("");
  const [toProperty, setToProperty] = useState(primeiraFazenda);
  const [toPasture, setToPasture] = useState("");

  const shape = useMemo(() => TYPES.find((t) => t.id === type)?.shape ?? null, [type]);
  const precisaOrigem = shape === "saida" || shape === "transferencia" || (shape === "ajuste" && ajusteDirection === "diminuir");
  const precisaDestino = shape === "entrada" || shape === "transferencia" || (shape === "ajuste" && ajusteDirection === "aumentar");

  const pastosDaOrigem = pastures.filter((p) => p.property_id === fromProperty);
  const pastosDoDestino = pastures.filter((p) => p.property_id === toProperty);

  function reset() {
    setType("");
    setQuantity("1");
    setValue("");
    setOccurredAt(hoje());
    setReason("");
    setNotes("");
    setAjusteDirection("aumentar");
    setFromCategory("");
    setFromPasture("");
    setToCategory("");
    setToPasture("");
    err.limparTudo();
  }

  function posicao(category: string, property: string, pasture: string) {
    return {
      category_id: category,
      property_id: property,
      pasture_id: pasture || null,
      situation: "presente" as const,
      owner: "proprio" as const,
    };
  }

  async function submit() {
    const qtd = lerValorDoCampo(quantity) ?? 0;
    const novos: Erros = {};

    // Uma mensagem por campo. Antes eram quatro frases juntas ("Informe a
    // categoria e a fazenda de origem"), e o produtor tinha que descobrir
    // qual das duas faltava.
    if (!type) novos.movement_type = "Escolha o que aconteceu.";
    if (!Number.isInteger(qtd) || qtd <= 0) {
      novos.quantity = "Informe uma quantidade inteira maior que zero.";
    }
    if (precisaOrigem) {
      if (!fromCategory) novos.from_category_id = "Escolha a categoria de origem.";
      if (!fromProperty) novos.from_property_id = "Escolha a fazenda de origem.";
    }
    if (precisaDestino) {
      if (!toCategory) novos.to_category_id = "Escolha a categoria de destino.";
      if (!toProperty) novos.to_property_id = "Escolha a fazenda de destino.";
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/herd/movements", {
      movement_type: type,
      quantity: qtd,
      from: precisaOrigem ? posicao(fromCategory, fromProperty, fromPasture) : null,
      to: precisaDestino ? posicao(toCategory, toProperty, toPasture) : null,
      value: WITH_VALUE.has(type) ? lerValorDoCampo(value) : null,
      reason: reason.trim() || null,
      notes: notes.trim() || null,
      occurred_at: occurredAt ? new Date(`${occurredAt}T12:00:00`).toISOString() : null,
    });
    setLoading(false);

    if (!res.ok) {
      // O caso que motivou o `field` no envelope: saldo insuficiente é erro
      // de QUANTIDADE, e aparecia no rodapé.
      err.doServidor(res);
      return;
    }

    setOpen(false);
    reset();
    router.refresh();
  }

  const blocoPosicao = (
    prefixo: "from" | "to",
    titulo: string,
    category: string,
    setCategory: (v: string) => void,
    property: string,
    setProperty: (v: string) => void,
    pasture: string,
    setPasture: (v: string) => void,
    pastosDisponiveis: Pasture[],
  ) => (
    <div className="space-y-3 rounded-md border border-borda p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-texto-discreto">{titulo}</p>

      <Field
        label="Categoria"
        required
        id={`${prefixo}_category_id`}
        error={err.erros[`${prefixo}_category_id` as Campo]}
      >
        {({ id, ...aria }) => (
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v);
              err.limparCampo(`${prefixo}_category_id` as Campo);
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
        label="Fazenda"
        required
        id={`${prefixo}_property_id`}
        error={err.erros[`${prefixo}_property_id` as Campo]}
      >
        {({ id, ...aria }) => (
          <Select
            value={property}
            onValueChange={(v) => {
              setProperty(v);
              setPasture("");
              err.limparCampo(`${prefixo}_property_id` as Campo);
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

      {pastosDisponiveis.length > 0 && (
        <Field
          label="Pasto"
          hint="Opcional."
          id={`${prefixo}_pasture_id`}
          error={err.erros[`${prefixo}_pasture_id` as Campo]}
        >
          {({ id, ...aria }) => (
            <Select value={pasture} onValueChange={setPasture}>
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem pasto informado" />
              </SelectTrigger>
              <SelectContent>
                {pastosDisponiveis.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}
    </div>
  );

  return (
    <FormSheet
      trigger={<Button>Registrar movimentação</Button>}
      title="Registrar movimentação"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      onSubmit={submit}
      submitLabel="Registrar"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="O que aconteceu" required id="movement_type" error={err.erros.movement_type}>
        {({ id, ...aria }) => (
          <Select value={type} onValueChange={(v) => { setType(v); err.limparCampo("movement_type"); }}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o tipo" />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.group}: {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {shape === "ajuste" && (
        <Field label="O ajuste" id="ajuste_direction">
          {({ id, ...aria }) => (
            <Select
              value={ajusteDirection}
              onValueChange={(v) => setAjusteDirection(v as "aumentar" | "diminuir")}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aumentar">Aumenta o saldo</SelectItem>
                <SelectItem value="diminuir">Diminui o saldo</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field label="Quantidade de cabeças" required id="quantity" error={err.erros.quantity}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="cabeças"
            value={quantity}
            onValueChange={(v) => { setQuantity(v); err.limparCampo("quantity"); }}
          />
        )}
      </Field>

      {precisaOrigem &&
        blocoPosicao(
          "from",
          shape === "transferencia" ? "De onde sai" : "De onde",
          fromCategory,
          setFromCategory,
          fromProperty,
          setFromProperty,
          fromPasture,
          setFromPasture,
          pastosDaOrigem,
        )}

      {precisaDestino &&
        blocoPosicao(
          "to",
          shape === "transferencia" ? "Para onde vai" : "Onde entra",
          toCategory,
          setToCategory,
          toProperty,
          setToProperty,
          toPasture,
          setToPasture,
          pastosDoDestino,
        )}

      {type && WITH_VALUE.has(type) && (
        <Field
          label="Valor total em R$"
          hint="Opcional. Gera lançamento no Financeiro."
          id="value"
          error={err.erros.value}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              value={value}
              onValueChange={(v) => { setValue(v); err.limparCampo("value"); }}
            />
          )}
        </Field>
      )}

      <Field label="Data" id="occurred_at" error={err.erros.occurred_at}>
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

      <Field label="Motivo" hint="Opcional." id="reason" error={err.erros.reason}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: contagem física"
          />
        )}
      </Field>

      <Field label="Observação" hint="Opcional." id="notes" error={err.erros.notes}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
    </FormSheet>
  );
}
