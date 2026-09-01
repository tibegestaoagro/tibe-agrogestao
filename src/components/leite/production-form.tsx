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
 * Registro da produção de leite (§8 e §9 da Área Leite).
 *
 * As duas formas do §9 são ALTERNATIVAS, e a tela deixa isso explícito com um
 * seletor: ou "o dia inteiro" ou "por ordenha". Deixar os quatro campos
 * visíveis ao mesmo tempo convidaria a preencher o total E a manhã, que a rota
 * recusa com `FORMAS_MISTURADAS`. Melhor não oferecer o erro.
 *
 * "Vacas em lactação" está aqui porque o §8 o lista como campo do registro. Ele
 * NÃO vira coluna da produção: a rota grava um `definir` de lactação na mesma
 * data. Uma fonte só para o mesmo número.
 */

type Property = { id: string; name: string };
type Group = { id: string; name: string; property_id: string };

const ORDEM = [
  "property_id",
  "recorded_at",
  "dia",
  "manha",
  "tarde",
  "noite",
  "vacas_em_lactacao",
  "group_id",
  "notes",
] as const;
type Campo = (typeof ORDEM)[number];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

export default function ProductionForm({
  properties,
  groups,
  defaultPropertyId,
}: {
  properties: Property[];
  groups: Group[];
  defaultPropertyId?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, "prod");

  const [forma, setForma] = useState<"dia" | "ordenha">("dia");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [data, setData] = useState(hoje());
  const [dia, setDia] = useState("");
  const [manha, setManha] = useState("");
  const [tarde, setTarde] = useState("");
  const [noite, setNoite] = useState("");
  const [vacas, setVacas] = useState("");
  const [groupId, setGroupId] = useState("");
  const [notes, setNotes] = useState("");

  const lotesDaFazenda = groups.filter((g) => g.property_id === propertyId);

  function limpar() {
    setForma("dia");
    setPropertyId(defaultPropertyId ?? "");
    setData(hoje());
    setDia("");
    setManha("");
    setTarde("");
    setNoite("");
    setVacas("");
    setGroupId("");
    setNotes("");
    err.limparTudo();
  }

  function trocarForma(nova: "dia" | "ordenha") {
    setForma(nova);
    // Os campos da forma abandonada saem do DOM. Deixar o valor no estado
    // mandaria litros que a tela não mostra mais, e a recusa cairia num campo
    // invisível: a mesma armadilha do `order-form`, registrada em ui.md.
    if (nova === "dia") {
      setManha("");
      setTarde("");
      setNoite("");
      err.limparCampo("manha");
      err.limparCampo("tarde");
      err.limparCampo("noite");
    } else {
      setDia("");
      err.limparCampo("dia");
    }
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!propertyId) novos.property_id = "Escolha a fazenda.";
    if (!data) novos.recorded_at = "Informe a data da produção.";

    const litrosDia = lerValorDoCampo(dia);
    const litrosManha = lerValorDoCampo(manha);
    const litrosTarde = lerValorDoCampo(tarde);
    const litrosNoite = lerValorDoCampo(noite);

    if (forma === "dia") {
      if (litrosDia === null || litrosDia <= 0) {
        novos.dia = "Informe quantos litros foram produzidos.";
      }
    } else if (litrosManha === null && litrosTarde === null && litrosNoite === null) {
      novos.manha = "Informe pelo menos uma ordenha.";
    } else {
      for (const [campo, valor] of [
        ["manha", litrosManha],
        ["tarde", litrosTarde],
        ["noite", litrosNoite],
      ] as const) {
        if (valor !== null && valor <= 0) {
          novos[campo] = "A quantidade deve ser maior que zero.";
        }
      }
    }

    const qtdVacas = vacas.trim() === "" ? null : lerValorDoCampo(vacas);
    if (vacas.trim() !== "" && (qtdVacas === null || !Number.isInteger(qtdVacas) || qtdVacas < 0)) {
      novos.vacas_em_lactacao = "Informe um número inteiro de vacas.";
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/milk/production", {
      property_id: propertyId,
      recorded_at: data ? new Date(`${data}T12:00:00`).toISOString() : null,
      dia: forma === "dia" ? litrosDia : null,
      manha: forma === "ordenha" ? litrosManha : null,
      tarde: forma === "ordenha" ? litrosTarde : null,
      noite: forma === "ordenha" ? litrosNoite : null,
      group_id: groupId || null,
      vacas_em_lactacao: qtdVacas,
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
      trigger={<Button>Registrar produção</Button>}
      title="Registrar produção de leite"
      description="Informe o total do dia ou detalhe as ordenhas. O TIBÉ soma sozinho."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar produção"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Fazenda" required id="prod-property_id" error={err.erros.property_id}>
        {({ id, ...aria }) => (
          <Select
            value={propertyId}
            onValueChange={(v) => {
              setPropertyId(v);
              err.limparCampo("property_id");
              setGroupId("");
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

      <Field label="Data" required id="prod-recorded_at" error={err.erros.recorded_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              err.limparCampo("recorded_at");
            }}
          />
        )}
      </Field>

      <div className="space-y-1">
        <p className="text-sm font-medium text-texto">Como quer registrar?</p>
        <div className="flex gap-2">
          {(
            [
              ["dia", "Total do dia"],
              ["ordenha", "Por ordenha"],
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

      {forma === "dia" ? (
        <Field
          label="Litros produzidos no dia"
          required
          id="prod-dia"
          error={err.erros.dia}
          hint="Exemplo: 500"
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="L"
              value={dia}
              onValueChange={(v) => {
                setDia(v);
                err.limparCampo("dia");
              }}
            />
          )}
        </Field>
      ) : (
        <>
          {(
            [
              ["manha", "Manhã"],
              ["tarde", "Tarde"],
              ["noite", "Noite"],
            ] as const
          ).map(([campo, rotulo]) => {
            const valor = campo === "manha" ? manha : campo === "tarde" ? tarde : noite;
            const set = campo === "manha" ? setManha : campo === "tarde" ? setTarde : setNoite;
            return (
              <Field
                key={campo}
                label={`${rotulo} (litros)`}
                id={`prod-${campo}`}
                error={err.erros[campo]}
              >
                {({ id, ...aria }) => (
                  <MoneyInput
                    id={id}
                    {...aria}
                    kind="quantidade"
                    unit="L"
                    value={valor}
                    onValueChange={(v) => {
                      set(v);
                      err.limparCampo(campo);
                    }}
                  />
                )}
              </Field>
            );
          })}
        </>
      )}

      <Field
        label="Vacas em lactação"
        id="prod-vacas_em_lactacao"
        error={err.erros.vacas_em_lactacao}
        hint="Opcional. Preenchido aqui, atualiza a contagem da fazenda nesta data."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            value={vacas}
            onValueChange={(v) => {
              setVacas(v);
              err.limparCampo("vacas_em_lactacao");
            }}
          />
        )}
      </Field>

      {lotesDaFazenda.length > 0 && (
        <Field label="Lote" id="prod-group_id" error={err.erros.group_id} hint="Opcional.">
          {({ id, ...aria }) => (
            <Select
              value={groupId}
              onValueChange={(v) => {
                setGroupId(v);
                err.limparCampo("group_id");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem lote" />
              </SelectTrigger>
              <SelectContent>
                {lotesDaFazenda.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field label="Observação" id="prod-notes" error={err.erros.notes} hint="Opcional.">
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
