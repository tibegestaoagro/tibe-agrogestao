"use client";

import { useState } from "react";
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
import { STOCK_UNITS } from "@/lib/stock/units";

/**
 * Cadastro de produto (§9.1).
 *
 * Importa `@/lib/stock/units`, que é módulo puro. Nunca uma action: isso
 * arrastaria Prisma para o bundle do navegador.
 *
 * Só nome, categoria e unidade são obrigatórios. Marca, estoque mínimo, local
 * de armazenamento e observações são os campos que o §9.1 lista como
 * opcionais, e continuam opcionais aqui: quem cadastra um produto no meio do
 * serviço não tem esses dados na mão.
 */

type Categoria = { id: string; name: string };

export default function ProductForm({ categories }: { categories: Categoria[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("");
  const [brand, setBrand] = useState("");
  const [minimo, setMinimo] = useState("");
  const [local, setLocal] = useState("");

  const unidadeEscolhida = STOCK_UNITS.find((u) => u.id === unit);

  function reset() {
    setName("");
    setCategoryId("");
    setUnit("");
    setBrand("");
    setMinimo("");
    setLocal("");
    setError(null);
  }

  async function submit() {
    setError(null);
    if (!name.trim()) return setError("Informe o nome do produto.");
    if (!categoryId) return setError("Escolha a categoria.");
    if (!unit) return setError("Escolha a unidade de medida.");

    const minimoNumero = minimo.trim() ? Number(minimo.replace(",", ".")) : null;
    if (minimoNumero != null && (!Number.isFinite(minimoNumero) || minimoNumero < 0)) {
      return setError("O estoque mínimo não pode ser negativo.");
    }

    setLoading(true);
    const res = await apiPost("/api/v1/products", {
      name: name.trim(),
      category_id: categoryId,
      unit,
      brand: brand.trim() || null,
      minimum_stock: minimoNumero,
      storage_location: local.trim() || null,
    });
    setLoading(false);

    if (!res.ok) return setError(res.message);
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>Cadastrar produto</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Cadastrar produto</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div>
            <Label htmlFor="produto-nome">Nome do produto</Label>
            <Input
              id="produto-nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sal mineral 60 P"
            />
          </div>

          <div>
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Unidade de medida</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Como você conta este produto?" />
              </SelectTrigger>
              <SelectContent>
                {STOCK_UNITS.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/*
              Dizer isso ANTES é o que evita o produtor descobrir a regra por
              uma recusa do servidor depois de preencher tudo.
            */}
            {unidadeEscolhida && (
              <p className="mt-1 text-xs text-gray-500">
                {/*
                  `label` é capitalizado porque nomeia a opção da lista. No meio
                  de uma frase ele precisa voltar a ser minúsculo, senão sai
                  "meia Saca não existe".
                */}
                {unidadeEscolhida.fracionavel
                  ? `Aceita quantidade quebrada: 0,5 ${unidadeEscolhida.plural} pode.`
                  : `Só quantidade inteira: meia ${unidadeEscolhida.label.toLowerCase()} não existe.`}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="produto-minimo">Estoque mínimo (opcional)</Label>
            <Input
              id="produto-minimo"
              inputMode="decimal"
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
              placeholder="Deixe vazio para não receber aviso"
            />
            <p className="mt-1 text-xs text-gray-500">
              Você recebe um aviso quando o saldo chegar nesse número.
            </p>
          </div>

          <div>
            <Label htmlFor="produto-marca">Marca (opcional)</Label>
            <Input id="produto-marca" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>

          <div>
            <Label htmlFor="produto-local">Onde fica guardado (opcional)</Label>
            <Input
              id="produto-local"
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              placeholder="Galpão, depósito, curral"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Salvar produto"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
