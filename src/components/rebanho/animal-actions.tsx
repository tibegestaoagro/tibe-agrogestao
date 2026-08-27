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
import { apiPost } from "@/lib/client-api";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";

/**
 * As três ações do animal, em painéis irmãos na mesma página.
 *
 * Por isso o id do campo no DOM leva prefixo do painel, e NÃO é o nome do
 * campo na API: `value` existe em dois painéis daqui, e id repetido faz
 * `getElementById` focar o primeiro que encontrar, que seria o painel errado.
 *
 * O nome da API continua sendo a chave de `erros` e de `ORDEM`, porque é ele
 * que o servidor devolve em `error.field`. As duas coisas são diferentes: uma
 * casa com o contrato, a outra tem que ser única no documento.
 */

type Vaccine = { id: string; name: string };
type Property = { id: string; name: string };

export default function AnimalActions({
  animalId,
  vaccines,
  properties,
}: {
  animalId: string;
  vaccines: Vaccine[];
  properties: Property[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <WeightSheet animalId={animalId} />
      <VaccinationSheet animalId={animalId} vaccines={vaccines} />
      <MovementSheet animalId={animalId} properties={properties} />
    </div>
  );
}

/**
 * O que os três painéis têm em comum: navegação, abrir/fechar, pendência e o
 * estado de erro, que vem do hook do kit.
 */
function usePainel<K extends string>(ordem: readonly K[], prefixo: string) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ordem, prefixo);

  return { router, open, setOpen, loading, setLoading, ...err };
}

const ORDEM_PESO = ["weight", "measured_at"] as const;

function WeightSheet({ animalId }: { animalId: string }) {
  const s = usePainel(ORDEM_PESO, "peso");
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState("");

  async function submit() {
    const kg = lerValorDoCampo(weight);
    if (kg === null || kg <= 0) {
      s.setGlobal(null);
      s.reprovar({ weight: "Informe o peso em quilos." });
      return;
    }

    s.limparTudo();
    s.setLoading(true);
    const res = await apiPost(`/api/v1/animals/${animalId}/weight-logs`, {
      weight: kg,
      measured_at: date ? new Date(date).toISOString() : null,
    });
    s.setLoading(false);
    if (!res.ok) return s.doServidor(res);

    setWeight("");
    setDate("");
    s.setOpen(false);
    s.router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Registrar pesagem
        </Button>
      }
      title="Registrar pesagem"
      open={s.open}
      onOpenChange={s.setOpen}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={s.loading}
      error={s.global}
      focarCampoId={s.focarCampoId}
      tentativa={s.tentativa}
    >
      <Field label="Peso" required id={s.idDe("weight")} hint="Em quilos." error={s.erros.weight}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="kg"
            value={weight}
            onValueChange={(v) => { setWeight(v); s.limparCampo("weight"); }}
          />
        )}
      </Field>

      <Field label="Data" id={s.idDe("measured_at")} error={s.erros.measured_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
    </FormSheet>
  );
}

const ORDEM_VACINA = ["vaccine_id", "applied_at", "cost"] as const;

