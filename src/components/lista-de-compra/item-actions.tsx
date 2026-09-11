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
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPatch, apiDelete, apiPost } from "@/lib/client-api";
import type { Opcao, UnidadeOpcao } from "./item-form";

/**
 * Os três atalhos do §20 em cada linha pendente: concluir, remover e registrar
 * a compra.
 *
 * ⚠️ **"Comprei" e "registrar compra" são coisas diferentes**, e o §11 pede as
 * duas: "apenas concluir" tira da lista sem gerar nada, e "registrar compra"
 * cria despesa, conta a pagar e entrada de estoque por Negociações. Quem
 * comprou sem querer registrar continua podendo riscar da lista, que é o que o
 * papel fazia.
 */

const ORDEM = ["amount", "quantity", "product_id", "property_id", "unit", "category_id"] as const;
type Campo = (typeof ORDEM)[number];

const NOVO = "__novo__";

export default function ItemActions({
  item,
  fazendas,
  produtos,
  categorias,
  unidades,
}: {
  item: {
    id: string;
    description: string;
    product_id: string | null;
    quantity: number | null;
    unit: string | null;
    property_id: string | null;
  };
  fazendas: Opcao[];
  produtos: Opcao[];
  categorias: Opcao[];
  unidades: UnidadeOpcao[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  // Cada linha renderiza o próprio painel, então o prefixo é obrigatório:
  // sem ele todos os campos `amount` da página teriam o mesmo id.
  const err = useErrosDeFormulario(ORDEM, `compra-${item.id}`);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [amount, setAmount] = useState("");
  const [quantity, setQuantity] = useState(item.quantity != null ? String(item.quantity) : "");
  const [productId, setProductId] = useState(item.product_id ?? "");
  const [propertyId, setPropertyId] = useState(item.property_id ?? "");
  const [pago, setPago] = useState(true);
  const [unit, setUnit] = useState(item.unit ?? "");
  const [categoryId, setCategoryId] = useState("");

  const precisaCadastrarProduto = productId === NOVO;

  async function concluir() {
    setLoading(true);
    const res = await apiPatch(`/api/v1/shopping-items/${item.id}`, { acao: "concluir" });
    setLoading(false);
    if (res.ok) {
      aviso.sucesso("Riscado da lista.");
      router.refresh();
    } else aviso.erro(res.message);
  }

  async function remover() {
    setLoading(true);
    const res = await apiDelete(`/api/v1/shopping-items/${item.id}`);
    setLoading(false);
    if (res.ok) {
      aviso.sucesso("Item removido.");
      router.refresh();
    } else aviso.erro(res.message);
  }

  async function registrarCompra() {
    const valor = lerValorDoCampo(amount);
    const novos: Partial<Record<Campo, string>> = {};
    if (valor === null) novos.amount = "Informe quanto você pagou.";
    else if (valor <= 0) novos.amount = "O valor precisa ser maior que zero.";

    const quantidade = quantity.trim().replace(",", ".");
    const numero = quantidade === "" ? null : Number(quantidade);
    if (numero === null || !Number.isFinite(numero) || numero <= 0) {
      novos.quantity = "Quanto você comprou?";
    }
    if (!propertyId) novos.property_id = "Para qual fazenda foi a compra?";
    if (!productId) novos.product_id = "Escolha o produto, ou cadastre este.";
    if (precisaCadastrarProduto) {
      if (!unit) novos.unit = "Escolha a unidade do produto.";
      if (!categoryId) novos.category_id = "Escolha a categoria do produto.";
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    setLoading(true);
    const res = await apiPost(`/api/v1/shopping-items/${item.id}/purchase`, {
      amount: valor,
      quantity: numero,
      property_id: propertyId,
      product_id: precisaCadastrarProduto ? null : productId,
      novo_produto: precisaCadastrarProduto ? { unit, category_id: categoryId } : null,
      pago,
    });
    setLoading(false);
    if (!res.ok) return err.doServidor(res);

    aviso.sucesso("Compra registrada e item riscado da lista.");
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="ghost" size="sm" onClick={concluir} disabled={loading}>
        Comprei
      </Button>

      <FormSheet
        trigger={
          <Button variant="outline" size="sm">
            Registrar compra
          </Button>
        }
        title="Registrar a compra"
        description="Isto cria a despesa e dá entrada no estoque. Para só riscar da lista, use Comprei."
        open={open}
        onOpenChange={(aberto) => {
          setOpen(aberto);
          if (!aberto) err.limparTudo();
        }}
        onSubmit={registrarCompra}
        submitLabel="Registrar"
        pending={loading}
        error={err.global}
        focarCampoId={err.focarCampoId}
        tentativa={err.tentativa}
      >
        <p className="rounded-lg border border-borda bg-superficie-afundada p-3 text-sm text-texto-secundario">
          {item.description}
        </p>

        <Field label="Quanto pagou" required id={err.idDe("amount")} error={err.erros.amount}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              value={amount}
              onValueChange={(v) => {
                setAmount(v);
                err.limparCampo("amount");
              }}
              placeholder="0,00"
            />
          )}
        </Field>

        <Field label="Quantidade" required id={err.idDe("quantity")} error={err.erros.quantity}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              inputMode="decimal"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                err.limparCampo("quantity");
              }}
              placeholder="10"
            />
          )}
        </Field>

        {/*
          O item pode ter nascido sem produto ("comprar arame"), e a compra
          precisa de um: é o produto que tem saldo e unidade. Por isso o
          seletor oferece cadastrar na hora.
        */}
        <Field label="Produto" required id={err.idDe("product_id")} error={err.erros.product_id}>
          {({ id, ...aria }) => (
            <Select
              value={productId}
              onValueChange={(v) => {
                setProductId(v);
                err.limparCampo("product_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Escolha o produto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOVO}>Cadastrar &quot;{item.description}&quot;</SelectItem>
                {produtos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        {precisaCadastrarProduto && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unidade" required id={err.idDe("unit")} error={err.erros.unit}>
              {({ id, ...aria }) => (
                <Select
                  value={unit}
                  onValueChange={(v) => {
                    setUnit(v);
                    err.limparCampo("unit");
                  }}
                >
                  <SelectTrigger id={id} {...aria}>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {unidades.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label="Categoria" required id={err.idDe("category_id")} error={err.erros.category_id}>
              {({ id, ...aria }) => (
                <Select
                  value={categoryId}
                  onValueChange={(v) => {
                    setCategoryId(v);
                    err.limparCampo("category_id");
                  }}
                >
                  <SelectTrigger id={id} {...aria}>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>
        )}

        <Field label="Fazenda" required id={err.idDe("property_id")} error={err.erros.property_id}>
          {({ id, ...aria }) => (
            <Select
              value={propertyId}
              onValueChange={(v) => {
                setPropertyId(v);
                err.limparCampo("property_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Escolha a fazenda" />
              </SelectTrigger>
              <SelectContent>
                {fazendas.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <label className="flex items-center gap-2 text-sm text-texto">
          <input
            type="checkbox"
            checked={pago}
            onChange={(e) => setPago(e.target.checked)}
            className="size-4 rounded border-borda-forte"
          />
          Já paguei
        </label>
      </FormSheet>

      <Button variant="ghost" size="sm" onClick={remover} disabled={loading}>
        Tirar
      </Button>
    </div>
  );
}
