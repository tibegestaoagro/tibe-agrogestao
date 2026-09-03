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
import type { ServiceCostKind } from "@/generated/prisma/client";
import { SERVICE_COST_KIND_LABELS } from "@/components/servicos/labels";

/**
 * Registra um custo do serviço (§21 a §24).
 *
 * O combustível é um caminho DIFERENTE do resto: quando o produto existe no
 * estoque, a baixa é automática, e ele NUNCA gera lançamento no Financeiro
 * porque o diesel já virou despesa quando foi comprado (decisão 17 da fase
 * 34.2). É por isso que "saiu do caixa" SOME quando a natureza é
 * combustível: mostrar o campo seria oferecer uma opção que a rota ignora.
 */

type Produto = { id: string; name: string; unit: string };

const ORDEM = [
  "description",
  "product_id",
  "quantity",
  "unit_price",
  "amount",
  "occurred_at",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

const NENHUM = "__nenhum__";

export default function ServiceCostForm({
  serviceJobId,
  produtos,
}: {
  serviceJobId: string;
  produtos: Produto[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, `custo-${serviceJobId}`);

  const hoje = new Date().toISOString().slice(0, 10);

  const [kind, setKind] = useState<ServiceCostKind>("combustivel");
  const [description, setDescription] = useState("");
  const [productId, setProductId] = useState(NENHUM);
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAt, setOccurredAt] = useState(hoje);
  const [notes, setNotes] = useState("");
  const [saiuDoCaixa, setSaiuDoCaixa] = useState(false);

  const combustivel = kind === "combustivel";
  const produtoEscolhido = produtos.find((p) => p.id === productId) ?? null;

  function limpar() {
    setKind("combustivel");
    setDescription("");
    setProductId(NENHUM);
    setQuantity("");
    setUnitPrice("");
    setAmount("");
    setOccurredAt(hoje);
    setNotes("");
    setSaiuDoCaixa(false);
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};

    const qtd = lerValorDoCampo(quantity);
    const preco = lerValorDoCampo(unitPrice);
    const valor = lerValorDoCampo(amount);

    // Campo escondido pela natureza não pode ser cobrado.
    if (combustivel) {
      if (!description.trim() && !produtoEscolhido) {
        novos.description = "Diga qual foi o combustível, ou escolha o produto.";
      }
      if (qtd === null || qtd <= 0) {
        novos.quantity = "Informe quanto foi gasto.";
      }
      if (unitPrice.trim() !== "" && (preco === null || preco <= 0)) {
        novos.unit_price = "O valor precisa ser maior que zero.";
      }
    } else {
      if (!description.trim()) {
        novos.description = "Diga qual foi o custo.";
      }
      if (amount.trim() !== "" && (valor === null || valor <= 0)) {
        novos.amount = "O valor precisa ser maior que zero.";
      }
      if (saiuDoCaixa && (valor === null || valor <= 0)) {
        novos.amount = "Para lançar no Financeiro, informe o valor que saiu.";
      }
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);

    const quando = occurredAt ? new Date(`${occurredAt}T12:00:00.000Z`).toISOString() : null;
    const corpo = combustivel
      ? {
          kind,
          description: description.trim() || null,
          product_id: productId !== NENHUM ? productId : null,
          quantity: qtd,
          unit_price: preco,
          occurred_at: quando,
          notes: notes.trim() || null,
        }
      : {
          kind,
          description: description.trim(),
          amount: valor,
          occurred_at: quando,
          notes: notes.trim() || null,
          saiu_do_caixa: saiuDoCaixa,
        };

    const res = await apiPost(`/api/v1/service-jobs/${serviceJobId}/costs`, corpo);
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
      trigger={<Button variant="outline">+ Custo</Button>}
      title="Registrar custo do serviço"
      description="Combustível baixa do estoque e nunca vira despesa: ele já virou quando foi comprado. Os outros custos só entram no Financeiro se você marcar que o dinheiro saiu agora."
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
      <Field label="Natureza" required id="kind">
        {({ id, ...aria }) => (
          <Select
            value={kind}
            onValueChange={(v) => {
              const novo = v as ServiceCostKind;
              setKind(novo);
              if (novo === "combustivel") {
                setAmount("");
                setSaiuDoCaixa(false);
              } else {
                setProductId(NENHUM);
                setQuantity("");
                setUnitPrice("");
              }
              err.limparTudo();
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SERVICE_COST_KIND_LABELS).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {combustivel && produtos.length > 0 && (
        <Field
          label="Produto"
          hint="Opcional. Se existir no estoque, a baixa é automática."
          id={err.idDe("product_id")}
          error={err.erros.product_id}
        >
          {({ id, ...aria }) => (
            <Select
              value={productId}
              onValueChange={(v) => {
                setProductId(v);
                err.limparCampo("product_id");
                err.limparCampo("description");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Nenhum</SelectItem>
                {produtos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field
        label="Descrição"
        required={!combustivel || !produtoEscolhido}
        hint={
          combustivel && produtoEscolhido ? "Opcional. Em branco, usa o nome do produto." : undefined
        }
        id={err.idDe("description")}
        error={err.erros.description}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              err.limparCampo("description");
            }}
            placeholder={combustivel ? "Ex: Diesel S10" : "Ex: Diária do operador"}
          />
        )}
      </Field>

      {combustivel && (
        <Field label="Quantidade" required id={err.idDe("quantity")} error={err.erros.quantity}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit={produtoEscolhido?.unit ?? "litros"}
              value={quantity}
              onValueChange={(v) => {
                setQuantity(v);
                err.limparCampo("quantity");
              }}
            />
          )}
        </Field>
      )}

      {combustivel && (
        <Field
          label="Valor por unidade"
          hint="Opcional. Sem valor, o combustível baixa do estoque e não entra no §25."
          id={err.idDe("unit_price")}
          error={err.erros.unit_price}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="dinheiro"
              value={unitPrice}
              onValueChange={(v) => {
                setUnitPrice(v);
                err.limparCampo("unit_price");
              }}
            />
          )}
        </Field>
      )}

      {!combustivel && (
        <Field
          label="Valor"
          hint="Opcional. Sem valor, o custo fica só no histórico, sem entrar no §25."
          id={err.idDe("amount")}
          error={err.erros.amount}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="dinheiro"
              value={amount}
              onValueChange={(v) => {
                setAmount(v);
                err.limparCampo("amount");
              }}
            />
          )}
        </Field>
      )}

      {!combustivel && (
        <Field label="Saiu do caixa agora?" id="saiu_do_caixa">
          {({ id }) => (
            <label className="flex items-center gap-2 text-sm text-texto" htmlFor={id}>
              <input
                id={id}
                type="checkbox"
                checked={saiuDoCaixa}
                onChange={(e) => {
                  setSaiuDoCaixa(e.target.checked);
                  err.limparCampo("amount");
                }}
                className="size-4 rounded border-borda-campo"
              />
              Sim, gera despesa no Financeiro
            </label>
          )}
        </Field>
      )}

      <Field
        label="Data"
        hint="Opcional. Em branco, é hoje."
        id={err.idDe("occurred_at")}
        error={err.erros.occurred_at}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={occurredAt}
            onChange={(e) => {
              setOccurredAt(e.target.value);
              err.limparCampo("occurred_at");
            }}
          />
        )}
      </Field>

      <Field label="Observações" hint="Opcional." id={err.idDe("notes")} error={err.erros.notes}>
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