function VaccinationSheet({ animalId, vaccines }: { animalId: string; vaccines: Vaccine[] }) {
  const s = usePainel(ORDEM_VACINA, "vacina");
  const [vaccineId, setVaccineId] = useState("");
  const [date, setDate] = useState("");
  const [cost, setCost] = useState("");

  async function submit() {
    if (!vaccineId) {
      s.setGlobal(null);
      s.reprovar({ vaccine_id: "Escolha a vacina." });
      return;
    }

    s.limparTudo();
    s.setLoading(true);
    const res = await apiPost(`/api/v1/animals/${animalId}/vaccinations`, {
      vaccine_id: vaccineId,
      applied_at: date ? new Date(date).toISOString() : null,
      cost: lerValorDoCampo(cost),
    });
    s.setLoading(false);
    if (!res.ok) return s.doServidor(res);

    setVaccineId("");
    setDate("");
    setCost("");
    s.setOpen(false);
    s.router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Registrar vacinação
        </Button>
      }
      title="Registrar vacinação"
      open={s.open}
      onOpenChange={s.setOpen}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={s.loading}
      error={s.global}
      focarCampoId={s.focarCampoId}
      tentativa={s.tentativa}
    >
      <Field label="Vacina" required id={s.idDe("vaccine_id")} error={s.erros.vaccine_id}>
        {({ id, ...aria }) => (
          <Select value={vaccineId} onValueChange={(v) => { setVaccineId(v); s.limparCampo("vaccine_id"); }}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {vaccines.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Data de aplicação" id={s.idDe("applied_at")} error={s.erros.applied_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>

      <Field label="Custo em R$" hint="Opcional." id={s.idDe("cost")} error={s.erros.cost}>
        {({ id, ...aria }) => (
          <MoneyInput id={id} {...aria} value={cost} onValueChange={setCost} />
        )}
      </Field>
    </FormSheet>
  );
}

const ORDEM_MOV = ["movement_type", "value", "to_property_id", "occurred_at"] as const;

function MovementSheet({ animalId, properties }: { animalId: string; properties: Property[] }) {
  const s = usePainel(ORDEM_MOV, "mov");
  const [type, setType] = useState<"purchase" | "sale" | "transfer" | "death" | "">("");
  const [value, setValue] = useState("");
  const [toProperty, setToProperty] = useState("");
  const [date, setDate] = useState("");

  async function submit() {
    const novos: Partial<Record<(typeof ORDEM_MOV)[number], string>> = {};
    if (!type) novos.movement_type = "Escolha o tipo.";
    if (type === "transfer" && !toProperty) {
      novos.to_property_id = "Escolha a propriedade de destino.";
    }
    if (Object.keys(novos).length > 0) {
      s.setGlobal(null);
      s.reprovar(novos);
      return;
    }

    s.limparTudo();
    s.setLoading(true);
    const res = await apiPost(`/api/v1/animals/${animalId}/movements`, {
      movement_type: type,
      value: lerValorDoCampo(value),
      to_property_id: type === "transfer" ? toProperty : null,
      occurred_at: date ? new Date(date).toISOString() : null,
    });
    s.setLoading(false);
    if (!res.ok) return s.doServidor(res);

    setType("");
    setValue("");
    setToProperty("");
    setDate("");
    s.setOpen(false);
    s.router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button variant="outline" size="sm">
          Registrar movimentação
        </Button>
      }
      title="Registrar movimentação"
      open={s.open}
      onOpenChange={s.setOpen}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={s.loading}
      error={s.global}
      focarCampoId={s.focarCampoId}
      tentativa={s.tentativa}
    >
      <Field label="Tipo" required id={s.idDe("movement_type")} error={s.erros.movement_type}>
        {({ id, ...aria }) => (
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as typeof type);
              s.limparCampo("movement_type");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="purchase">Compra</SelectItem>
              <SelectItem value="sale">Venda</SelectItem>
              <SelectItem value="transfer">Transferência</SelectItem>
              <SelectItem value="death">Morte</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      {(type === "purchase" || type === "sale") && (
        <Field
          label="Valor em R$"
          id={s.idDe("value")}
          hint={`Gera lançamento financeiro automático (${type === "sale" ? "receita" : "despesa"}).`}
          error={s.erros.value}
        >
          {({ id, ...aria }) => (
            <MoneyInput id={id} {...aria} value={value} onValueChange={setValue} />
          )}
        </Field>
      )}

      {type === "transfer" && (
        <Field
          label="Propriedade de destino"
          required
          id={s.idDe("to_property_id")}
          error={s.erros.to_property_id}
        >
          {({ id, ...aria }) => (
            <Select
              value={toProperty}
              onValueChange={(v) => { setToProperty(v); s.limparCampo("to_property_id"); }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Selecione" />
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
      )}

      <Field label="Data" id={s.idDe("occurred_at")} error={s.erros.occurred_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        )}
      </Field>
    </FormSheet>
  );
}
