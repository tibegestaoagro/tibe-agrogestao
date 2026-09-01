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
import { litros as emLitros } from "@/components/leite/labels";

/**
 * O fechamento por período (§28 e §29).
 *
 * ⚠️ **O fechamento não move leite**: ele cobra o que já saiu. A descrição do
 * painel diz isso, porque a palavra "fechamento" sugere que algo sai.
 *
 * O painel mostra quanto está em aberto para cada comprador ANTES de o produtor
 * escolher o preço, porque é esse número que ele vai multiplicar: escondê-lo
 * obrigaria a somar as notas do mês à mão, que é exatamente o trabalho que o
 * §28 quer tirar dele.
 */

type Pendente = {
  buyer_id: string;
  buyer_name: string;
  liters: number;
  entregas: number;
  primeira: string;
  ultima: string;
};
type Property = { id: string; name: string };

const ORDEM = [
  "buyer_id",
  "property_id",
  "de",
  "ate",
  "price_per_liter",
  "due_date",
  "period_label",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

function soData(iso: string): string {
  return iso.slice(0, 10);
}

function reais(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ClosePeriodForm({
  pendentes,
  properties,
  defaultPropertyId,
}: {
  pendentes: Pendente[];
  properties: Property[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, "fecho");

  const [buyerId, setBuyerId] = useState("");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [preco, setPreco] = useState("");
  const [pago, setPago] = useState(false);
  const [vencimento, setVencimento] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [notes, setNotes] = useState("");

  const escolhido = pendentes.find((p) => p.buyer_id === buyerId);
  const precoLido = lerValorDoCampo(preco) ?? 0;
  const totalPrevisto = escolhido ? escolhido.liters * precoLido : 0;

  function escolherComprador(id: string) {
    setBuyerId(id);
    err.limparCampo("buyer_id");
    // O período nasce cobrindo tudo o que está em aberto daquele comprador: é
    // o caso comum ("fecha o mês"), e quem quiser fatiar ajusta as datas.
    const p = pendentes.find((x) => x.buyer_id === id);
    if (p) {
      setDe(soData(p.primeira));
      setAte(soData(p.ultima));
      err.limparCampo("de");
      err.limparCampo("ate");
    }
  }

  function limpar() {
    setBuyerId("");
    setPropertyId(defaultPropertyId ?? "");
    setDe("");
    setAte("");
    setPreco("");
    setPago(false);
    setVencimento("");
    setPeriodo("");
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!buyerId) novos.buyer_id = "Escolha o comprador.";
    if (!propertyId) novos.property_id = "Escolha a fazenda.";
    if (!de) novos.de = "Informe o início do período.";
    if (!ate) novos.ate = "Informe o fim do período.";
    if (de && ate && de > ate) novos.de = "O início é depois do fim.";
    if (precoLido <= 0) novos.price_per_liter = "Informe o preço por litro.";

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/milk/sales/close", {
      buyer_id: buyerId,
      property_id: propertyId,
      de: new Date(`${de}T00:00:00`).toISOString(),
      ate: new Date(`${ate}T23:59:59`).toISOString(),
      price_per_liter: precoLido,
      pago,
      due_date: !pago && vencimento ? new Date(`${vencimento}T12:00:00`).toISOString() : null,
      period_label: periodo.trim() || null,
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
      trigger={<Button variant="outline">Fechar período</Button>}
      title="Fechar o período de entregas"
      description="Cobra o que já foi entregue. Não tira leite de lugar nenhum."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Fechar período"
      submitPendingLabel="Fechando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label="Comprador"
        required
        id="fecho-buyer_id"
        error={err.erros.buyer_id}
        hint={
          escolhido
            ? `${escolhido.entregas} entregas em aberto, somando ${emLitros(escolhido.liters)}.`
            : "Só aparecem compradores com entrega ainda não cobrada."
        }
      >
        {({ id, ...aria }) => (
          <Select value={buyerId} onValueChange={escolherComprador}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o comprador" />
            </SelectTrigger>
            <SelectContent>
              {pendentes.map((p) => (
                <SelectItem key={p.buyer_id} value={p.buyer_id}>
                  {p.buyer_name} ({emLitros(p.liters)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Fazenda" required id="fecho-property_id" error={err.erros.property_id}>
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

      <Field label="De" required id="fecho-de" error={err.erros.de}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={de}
            onChange={(e) => {
              setDe(e.target.value);
              err.limparCampo("de");
            }}
          />
        )}
      </Field>

      <Field label="Até" required id="fecho-ate" error={err.erros.ate}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={ate}
            onChange={(e) => {
              setAte(e.target.value);
              err.limparCampo("ate");
            }}
          />
        )}
      </Field>

      <Field
        label="Preço por litro"
        required
        id="fecho-price_per_liter"
        error={err.erros.price_per_liter}
        hint={
          totalPrevisto > 0
            ? `Total do fechamento: ${reais(Math.round(totalPrevisto * 100) / 100)}.`
            : "O TIBÉ multiplica pelos litros em aberto."
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

      <div className="space-y-1">
        <p className="text-sm font-medium text-texto">Você já recebeu?</p>
        <div className="flex gap-2">
          {(
            [
              [false, "Vou receber"],
              [true, "Recebi"],
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
          id="fecho-due_date"
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

      <Field
        label="Nome do período"
        id="fecho-period_label"
        error={err.erros.period_label}
        hint="Opcional. Exemplo: 1a quinzena de setembro."
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

      <Field label="Observação" id="fecho-notes" error={err.erros.notes} hint="Opcional.">
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
