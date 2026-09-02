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
import {
  PRICING_LABELS,
  PRICING_UNIDADE,
  SERVICOS_SUGERIDOS,
} from "@/components/servicos/labels";

/**
 * Registra um serviço contratado (§13 a §21 do Módulo 33).
 *
 * ⚠️ **Campo que some da tela não pode ser cobrado.** `unit_price` e
 * `quantity` desaparecem quando a cobrança é `fechado`, e `agreed_amount`
 * desaparece quando não é. Cobrar um campo oculto manda o foco para um `id`
 * que não está no DOM: a recusa aparece e nada acontece, e o produtor fica
 * olhando um formulário que diz que está errado sem dizer onde. Foi o defeito
 * do `order-form`, registrado em `.claude/rules/ui.md`.
 *
 * O mesmo vale para `due_date`, que só existe quando o serviço NÃO foi pago à
 * vista: o §21 lista os dois como caminhos diferentes, e a action recusa os
 * dois juntos.
 */

type Property = { id: string; name: string };
type Pasture = { id: string; name: string; property_id: string };
type Lote = { id: string; rotulo: string };
type PontoDeLeite = { id: string; name: string };

const ORDEM = [
  "description",
  "pricing",
  "unit_price",
  "quantity",
  "agreed_amount",
  "worker_count",
  "occurred_at",
  "contact_name",
  "property_id",
  "pasture_id",
  "confinement_stay_id",
  "milk_site_id",
  "due_date",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

const NENHUM = "__nenhum__";

export default function ServiceJobForm({
  properties,
  pastures,
  lotes,
  pontosDeLeite,
}: {
  properties: Property[];
  pastures: Pasture[];
  lotes: Lote[];
  pontosDeLeite: PontoDeLeite[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const hoje = new Date().toISOString().slice(0, 10);

  const [description, setDescription] = useState("");
  const [pricing, setPricing] = useState("dia");
  const [unitPrice, setUnitPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [agreedAmount, setAgreedAmount] = useState("");
  const [workerCount, setWorkerCount] = useState("1");
  const [occurredAt, setOccurredAt] = useState(hoje);
  const [contactName, setContactName] = useState("");
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [pastureId, setPastureId] = useState(NENHUM);
  const [loteId, setLoteId] = useState(NENHUM);
  const [milkSiteId, setMilkSiteId] = useState(NENHUM);
  const [pago, setPago] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  const fechado = pricing === "fechado";
  const pastosDaFazenda = pastures.filter((p) => p.property_id === propertyId);

  function limpar() {
    setDescription("");
    setPricing("dia");
    setUnitPrice("");
    setQuantity("");
    setAgreedAmount("");
    setWorkerCount("1");
    setOccurredAt(hoje);
    setContactName("");
    setPropertyId(properties[0]?.id ?? "");
    setPastureId(NENHUM);
    setLoteId(NENHUM);
    setMilkSiteId(NENHUM);
    setPago(false);
    setDueDate("");
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!description.trim()) novos.description = "Informe qual serviço foi feito.";
    if (!propertyId) novos.property_id = "Escolha a fazenda.";

    const preco = lerValorDoCampo(unitPrice);
    const qtd = lerValorDoCampo(quantity);
    const combinado = lerValorDoCampo(agreedAmount);
    const pessoas = lerValorDoCampo(workerCount);

    // A cobrança condiciona o que é obrigatório, e o que nem está na tela.
    if (fechado) {
      if (combinado === null || combinado <= 0) {
        novos.agreed_amount = "Informe o valor combinado do serviço.";
      }
    } else {
      if (preco === null || preco <= 0) {
        novos.unit_price = "Informe quanto vale cada unidade.";
      }
      if (qtd !== null && qtd <= 0) {
        novos.quantity = "A quantidade precisa ser maior que zero.";
      }
    }
    if (pessoas !== null && (!Number.isInteger(pessoas) || pessoas <= 0)) {
      novos.worker_count = "Informe quantas pessoas trabalharam.";
    }
    if (!occurredAt) novos.occurred_at = "Informe a data.";

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/service-jobs", {
      property_id: propertyId,
      occurred_at: new Date(`${occurredAt}T12:00:00.000Z`).toISOString(),
      description: description.trim(),
      pricing,
      unit_price: fechado ? null : preco,
      agreed_amount: fechado ? combinado : null,
      quantity: fechado ? null : qtd,
      worker_count: pessoas ?? 1,
      contact_name: contactName.trim() || null,
      pasture_id: pastureId === NENHUM ? null : pastureId,
      confinement_stay_id: loteId === NENHUM ? null : loteId,
      milk_site_id: milkSiteId === NENHUM ? null : milkSiteId,
      notes: notes.trim() || null,
      pago,
      due_date: pago || !dueDate ? null : new Date(`${dueDate}T12:00:00.000Z`).toISOString(),
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
      trigger={<Button>+ Novo serviço</Button>}
      title="Registrar serviço contratado"
      description="Diária, empreito ou serviço por unidade. O que você contratou de fora."
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
        label="Serviço"
        required
        hint="Escolha um da lista ou escreva o seu."
        id={err.idDe("description")}
        error={err.erros.description}
      >
        {({ id, ...aria }) => (
          <>
            <Input
              id={id}
              {...aria}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                err.limparCampo("description");
              }}
              placeholder="Ex: Reforma de cerca"
              list={`${id}-sugestoes`}
            />
            <datalist id={`${id}-sugestoes`}>
              {SERVICOS_SUGERIDOS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </>
        )}
      </Field>

      <Field label="Como foi cobrado" required id={err.idDe("pricing")} error={err.erros.pricing}>
        {({ id, ...aria }) => (
          <Select
            value={pricing}
            onValueChange={(v) => {
              setPricing(v);
              err.limparCampo("pricing");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRICING_LABELS).map(([valor, rotulo]) => (
                <SelectItem key={valor} value={valor}>
                  {rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {!fechado && (
        <Field
          label="Valor de cada unidade"
          required
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

      {!fechado && (
        <Field
          label="Quantidade"
          hint="Quantos, no total. Pode acrescentar depois se o serviço durar mais dias."
          id={err.idDe("quantity")}
          error={err.erros.quantity}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit={PRICING_UNIDADE[pricing as keyof typeof PRICING_UNIDADE]}
              value={quantity}
              onValueChange={(v) => {
                setQuantity(v);
                err.limparCampo("quantity");
              }}
            />
          )}
        </Field>
      )}

      {fechado && (
        <Field
          label="Valor combinado"
          required
          hint="O total do empreito, sem contar unidade."
          id={err.idDe("agreed_amount")}
          error={err.erros.agreed_amount}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="dinheiro"
              value={agreedAmount}
              onValueChange={(v) => {
                setAgreedAmount(v);
                err.limparCampo("agreed_amount");
              }}
            />
          )}
        </Field>
      )}

      {!fechado && (
        <Field
          label="Quantas pessoas"
          hint="Multiplica o valor, não a quantidade. 3 homens por 4 dias são 12 diárias."
          id={err.idDe("worker_count")}
          error={err.erros.worker_count}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="pessoas"
              value={workerCount}
              onValueChange={(v) => {
                setWorkerCount(v);
                err.limparCampo("worker_count");
              }}
            />
          )}
        </Field>
      )}

      <Field label="Data" required id={err.idDe("occurred_at")} error={err.erros.occurred_at}>
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

      <Field
        label="Quem fez"
        hint="Opcional. Se o nome for novo, o contato é criado sozinho."
        id={err.idDe("contact_name")}
        error={err.erros.contact_name}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={contactName}
            onChange={(e) => {
              setContactName(e.target.value);
              err.limparCampo("contact_name");
            }}
            placeholder="Ex: Pedro Cercador"
          />
        )}
      </Field>

      <Field label="Fazenda" required id={err.idDe("property_id")} error={err.erros.property_id}>
        {({ id, ...aria }) => (
          <Select
            value={propertyId}
            onValueChange={(v) => {
              setPropertyId(v);
              setPastureId(NENHUM);
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

      <Field
        label="Pasto"
        hint="Opcional. Onde exatamente o serviço aconteceu."
        id={err.idDe("pasture_id")}
        error={err.erros.pasture_id}
      >
        {({ id, ...aria }) => (
          <Select
            value={pastureId}
            onValueChange={(v) => {
              setPastureId(v);
              err.limparCampo("pasture_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Nenhum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NENHUM}>Nenhum</SelectItem>
              {pastosDaFazenda.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {lotes.length > 0 && (
        <Field
          label="Lote de confinamento"
          hint="Opcional. Amarrar aqui faz o custo entrar na conta do lote."
          id={err.idDe("confinement_stay_id")}
          error={err.erros.confinement_stay_id}
        >
          {({ id, ...aria }) => (
            <Select
              value={loteId}
              onValueChange={(v) => {
                setLoteId(v);
                err.limparCampo("confinement_stay_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Nenhum</SelectItem>
                {lotes.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      {pontosDeLeite.length > 0 && (
        <Field
          label="Ponto de leite"
          hint="Opcional. Para o serviço ligado à atividade leiteira."
          id={err.idDe("milk_site_id")}
          error={err.erros.milk_site_id}
        >
          {({ id, ...aria }) => (
            <Select
              value={milkSiteId}
              onValueChange={(v) => {
                setMilkSiteId(v);
                err.limparCampo("milk_site_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NENHUM}>Nenhum</SelectItem>
                {pontosDeLeite.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field label="Já pagou?" id="pago">
        {({ id }) => (
          <label className="flex items-center gap-2 text-sm text-texto" htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              checked={pago}
              onChange={(e) => {
                setPago(e.target.checked);
                if (e.target.checked) setDueDate("");
              }}
              className="size-4 rounded border-borda-campo"
            />
            Sim, paguei à vista
          </label>
        )}
      </Field>

      {!pago && (
        <Field
          label="Vencimento"
          hint="Opcional. Em branco, vence na data do serviço."
          id={err.idDe("due_date")}
          error={err.erros.due_date}
        >
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              type="date"
              value={dueDate}
              onChange={(e) => {
                setDueDate(e.target.value);
                err.limparCampo("due_date");
              }}
            />
          )}
        </Field>
      )}

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
