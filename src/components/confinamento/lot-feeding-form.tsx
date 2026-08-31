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
import { descreverQuantidade } from "@/lib/stock/units";

/**
 * Alimentação de um lote (§10, §11). Sem produto do estoque, o servidor
 * RECUSA (`PRODUCT_REQUIRED`, campo `product_id`): a tela não engole isso, e
 * a mensagem que aparece embaixo do campo é a que o servidor já manda pronta,
 * sem reescrita aqui.
 */

type Produto = {
  id: string;
  name: string;
  unit: string;
  saldo_por_fazenda: { property_id: string; quantity: number }[];
};

const ORDEM = ["product_id", "quantity", "occurred_at", "notes"] as const;
type Campo = (typeof ORDEM)[number];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function LotFeedingForm({
  stayId,
  propertyId,
  products,
}: {
  stayId: string;
  propertyId: string;
  products: Produto[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // Prefixo por lote: a tela abre um card de alimentação por lote ativo, e
  // sem prefixo todos dividiriam id="quantity" e o foco cairia sempre no
  // primeiro lote da lista, não no que reprovou.
  const err = useErrosDeFormulario(ORDEM, `alimentar-${stayId}`);

  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [occurredAt, setOccurredAt] = useState(hoje());
  const [notes, setNotes] = useState("");

  const produto = products.find((p) => p.id === productId);
  const saldo = produto?.saldo_por_fazenda.find((s) => s.property_id === propertyId)?.quantity ?? 0;

  function limpar() {
    setProductId("");
    setQuantity("");
    setOccurredAt(hoje());
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const qtd = lerValorDoCampo(quantity);
    const novos: Partial<Record<Campo, string>> = {};
    if (!productId) novos.product_id = "Escolha o produto.";
    if (qtd == null || qtd <= 0) novos.quantity = "Informe quanto foi usado.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/confinement/stays/${stayId}/feeding`, {
      product_id: productId,
      quantity: qtd,
      occurred_at: occurredAt ? new Date(`${occurredAt}T12:00:00`).toISOString() : null,
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
          Alimentar
        </Button>
      }
      title="Registrar alimentação"
      description="Reduz o estoque do produto escolhido, quando ele está cadastrado no estoque. Não soma no custo acumulado deste lote: nem produto nem estoque têm preço registrado."
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
      <Field
        label="Produto"
        required
        id={err.idDe("product_id")}
        error={err.erros.product_id}
        hint={products.length === 0 ? "Cadastre um produto no Estoque antes de alimentar." : undefined}
      >
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
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {produto && (
        <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
          Tem hoje nesta fazenda: <strong>{descreverQuantidade(saldo, produto.unit)}</strong>
        </p>
      )}

      <Field label="Quantidade usada" required id={err.idDe("quantity")} error={err.erros.quantity}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit={produto?.unit}
            value={quantity}
            onValueChange={(v) => {
              setQuantity(v);
              err.limparCampo("quantity");
            }}
          />
        )}
      </Field>

      <Field label="Data" id={err.idDe("occurred_at")} error={err.erros.occurred_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
          />
        )}
      </Field>

      <Field
        label="Observações"
        hint="Opcional."
        id={err.idDe("notes")}
        error={err.erros.notes}
      >
        {({ id, ...aria }) => (
          <Input id={id} {...aria} value={notes} onChange={(e) => setNotes(e.target.value)} />
        )}
      </Field>
    </FormSheet>
  );
}
