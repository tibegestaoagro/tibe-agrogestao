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
import { CATEGORIAS_DE_CUSTO_DO_LOTE } from "./labels";

/**
 * Custo avulso do lote (§13, §14; dívida 2.8): a ração comprada, o remédio, o
 * frete. Vira despesa no Financeiro já ligada ao lote, e é isso que a faz
 * entrar no "Custo acumulado". Nasce no lote, e não num campo do Financeiro,
 * por decisão do usuário em 14/09/2026.
 */

const ORDEM = ["category", "amount", "due_date"] as const;
type Campo = (typeof ORDEM)[number];

export default function LotCostForm({ stayId }: { stayId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Um painel por lote na mesma tabela: sem prefixo, todos dividiriam id="amount".
  const err = useErrosDeFormulario(ORDEM, `custo-${stayId}`);

  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [pago, setPago] = useState(false);
  const [vencimento, setVencimento] = useState("");

  function limpar() {
    setCategory("");
    setAmount("");
    setPago(false);
    setVencimento("");
    err.limparTudo();
  }

  async function submit() {
    const valor = lerValorDoCampo(amount);
    const novos: Partial<Record<Campo, string>> = {};
    if (!category) novos.category = "Escolha o tipo de custo.";
    if (valor == null || valor <= 0) novos.amount = "Informe o valor do custo.";
    if (!pago && !vencimento) novos.due_date = "Informe quando vai pagar.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/confinement/stays/${stayId}/costs`, {
      category,
      amount: valor,
      pago,
      due_date: !pago && vencimento ? new Date(`${vencimento}T12:00:00`).toISOString() : null,
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
          Registrar custo
        </Button>
      }
      title="Registrar custo do lote"
      description="Entra no custo acumulado deste lote e vira uma despesa no Financeiro."
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
      <Field label="Tipo de custo" required id={err.idDe("category")} error={err.erros.category}>
        {({ id, ...aria }) => (
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v);
              err.limparCampo("category");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o tipo" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIAS_DE_CUSTO_DO_LOTE.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Valor" required id={err.idDe("amount")} error={err.erros.amount}>
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

      <div className="space-y-1">
        <p className="text-sm font-medium text-texto">Você já pagou?</p>
        <div className="flex gap-2">
          {(
            [
              [false, "Vou pagar"],
              [true, "Paguei"],
            ] as const
          ).map(([valor, rotulo]) => (
            <Button
              key={String(valor)}
              type="button"
              variant={pago === valor ? "default" : "outline"}
              onClick={() => {
                setPago(valor);
                if (valor) {
                  setVencimento("");
                  err.limparCampo("due_date");
                }
              }}
            >
              {rotulo}
            </Button>
          ))}
        </div>
      </div>

      {!pago && (
        <Field label="Vencimento" required id={err.idDe("due_date")} error={err.erros.due_date}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="date"
              value={vencimento}
              onChange={(e) => {
                setVencimento(e.target.value);
                err.limparCampo("due_date");
              }}
            />
          )}
        </Field>
      )}
    </FormSheet>
  );
}
