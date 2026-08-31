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
import { apiPost, apiPatch } from "@/lib/client-api";

type Pricing = "hour" | "day" | "fixed";
type Service = { id: string; name: string; pricing_type: Pricing; unit_price: number | null };

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = ["name", "pricing_type", "unit_price"] as const;
type Campo = (typeof ORDEM)[number];

export default function ServiceForm({ service }: { service?: Service }) {
  const router = useRouter();
  const editing = !!service;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  /**
   * `prefixoDeId` porque a lista de serviços renderiza um destes por linha (o
   * botão "Editar"), mais o de criar no topo. Sem ele todos teriam
   * `id="name"`, e o foco do erro cairia sempre no primeiro.
   */
  const err = useErrosDeFormulario(ORDEM, service?.id ?? "servico-novo");
  const [name, setName] = useState(service?.name ?? "");
  const [pricing, setPricing] = useState<Pricing | "">(service?.pricing_type ?? "");
  const [price, setPrice] = useState(service?.unit_price != null ? String(service.unit_price) : "");

  async function submit() {
    // Antes os três dividiam UMA frase ("Preencha nome, tipo e valor"), e quem
    // tinha esquecido só o valor lia a cobrança dos três.
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome do serviço.";
    if (!pricing) novos.pricing_type = "Escolha como este serviço é cobrado.";
    if (!price.trim()) novos.unit_price = "Informe o valor.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const payload = {
      name: name.trim(),
      pricing_type: pricing,
      unit_price: lerValorDoCampo(price),
    };
    const res = editing
      ? await apiPatch(`/api/v1/services/${service!.id}`, payload)
      : await apiPost("/api/v1/services", payload);
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    if (!editing) {
      setName("");
      setPricing("");
      setPrice("");
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        editing ? (
          <Button variant="ghost" size="sm">
            Editar
          </Button>
        ) : (
          <Button>Novo serviço</Button>
        )
      }
      title={editing ? "Editar serviço" : "Novo serviço"}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={editing ? "Salvar" : "Cadastrar"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome" required id={err.idDe("name")} error={err.erros.name}>
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

      <Field
        label="Precificação"
        required
        id={err.idDe("pricing_type")}
        error={err.erros.pricing_type}
      >
        {({ id, ...aria }) => (
          <Select
            value={pricing}
            onValueChange={(v) => {
              setPricing(v as Pricing);
              err.limparCampo("pricing_type");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hour">Por hora</SelectItem>
              <SelectItem value="day">Por dia</SelectItem>
              <SelectItem value="fixed">Valor fixo</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Valor unitário (R$)"
        required
        id={err.idDe("unit_price")}
        error={err.erros.unit_price}
        hint={editing ? "Alterar o valor não afeta ordens já registradas, apenas novas." : undefined}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={price}
            onValueChange={(v) => {
              setPrice(v);
              err.limparCampo("unit_price");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
