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
import { apiPost, apiPatch } from "@/lib/client-api";

/**
 * Ações do talhão: novo ciclo (se não há ativo), e do ciclo ativo: insumo +
 * colheita.
 *
 * ⚠️ TRÊS painéis no mesmo arquivo, e o de insumo e o de colheita aparecem
 * JUNTOS quando há ciclo ativo. Os dois têm um campo `unit`, então sem
 * `prefixoDeId` os dois teriam `id="unit"` no mesmo DOM: o rótulo apontaria
 * para o campo do painel de cima, e o foco do erro cairia nele mesmo quando o
 * problema é no de baixo. Cada um leva o seu prefixo.
 */
export default function CycleActions({
  plotId,
  activeCycleId,
}: {
  plotId: string;
  activeCycleId: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {!activeCycleId && <NewCycleSheet plotId={plotId} />}
      {activeCycleId && (
        <>
          <InputSheet cycleId={activeCycleId} />
          <HarvestSheet cycleId={activeCycleId} />
        </>
      )}
    </div>
  );
}

const ORDEM_CICLO = ["crop", "planted_at", "expected_harvest_at"] as const;

function NewCycleSheet({ plotId }: { plotId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM_CICLO, "ciclo");
  const [crop, setCrop] = useState("");
  const [planted, setPlanted] = useState("");
  const [expected, setExpected] = useState("");

  async function submit() {
    if (!crop.trim()) {
      err.setGlobal(null);
      err.reprovar({ crop: "Informe a cultura." });
      return;
    }
    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/plots/${plotId}/cycles`, {
      crop: crop.trim(),
      planted_at: planted ? new Date(planted).toISOString() : null,
      expected_harvest_at: expected ? new Date(expected).toISOString() : null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setCrop("");
    setPlanted("");
    setExpected("");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Iniciar ciclo</Button>}
      title="Iniciar ciclo"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Iniciar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Cultura" required id={err.idDe("crop")} error={err.erros.crop}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={crop}
            onChange={(e) => {
              setCrop(e.target.value);
              err.limparCampo("crop");
            }}
          />
        )}
      </Field>

      <Field label="Data de plantio" id={err.idDe("planted_at")} error={err.erros.planted_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={planted}
            onChange={(e) => setPlanted(e.target.value)}
          />
        )}
      </Field>

      <Field
        label="Colheita prevista"
        id={err.idDe("expected_harvest_at")}
        error={err.erros.expected_harvest_at}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={expected}
            onChange={(e) => setExpected(e.target.value)}
          />
        )}
      </Field>
    </FormSheet>
  );
}

const ORDEM_INSUMO = ["input_type", "name", "quantity", "unit", "cost"] as const;
type CampoInsumo = (typeof ORDEM_INSUMO)[number];

function InputSheet({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM_INSUMO, "insumo");
  const [type, setType] = useState<"fertilizer" | "pesticide" | "seed" | "">("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [cost, setCost] = useState("");

  async function submit() {
    const novos: Partial<Record<CampoInsumo, string>> = {};
    if (!type) novos.input_type = "Escolha o tipo do insumo.";
    if (!name.trim()) novos.name = "Informe o nome do insumo.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/cycles/${cycleId}/inputs`, {
      input_type: type,
      name: name.trim(),
      quantity: lerValorDoCampo(quantity),
      unit: unit.trim() || null,
      cost: lerValorDoCampo(cost),
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setType("");
    setName("");
    setQuantity("");
    setUnit("");
    setCost("");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button variant="outline">Registrar insumo</Button>}
      title="Registrar insumo"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Tipo" required id={err.idDe("input_type")} error={err.erros.input_type}>
        {({ id, ...aria }) => (
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as typeof type);
              err.limparCampo("input_type");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fertilizer">Fertilizante</SelectItem>
              <SelectItem value="pesticide">Defensivo</SelectItem>
              <SelectItem value="seed">Semente</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Nome" required id={err.idDe("name")} error={err.erros.name}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              err.limparCampo("name");
            }}
          />
        )}
      </Field>

      <div className="flex gap-2">
        <div className="flex-1">
          <Field label="Quantidade" id={err.idDe("quantity")} error={err.erros.quantity}>
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                kind="quantidade"
                value={quantity}
                onValueChange={(v) => {
                  setQuantity(v);
                  err.limparCampo("quantity");
                }}
              />
            )}
          </Field>
        </div>
        <div className="flex-1">
          <Field label="Unidade" id={err.idDe("unit")} error={err.erros.unit}>
            {({ id, ...aria }) => (
              <Input
                id={id}
                {...aria}
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="kg, L..."
              />
            )}
          </Field>
        </div>
      </div>

      <Field label="Custo (R$)" id={err.idDe("cost")} error={err.erros.cost}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={cost}
            onValueChange={(v) => {
              setCost(v);
              err.limparCampo("cost");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}

const ORDEM_COLHEITA = ["harvested_at", "yield_amount", "yield_unit"] as const;
type CampoColheita = (typeof ORDEM_COLHEITA)[number];

function HarvestSheet({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM_COLHEITA, "colheita");
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"saca" | "tonelada" | "kg" | "">("");

  async function submit() {
    // Antes os três dividiam UMA frase ("Informe data, quantidade e
    // unidade"), e quem tinha esquecido só a unidade lia a cobrança das três.
    const novos: Partial<Record<CampoColheita, string>> = {};
    if (!date) novos.harvested_at = "Informe a data da colheita.";
    if (!amount.trim()) novos.yield_amount = "Informe a quantidade colhida.";
    if (!unit) novos.yield_unit = "Escolha a unidade.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPatch(`/api/v1/cycles/${cycleId}/harvest`, {
      harvested_at: new Date(date).toISOString(),
      yield_amount: lerValorDoCampo(amount),
      yield_unit: unit,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setDate("");
    setAmount("");
    setUnit("");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Registrar colheita</Button>}
      title="Registrar colheita"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Registrar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label="Data da colheita"
        required
        id={err.idDe("harvested_at")}
        error={err.erros.harvested_at}
      >
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              err.limparCampo("harvested_at");
            }}
          />
        )}
      </Field>

      <Field
        label="Quantidade colhida"
        required
        id={err.idDe("yield_amount")}
        error={err.erros.yield_amount}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            value={amount}
            onValueChange={(v) => {
              setAmount(v);
              err.limparCampo("yield_amount");
            }}
          />
        )}
      </Field>

      <Field label="Unidade" required id={err.idDe("yield_unit")} error={err.erros.yield_unit}>
        {({ id, ...aria }) => (
          <Select
            value={unit}
            onValueChange={(v) => {
              setUnit(v as typeof unit);
              err.limparCampo("yield_unit");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="saca">Saca</SelectItem>
              <SelectItem value="tonelada">Tonelada</SelectItem>
              <SelectItem value="kg">Kg</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>
    </FormSheet>
  );
}
