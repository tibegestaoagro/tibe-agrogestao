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
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";
import { HERD_CATEGORIES } from "@/lib/herd/categories";

/**
 * Abrir uma estadia (Módulo 30, fase 2).
 *
 * Um formulário para os cinco tipos, e não cinco formulários: o que muda entre
 * eles é quais campos aparecem, não o fluxo. O produtor escolhe o que
 * aconteceu e a tela mostra só o que aquilo precisa.
 *
 * Importa `@/lib/herd/categories` (módulo puro) e NUNCA a action: esta é a
 * mesma armadilha de bundle já documentada no `movement-form`.
 */

type Property = { id: string; name: string };
type Pasture = { id: string; name: string; property_id: string };

const TIPOS = [
  {
    id: "pasto_terceiro",
    label: "Enviar para pasto de terceiro",
    contraparte: "Dono do pasto",
    ajuda: "As cabeças continuam suas, mas saem da contagem da fazenda até voltarem.",
  },
  {
    id: "boitel",
    label: "Enviar para boitel",
    contraparte: "Nome do boitel",
    ajuda: "Confinamento de terceiro: o animal continua seu, sob manejo de outra empresa.",
  },
  {
    id: "terceiro_na_fazenda",
    label: "Receber animais de terceiro",
    contraparte: "Dono dos animais",
    ajuda: "Eles ocupam o pasto e entram na conta de quem você trata, mas não no seu rebanho.",
  },
  {
    id: "desaparecimento",
    label: "Registrar desaparecimento",
    contraparte: null,
    ajuda: "O animal continua seu até a perda ser confirmada, e some da contagem do pasto.",
  },
] as const;

type Tipo = (typeof TIPOS)[number]["id"];

const COBRANCAS = [
  { id: "por_cabeca", label: "Por cabeça" },
  { id: "por_mes", label: "Por mês" },
  { id: "por_periodo", label: "Por período" },
  { id: "fechado", label: "Valor fechado" },
] as const;

const ORDEM = [
  "type",
  "quantity",
  "category_id",
  "property_id",
  "pasture_id",
  "counterparty_name",
  "location_name",
  "started_at",
  "expected_end_at",
  "charge_type",
  "charge_value",
  "reason",
] as const;
type Campo = (typeof ORDEM)[number];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function StayForm({
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

  const [type, setType] = useState<Tipo | "">("");
  const [quantity, setQuantity] = useState("1");
  const [categoryId, setCategoryId] = useState("");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? properties[0]?.id ?? "");
  const [pastureId, setPastureId] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [locationName, setLocationName] = useState("");
  const [startedAt, setStartedAt] = useState(hoje());
  const [expectedEnd, setExpectedEnd] = useState("");
  const [chargeType, setChargeType] = useState("");
  const [chargeValue, setChargeValue] = useState("");
  const [reason, setReason] = useState("");

  const escolhido = useMemo(() => TIPOS.find((t) => t.id === type) ?? null, [type]);
  const pastosDaFazenda = pastures.filter((p) => p.property_id === propertyId);
  const temCobranca = type !== "" && type !== "desaparecimento";
  const ehSumico = type === "desaparecimento";

  function limpar() {
    setType("");
    setQuantity("1");
    setCategoryId("");
    setPastureId("");
    setCounterparty("");
    setLocationName("");
    setStartedAt(hoje());
    setExpectedEnd("");
    setChargeType("");
    setChargeValue("");
    setReason("");
    err.limparTudo();
  }

  async function submit() {
    const qtd = lerValorDoCampo(quantity) ?? 0;
    const novos: Partial<Record<Campo, string>> = {};
    if (!type) novos.type = "Escolha o que aconteceu.";
    if (!Number.isInteger(qtd) || qtd <= 0) {
      novos.quantity = "Informe uma quantidade inteira maior que zero.";
    }
    if (!categoryId) novos.category_id = "Escolha a categoria.";
    if (!propertyId) novos.property_id = "Escolha a fazenda.";
    if (escolhido?.contraparte && !counterparty.trim()) {
      novos.counterparty_name = `Informe o ${escolhido.contraparte.toLowerCase()}.`;
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/herd/stays", {
      type,
      property_id: propertyId,
      category_id: categoryId,
      quantity: qtd,
      pasture_id: pastureId || null,
      counterparty_name: counterparty.trim() || null,
      location_name: locationName.trim() || null,
      started_at: startedAt ? new Date(`${startedAt}T12:00:00`).toISOString() : null,
      expected_end_at: expectedEnd ? new Date(`${expectedEnd}T12:00:00`).toISOString() : null,
      charge_type: temCobranca && chargeType ? chargeType : null,
      charge_value: temCobranca ? lerValorDoCampo(chargeValue) : null,
      reason: reason.trim() || null,
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
      trigger={<Button variant="outline">Estadia ou desaparecimento</Button>}
      title="Registrar estadia"
      description="Quando as cabeças saem da fazenda sem sair do rebanho, ou quando chegam animais que não são seus."
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
      <Field label="O que aconteceu" required id="type" error={err.erros.type} hint={escolhido?.ajuda}>
        {({ id, ...aria }) => (
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as Tipo);
              err.limparCampo("type");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
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

      {pastosDaFazenda.length > 0 && (
        <Field
          label="Pasto"
          hint={
            type === "terceiro_na_fazenda"
              ? "Onde eles vão ficar."
              : "De onde as cabeças saem. Opcional."
          }
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

      {escolhido?.contraparte && (
        <Field
          label={escolhido.contraparte}
          required
          id="counterparty_name"
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
              placeholder="Ex: Sítio do João"
            />
          )}
        </Field>
      )}

      {escolhido && !ehSumico && (
        <Field label="Local" hint="Nome ou identificação do lugar. Opcional." id="location_name" error={err.erros.location_name}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
            />
          )}
        </Field>
      )}

      <Field
        label={ehSumico ? "Data em que percebeu" : "Data de saída"}
        id="started_at"
        error={err.erros.started_at}
      >
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

      {escolhido && !ehSumico && (
        <Field label="Retorno previsto" hint="Opcional." id="expected_end_at" error={err.erros.expected_end_at}>
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
      )}

      {temCobranca && (
        <>
          <Field label="Forma de cobrança" hint="Opcional." id="charge_type" error={err.erros.charge_type}>
            {({ id, ...aria }) => (
              <Select value={chargeType} onValueChange={setChargeType}>
                <SelectTrigger id={id} {...aria}>
                  <SelectValue placeholder="Sem cobrança combinada" />
                </SelectTrigger>
                <SelectContent>
                  {COBRANCAS.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <Field
            label="Valor combinado em R$"
            hint="Opcional. Gera a conta no Financeiro com este valor exato."
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
        </>
      )}

      {ehSumico && (
        <Field label="Motivo provável" hint="Opcional." id="reason" error={err.erros.reason}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: cerca arrebentada"
            />
          )}
        </Field>
      )}
    </FormSheet>
  );
}
