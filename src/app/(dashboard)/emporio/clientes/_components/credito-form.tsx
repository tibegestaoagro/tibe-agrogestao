"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPatch } from "@/lib/client-api";
import { lerNumeroBr } from "@/lib/numero-br";
import { paraCampo } from "../../_components/formato";

export type CreditoParaForm = {
  customer_id: string;
  fiado_limit: number | null;
  fiado_due_days: number | null;
  fiado_due_day: number | null;
};

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["fiado_limit", "fiado_due_days", "fiado_due_day"] as const;
type Campo = (typeof ORDEM)[number];

type Modo = "padrao" | "dias" | "dia";

const modoDe = (c: CreditoParaForm): Modo => (c.fiado_due_day != null ? "dia" : c.fiado_due_days != null ? "dias" : "padrao");

/** Limite e prazo do fiado de UM cliente. Limite vazio e prazo "Padrão da conta" voltam ao padrão da conta. */
export function CreditoForm({ credito }: { credito: CreditoParaForm }) {
  const router = useRouter();
  const err = useErrosDeFormulario(ORDEM, "credito");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [limite, setLimite] = useState(paraCampo(credito.fiado_limit));
  const [modo, setModo] = useState<Modo>(modoDe(credito));
  const [dias, setDias] = useState(credito.fiado_due_days != null ? String(credito.fiado_due_days) : "");
  const [diaDoMes, setDiaDoMes] = useState(credito.fiado_due_day != null ? String(credito.fiado_due_day) : "");

  function reiniciar() {
    setLimite(paraCampo(credito.fiado_limit));
    setModo(modoDe(credito));
    setDias(credito.fiado_due_days != null ? String(credito.fiado_due_days) : "");
    setDiaDoMes(credito.fiado_due_day != null ? String(credito.fiado_due_day) : "");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const valorDoLimite = limite.trim() === "" ? null : lerNumeroBr(limite);
    if (limite.trim() !== "" && (valorDoLimite === null || valorDoLimite < 0)) {
      novos.fiado_limit = "Digite um valor em reais, ou deixe vazio para valer o padrão da conta.";
    }
    // Só cobra o campo que está na tela: o outro vai como nulo.
    if (modo === "dias" && !(/^\d+$/.test(dias) && Number(dias) >= 1 && Number(dias) <= 365)) {
      novos.fiado_due_days = "O prazo deve ser de 1 a 365 dias.";
    }
    if (modo === "dia" && !(/^\d+$/.test(diaDoMes) && Number(diaDoMes) >= 1 && Number(diaDoMes) <= 31)) {
      novos.fiado_due_day = "O dia do mês deve ser de 1 a 31.";
    }
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPatch(`/api/v1/emporio/customers/${credito.customer_id}/credit`, {
      fiado_limit: valorDoLimite,
      fiado_due_days: modo === "dias" ? Number(dias) : null,
      fiado_due_day: modo === "dia" ? Number(diaDoMes) : null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button type="button" variant="outline" size="sm">
          Limite e prazo
        </Button>
      }
      title="Limite e prazo do fiado"
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel="Salvar"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label="Limite de fiado (R$)"
        hint="Vazio, vale o limite padrão da conta."
        id={err.idDe("fiado_limit")}
        error={err.erros.fiado_limit}
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            placeholder="Padrão da conta"
            value={limite}
            onValueChange={(valor) => {
              setLimite(valor);
              err.limparCampo("fiado_limit");
            }}
          />
        )}
      </Field>

      <Field label="Prazo" id="credito-prazo-modo">
        {({ id, ...aria }) => (
          <Select
            value={modo}
            onValueChange={(valor) => {
              if (valor === "") return;
              setModo(valor as Modo);
              err.limparCampo("fiado_due_days");
              err.limparCampo("fiado_due_day");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="padrao">Padrão da conta</SelectItem>
              <SelectItem value="dias">Dias depois da venda</SelectItem>
              <SelectItem value="dia">Dia fixo do mês</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      {modo === "dias" && (
        <Field label="Dias depois da venda" hint="De 1 a 365." id={err.idDe("fiado_due_days")} error={err.erros.fiado_due_days}>
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              inputMode="numeric"
              autoComplete="off"
              value={dias}
              onChange={(e) => {
                setDias(e.target.value.replace(/\D/g, "").slice(0, 3));
                err.limparCampo("fiado_due_days");
              }}
            />
          )}
        </Field>
      )}

      {modo === "dia" && (
        <Field
          label="Dia do mês"
          hint="De 1 a 31. Em mês mais curto, vence no último dia."
          id={err.idDe("fiado_due_day")}
          error={err.erros.fiado_due_day}
        >
          {({ id, ...aria }) => (
            <Input
              id={id}
              {...aria}
              inputMode="numeric"
              autoComplete="off"
              value={diaDoMes}
              onChange={(e) => {
                setDiaDoMes(e.target.value.replace(/\D/g, "").slice(0, 2));
                err.limparCampo("fiado_due_day");
              }}
            />
          )}
        </Field>
      )}
    </FormSheet>
  );
}
