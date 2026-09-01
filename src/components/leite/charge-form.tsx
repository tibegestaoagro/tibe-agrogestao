"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MilkChargeType } from "@/generated/prisma/client";
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
import { COBRANCA_LEITE_LABEL, FORMAS_DE_COBRANCA } from "@/components/leite/storage-labels";

/**
 * A cobrança pelo serviço de ponto de coleta (§22).
 *
 * ⚠️ O valor é DIGITADO, nunca calculado, e a dica do campo diz isso ao
 * produtor. O §22 dá o exemplo de R$ 0,05 por litro sobre 5.000 litros, mas
 * não diz sobre qual período somar esses litros: isso só aparece no §28, que é
 * a fase 3. Calcular exigiria inventar o período, e é a mesma decisão que a
 * cobrança do confinamento já tomou.
 */

type Owner = { id: string; name: string };
type Site = { id: string; name: string };

const ORDEM = ["owner_id", "type", "amount", "period_label", "site_id", "occurred_at", "notes"] as const;
type Campo = (typeof ORDEM)[number];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function ChargeForm({ owners, sites }: { owners: Owner[]; sites: Site[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, "cobranca");

  const [ownerId, setOwnerId] = useState("");
  const [tipo, setTipo] = useState<MilkChargeType | "">("");
  const [amount, setAmount] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [siteId, setSiteId] = useState("");
  const [data, setData] = useState(hoje());
  const [notes, setNotes] = useState("");

  function limpar() {
    setOwnerId("");
    setTipo("");
    setAmount("");
    setPeriodo("");
    setSiteId("");
    setData(hoje());
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!ownerId) novos.owner_id = "Escolha o produtor.";
    if (!tipo) novos.type = "Escolha a forma de cobrança.";
    const valor = lerValorDoCampo(amount);
    if (valor === null || valor <= 0) novos.amount = "Informe o valor cobrado.";
    if (!data) novos.occurred_at = "Informe a data.";

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/milk/charges", {
      owner_id: ownerId,
      type: tipo,
      amount: valor,
      site_id: siteId || null,
      period_label: periodo.trim() || null,
      occurred_at: new Date(`${data}T12:00:00`).toISOString(),
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
      trigger={
        <Button variant="outline" size="sm">
          Cobrar pelo serviço
        </Button>
      }
      title="Cobrar pelo ponto de coleta"
      description="A receita entra no Financeiro assim que você registrar."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar cobrança"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="De quem" required id="cobranca-owner_id" error={err.erros.owner_id}>
        {({ id, ...aria }) => (
          <Select
            value={ownerId}
            onValueChange={(v) => {
              setOwnerId(v);
              err.limparCampo("owner_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o produtor" />
            </SelectTrigger>
            <SelectContent>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Forma de cobrança" required id="cobranca-type" error={err.erros.type}>
        {({ id, ...aria }) => (
          <Select
            value={tipo}
            onValueChange={(v) => {
              setTipo(v as MilkChargeType);
              err.limparCampo("type");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Como você cobra" />
            </SelectTrigger>
            <SelectContent>
              {FORMAS_DE_COBRANCA.map((t) => (
                <SelectItem key={t} value={t}>
                  {COBRANCA_LEITE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Valor cobrado"
        required
        id="cobranca-amount"
        error={err.erros.amount}
        hint={
          tipo === "por_litro"
            ? "O TOTAL da cobrança, já calculado por você. O TIBÉ não multiplica: ele não sabe de qual período são os litros."
            : "O valor total da cobrança."
        }
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={amount}
            onValueChange={(v) => {
              setAmount(v);
              err.limparCampo("amount");
            }}
          />
        )}
      </Field>

      <Field
        label="Período"
        id="cobranca-period_label"
        error={err.erros.period_label}
        hint="Opcional. Exemplo: agosto/2026, ou coleta de 12/08."
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={periodo}
            onChange={(e) => {
              setPeriodo(e.target.value);
              err.limparCampo("period_label");
            }}
          />
        )}
      </Field>

      {sites.length > 0 && (
        <Field label="Local" id="cobranca-site_id" error={err.erros.site_id} hint="Opcional.">
          {({ id, ...aria }) => (
            <Select
              value={siteId}
              onValueChange={(v) => {
                setSiteId(v);
                err.limparCampo("site_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem local" />
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
      )}

      <Field label="Data" required id="cobranca-occurred_at" error={err.erros.occurred_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              err.limparCampo("occurred_at");
            }}
          />
        )}
      </Field>

      <Field label="Observação" id="cobranca-notes" error={err.erros.notes} hint="Opcional.">
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
