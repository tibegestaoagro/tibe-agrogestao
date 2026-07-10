"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/client-api";
import { FINANCIAL_CATEGORIES, suggestCategory } from "@/lib/category-suggestions";

export default function EntryForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function submit() {
    if (!entryType || !category || !amount || !dueDate) {
      setError("Preencha tipo, categoria, valor e data de vencimento.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/financial-entries", {
      entry_type: entryType,
      category,
      amount: Number(amount),
      due_date: new Date(dueDate).toISOString(),
      notes: notes || null,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setEntryType(""); setCategory(""); setCategoryTouched(false);
    setAmount(""); setDueDate(""); setNotes("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>Novo lançamento</Button>
      </SheetTrigger>
      <SheetContent title="Novo lançamento">
        <SheetHeader><SheetTitle>Novo lançamento</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo *</Label>
            <Select value={entryType} onValueChange={(v) => setEntryType(v as "income" | "expense")}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income">Receita</SelectItem>
                <SelectItem value="expense">Despesa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Ex: combustível do trator"
            />
          </div>

          <div>
            <Label>Categoria *</Label>
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v);
                setCategoryTouched(true);
              }}
            >
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {FINANCIAL_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {suggested && !categoryTouched && (
              <p className="mt-1 text-xs text-gray-500">Sugestão automática: {suggested}</p>
            )}
          </div>

          <div>
            <Label htmlFor="amount">Valor (R$) *</Label>
            <Input id="amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="due">Data de vencimento *</Label>
            <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Cadastrar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
