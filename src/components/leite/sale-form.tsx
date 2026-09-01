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

/**
 * A venda avulsa de leite (§23 a §27).
 *
 * ⚠️ **Vender já retira o leite**, e a descrição do painel diz isso, porque o
 * produtor precisa saber que não vai precisar registrar a saída depois.
 *
 * O §25 aceita o valor total OU o preço por litro, nunca os dois: a tela
 * escolhe por botão em vez de deixar os dois campos abertos, porque mandar os
 * dois é recusado pela rota e oferecer o erro seria desenhar a armadilha. O
 * total calculado aparece ao vivo, que é o §25 fazendo o que promete.
 */

type Site = { id: string; name: string; liters: number };
type Buyer = { id: string; name: string };
type Property = { id: string; name: string };

const ORDEM = [
  "site_id",
  "liters",
  "amount",
  "price_per_liter",
  "buyer_id",
  "property_id",
  "occurred_at",
  "due_date",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function SaleForm({
  sites,
  buyers,
  properties,
  defaultPropertyId,
}: {
  sites: Site[];
  buyers: Buyer[];
  properties: Property[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, "venda");

  const [siteId, setSiteId] = useState("");
  const [liters, setLiters] = useState("");
  const [forma, setForma] = useState<"por_litro" | "total">("por_litro");
  const [preco, setPreco] = useState("");
  const [total, setTotal] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [data, setData] = useState(hoje());
  const [pago, setPago] = useState(true);
  const [vencimento, setVencimento] = useState("");
  const [notes, setNotes] = useState("");

  const litrosLidos = lerValorDoCampo(liters) ?? 0;
  const precoLido = lerValorDoCampo(preco) ?? 0;
  const totalCalculado =
    forma === "por_litro" ? litrosLidos * precoLido : (lerValorDoCampo(total) ?? 0);
  const escolhido = sites.find((s) => s.id === siteId);

  function limpar() {
    setSiteId("");
    setLiters("");
    setForma("por_litro");
    setPreco("");
    setTotal("");
    setBuyerId("");
    setPropertyId(defaultPropertyId ?? "");
    setData(hoje());
    setPago(true);
    setVencimento("");
    setNotes("");
    err.limparTudo();
  }

  function trocarForma(nova: "por_litro" | "total") {
    setForma(nova);
    // O campo abandonado sai do DOM: deixar valor nele mandaria os DOIS à rota,
    // que recusa com VALOR_DUPLICADO, e a recusa cairia num campo invisível.
    if (nova === "por_litro") {
      setTotal("");
      err.limparCampo("amount");
    } else {
      setPreco("");
      err.limparCampo("price_per_liter");
    }
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!siteId) novos.site_id = "Escolha de onde saiu o leite.";
    if (!propertyId) novos.property_id = "Escolha a fazenda.";
    if (litrosLidos <= 0) novos.liters = "Informe quantos litros foram vendidos.";
    if (escolhido && litrosLidos > escolhido.liters) {
      novos.liters = `Você tem ${escolhido.liters.toLocaleString("pt-BR")} litros seus em ${escolhido.name}.`;
    }
    if (forma === "por_litro" && precoLido <= 0) {
      novos.price_per_liter = "Informe o preço por litro.";
    }
    if (forma === "total" && (lerValorDoCampo(total) ?? 0) <= 0) {
      novos.amount = "Informe o valor total.";
    }
    if (!data) novos.occurred_at = "Informe a data.";

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/milk/sales", {
      site_id: siteId,
      property_id: propertyId,
      liters: litrosLidos,
      // Um dos dois, nunca os dois: é o §25, e é o que a rota exige.
      price_per_liter: forma === "por_litro" ? precoLido : null,
      amount: forma === "total" ? lerValorDoCampo(total) : null,
      buyer_id: buyerId || null,
      occurred_at: new Date(`${data}T12:00:00`).toISOString(),
      pago,
      due_date: !pago && vencimento ? new Date(`${vencimento}T12:00:00`).toISOString() : null,
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
      trigger={<Button>Registrar venda</Button>}
      title="Registrar venda de leite"
      description="Vender já tira o leite do lugar: você não precisa registrar a saída depois."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar venda"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="De onde saiu" required id="venda-site_id" error={err.erros.site_id}>
        {({ id, ...aria }) => (
          <Select
            value={siteId}
            onValueChange={(v) => {
              setSiteId(v);
              err.limparCampo("site_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o local" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.liters.toLocaleString("pt-BR")} L seus)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Fazenda" required id="venda-property_id" error={err.erros.property_id}>
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
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Litros vendidos" required id="venda-liters" error={err.erros.liters}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="L"
            value={liters}
            onValueChange={(v) => {
              setLiters(v);
              err.limparCampo("liters");
            }}
          />
        )}
      </Field>

      <div className="space-y-1">
        <p className="text-sm font-medium text-texto">Como você combinou o preço?</p>
        <div className="flex gap-2">
          {(
            [
              ["por_litro", "Por litro"],
              ["total", "Valor total"],
            ] as const
          ).map(([valor, rotulo]) => (
            <Button
              key={valor}
              type="button"
              variant={forma === valor ? "default" : "outline"}
              onClick={() => trocarForma(valor)}
            >
              {rotulo}
            </Button>
          ))}
        </div>
      </div>

      {forma === "por_litro" ? (
        <Field
          label="Preço por litro"
          required
          id="venda-price_per_liter"
          error={err.erros.price_per_liter}
          hint={
            totalCalculado > 0
              ? `Total da venda: ${reais(Math.round(totalCalculado * 100) / 100)}.`
              : "O TIBÉ calcula o total sozinho."
          }
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              value={preco}
              onValueChange={(v) => {
                setPreco(v);
                err.limparCampo("price_per_liter");
              }}
            />
          )}
        </Field>
      ) : (
        <Field
          label="Valor total"
          required
          id="venda-amount"
          error={err.erros.amount}
          hint={
            totalCalculado > 0 && litrosLidos > 0
              ? `Dá ${reais(Math.round((totalCalculado / litrosLidos) * 10000) / 10000)} por litro.`
              : undefined
          }
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              value={total}
              onValueChange={(v) => {
                setTotal(v);
                err.limparCampo("amount");
              }}
            />
          )}
        </Field>
      )}

      {buyers.length > 0 && (
        <Field label="Comprador" id="venda-buyer_id" error={err.erros.buyer_id} hint="Opcional.">
          {({ id, ...aria }) => (
            <Select
              value={buyerId}
              onValueChange={(v) => {
                setBuyerId(v);
                err.limparCampo("buyer_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem comprador" />
              </SelectTrigger>
              <SelectContent>
                {buyers.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field label="Data" required id="venda-occurred_at" error={err.erros.occurred_at}>
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

      <div className="space-y-1">
        <p className="text-sm font-medium text-texto">Você já recebeu?</p>
        <div className="flex gap-2">
          {(
            [
              [true, "Recebi"],
              [false, "Vou receber"],
            ] as const
          ).map(([valor, rotulo]) => (
            <Button
              key={String(valor)}
              type="button"
              variant={pago === valor ? "default" : "outline"}
              onClick={() => {
                setPago(valor);
                if (valor) setVencimento("");
              }}
            >
              {rotulo}
            </Button>
          ))}
        </div>
      </div>

      {!pago && (
        <Field
          label="Data prevista de recebimento"
          id="venda-due_date"
          error={err.erros.due_date}
          hint="Vira uma conta a receber no Financeiro."
        >
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

      <Field label="Observação" id="venda-notes" error={err.erros.notes} hint="Opcional.">
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
