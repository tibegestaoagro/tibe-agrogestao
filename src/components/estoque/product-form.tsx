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
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";
import { STOCK_UNITS } from "@/lib/stock/units";
import { lerNumeroBr } from "@/lib/numero-br";

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

/** Os campos na ordem visual, com o nome que a API usa. */
const ORDEM = [
  "name",
  "category_id",
  "unit",
  "minimum_stock",
  "brand",
  "storage_location",
] as const;
type Campo = (typeof ORDEM)[number];

export default function ProductForm({ categories }: { categories: Categoria[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

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
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!name.trim()) novos.name = "Informe o nome do produto.";
    if (!categoryId) novos.category_id = "Escolha a categoria.";
    if (!unit) novos.unit = "Escolha a unidade de medida.";

    // Mesmo leitor da quantidade: um mínimo de "1.500" lido como 1,5 mudaria
    // quando o aviso de reposição dispara, em mil vezes.
    const minimoNumero = minimo.trim() ? lerNumeroBr(minimo) : null;
    if (minimo.trim() && minimoNumero == null) {
      novos.minimum_stock = "Não entendi o estoque mínimo.";
    } else if (minimoNumero != null && minimoNumero < 0) {
      novos.minimum_stock = "O estoque mínimo não pode ser negativo.";
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
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
      trigger={<Button>Cadastrar produto</Button>}
      title="Cadastrar produto"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
      onSubmit={submit}
      submitLabel="Salvar produto"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome do produto" required id="name" error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              err.limparCampo("name");
            }}
            placeholder="Sal mineral 60 P"
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
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {/*
        A dica da unidade fica no `hint` do campo: dizer a regra ANTES é o que
        evita o produtor descobri-la por uma recusa do servidor depois de
        preencher tudo. `label` é capitalizado porque nomeia a opção da lista;
        no meio de uma frase ele volta a ser minúsculo, senão sai "meia Saca
        não existe".
      */}
      <Field
        label="Unidade de medida"
        required
        id="unit"
        error={err.erros.unit}
        hint={
          unidadeEscolhida
            ? unidadeEscolhida.fracionavel
              ? `Aceita quantidade quebrada: 0,5 ${unidadeEscolhida.plural} pode.`
              : `Só quantidade inteira: meia ${unidadeEscolhida.label.toLowerCase()} não existe.`
            : undefined
        }
      >
        {({ id, ...aria }) => (
          <Select
            value={unit}
            onValueChange={(v) => {
              setUnit(v);
              err.limparCampo("unit");
            }}
          >
            <SelectTrigger id={id} {...aria}>
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
        )}
      </Field>

      <Field
        label="Estoque mínimo (opcional)"
        hint="Você recebe um aviso quando o saldo chegar nesse número."
        id="minimum_stock"
        error={err.erros.minimum_stock}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            inputMode="decimal"
            value={minimo}
            onChange={(e) => {
              setMinimo(e.target.value);
              err.limparCampo("minimum_stock");
            }}
            placeholder="Deixe vazio para não receber aviso"
          />
        )}
      </Field>

      <Field label="Marca (opcional)" id="brand" error={err.erros.brand}>
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={brand} onChange={(e) => setBrand(e.target.value)} />
        )}
      </Field>

      <Field
        label="Onde fica guardado (opcional)"
        id="storage_location"
        error={err.erros.storage_location}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            placeholder="Galpão, depósito, curral"
          />
        )}
      </Field>
    </FormSheet>
  );
}
