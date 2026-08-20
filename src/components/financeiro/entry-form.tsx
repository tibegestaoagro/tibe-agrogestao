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
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { FINANCIAL_CATEGORIES, suggestCategory } from "@/lib/category-suggestions";

type Erros = Partial<Record<"entryType" | "category" | "amount" | "dueDate", string>>;

export default function EntryForm() {
  const router = useRouter();
  const aviso = useAviso();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erros, setErros] = useState<Erros>({});

  const [entryType, setEntryType] = useState<"income" | "expense" | "">("");
  const [category, setCategory] = useState("");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const suggested = useMemo(() => (notes ? suggestCategory(notes) : null), [notes]);

  function handleNotesChange(value: string) {
    setNotes(value);
    // Pré-preenche a categoria com a sugestão, mas nunca sobrescreve uma escolha manual.
    if (!categoryTouched) {
      const s = suggestCategory(value);
      setCategory(value ? s : "");
    }
  }

  function limpar() {
    setEntryType("");
    setCategory("");
    setCategoryTouched(false);
    setAmount("");
    setDueDate("");
    setNotes("");
    setErros({});
    setError(null);
  }

  async function submit() {
    const valor = lerValorDoCampo(amount);
    const novos: Erros = {};
    if (!entryType) novos.entryType = "Escolha se é receita ou despesa.";
    if (!category) novos.category = "Escolha uma categoria.";
    if (valor === null) novos.amount = "Informe o valor.";
    else if (valor <= 0) novos.amount = "O valor precisa ser maior que zero.";
    if (!dueDate) novos.dueDate = "Informe a data de vencimento.";

    setErros(novos);
    if (Object.keys(novos).length > 0) return;

    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/financial-entries", {
      entry_type: entryType,
      category,
      amount: valor,
      due_date: new Date(dueDate).toISOString(),
      notes: notes || null,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);

    limpar();
    setOpen(false);
    aviso.sucesso(entryType === "income" ? "Receita cadastrada." : "Despesa cadastrada.");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Novo lançamento</Button>}
      title="Novo lançamento"
      description="Uma conta a pagar ou a receber. O valor entra no fluxo de caixa quando for pago."
      open={open}
      onOpenChange={(aberto) => {
        setOpen(aberto);
        if (!aberto) limpar();
      }}
      onSubmit={submit}
      submitLabel="Cadastrar"
      pending={loading}
      error={error}
    >
      <Field label="Tipo" required error={erros.entryType}>
        {({ id, ...aria }) => (
          <Select
            value={entryType}
            onValueChange={(v) => setEntryType(v as "income" | "expense")}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="income">Receita</SelectItem>
              <SelectItem value="expense">Despesa</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Observações"
        hint="O que você escrever aqui sugere a categoria sozinho."
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="Ex: combustível do trator"
          />
        )}
      </Field>

      <Field
        label="Categoria"
        required
        error={erros.category}
        hint={
          suggested && !categoryTouched ? `Sugestão automática: ${suggested}` : undefined
        }
      >
        {({ id, ...aria }) => (
          <Select
            value={category}
            onValueChange={(v) => {
              setCategory(v);
              setCategoryTouched(true);
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {FINANCIAL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Valor" required error={erros.amount}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={amount}
            onValueChange={setAmount}
            placeholder="0,00"
          />
        )}
      </Field>

      <Field label="Data de vencimento" required error={erros.dueDate}>
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
    </FormSheet>
  );
}
