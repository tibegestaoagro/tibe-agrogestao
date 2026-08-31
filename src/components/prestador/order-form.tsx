"use client";

import { useState, useMemo } from "react";
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

type Client = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  pricing_type: "hour" | "day" | "fixed";
  unit_price: number | null;
};

const UNIT: Record<string, string> = { hour: "horas", day: "dias", fixed: "(fixo)" };

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = [
  "service_client_id",
  "service_id",
  "quantity",
  "performed_at",
  "description",
] as const;
type Campo = (typeof ORDEM)[number];

export default function OrderForm({
  clients,
  services,
}: {
  clients: Client[];
  services: Service[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  const service = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const isFixed = service?.pricing_type === "fixed";
  const total = service?.unit_price != null
    ? (isFixed ? 1 : (lerValorDoCampo(quantity) ?? 0)) * service.unit_price
    : null;

  function reset() {
    setClientId("");
    setServiceId("");
    setQuantity("1");
    setDate("");
    setDescription("");
    err.limparTudo();
  }

  async function submit() {
    // Antes os três dividiam UMA frase ("Selecione cliente, serviço e data"),
    // e quem tinha esquecido só a data lia a cobrança dos três.
    const novos: Partial<Record<Campo, string>> = {};
    if (!clientId) novos.service_client_id = "Escolha o cliente da ordem.";
    if (!serviceId) novos.service_id = "Escolha o serviço prestado.";
    if (!date) novos.performed_at = "Informe a data de execução.";
    // O campo de quantidade some quando o serviço é de valor fixo, então
    // cobrá-lo aqui mandaria o foco para um campo que não está na tela.
    if (!isFixed && serviceId && !quantity.trim()) {
      novos.quantity = "Informe a quantidade.";
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/service-orders", {
      service_client_id: clientId,
      service_id: serviceId,
      quantity: isFixed ? 1 : lerValorDoCampo(quantity),
      description: description.trim() || null,
      performed_at: new Date(date).toISOString(),
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
      trigger={<Button>Nova ordem</Button>}
      title="Nova ordem de serviço"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Registrar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label="Cliente"
        required
        id="service_client_id"
        error={err.erros.service_client_id}
      >
        {({ id, ...aria }) => (
          <Select
            value={clientId}
            onValueChange={(v) => {
              setClientId(v);
              err.limparCampo("service_client_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Serviço" required id="service_id" error={err.erros.service_id}>
        {({ id, ...aria }) => (
          <Select
            value={serviceId}
            onValueChange={(v) => {
              setServiceId(v);
              err.limparCampo("service_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}: {UNIT[s.pricing_type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {!isFixed && (
        <Field
          label={`Quantidade (${service ? UNIT[service.pricing_type] : "unidade"})`}
          required
          id="quantity"
          error={err.erros.quantity}
        >
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
      )}

      <Field
        label="Data de execução"
        required
        id="performed_at"
        error={err.erros.performed_at}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              err.limparCampo("performed_at");
            }}
          />
        )}
      </Field>

      <Field label="Descrição" id="description" error={err.erros.description}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        )}
      </Field>

      {total != null && (
        <p className="text-sm text-texto-secundario">
          Total:{" "}
          <span className="font-semibold text-texto">
            {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </span>
        </p>
      )}
    </FormSheet>
  );
}
