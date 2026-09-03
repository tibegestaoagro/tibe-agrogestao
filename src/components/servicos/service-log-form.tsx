"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

/**
 * Lança a produção diária (§19, §20) ou o horímetro (§33) de um serviço em
 * andamento.
 *
 * Os dois modos são o MESMO campo do lado da rota: quantidade OU horímetro,
 * nunca os dois (a action recusa com `field: "quantity"` quando os dois
 * chegam juntos). O toggle decide qual par vai no corpo, e o outro nem é
 * enviado: não há como o produtor preencher os dois ao mesmo tempo.
 */

const ORDEM = ["quantity", "hour_meter_start", "hour_meter_end", "occurred_at", "notes"] as const;
type Campo = (typeof ORDEM)[number];

export default function ServiceLogForm({
  serviceJobId,
  unidade,
}: {
  serviceJobId: string;
  /** A unidade do §19: "horas", "hectares"... Eco do campo de quantidade. */
  unidade: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, `log-${serviceJobId}`);

  const hoje = new Date().toISOString().slice(0, 10);

  const [modoHorimetro, setModoHorimetro] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [hourMeterStart, setHourMeterStart] = useState("");
  const [hourMeterEnd, setHourMeterEnd] = useState("");
  const [occurredAt, setOccurredAt] = useState(hoje);
  const [notes, setNotes] = useState("");

  function limpar() {
    setModoHorimetro(false);
    setQuantity("");
    setHourMeterStart("");
    setHourMeterEnd("");
    setOccurredAt(hoje);
    setNotes("");
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};

    const qtd = lerValorDoCampo(quantity);
    const inicial = lerValorDoCampo(hourMeterStart);
    const final = lerValorDoCampo(hourMeterEnd);

    // Campo escondido pelo modo não pode ser cobrado: o outro par nem está
    // na tela, e cobrá-lo mandaria o foco para um `id` que não existe.
    if (modoHorimetro) {
      if (inicial === null || inicial < 0) {
        novos.hour_meter_start = "Informe o horímetro no começo.";
      }
      if (final === null || final < 0) {
        novos.hour_meter_end = "Informe o horímetro no fim.";
      } else if (inicial !== null && final <= inicial) {
        novos.hour_meter_end = "O horímetro final precisa ser maior que o inicial.";
      }
    } else {
      if (qtd === null || qtd <= 0) {
        novos.quantity = "Informe quanto foi feito.";
      }
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/service-jobs/${serviceJobId}/logs`, {
      quantity: modoHorimetro ? null : qtd,
      hour_meter_start: modoHorimetro ? inicial : null,
      hour_meter_end: modoHorimetro ? final : null,
      occurred_at: occurredAt ? new Date(`${occurredAt}T12:00:00.000Z`).toISOString() : null,
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
      trigger={<Button variant="outline">+ Produção do dia</Button>}
      title="Lançar produção"
      description="Acrescenta ao que este serviço já tem. Escolha quantidade OU horímetro: com o horímetro a conta das horas é automática."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Lançar"
      submitPendingLabel="Lançando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <div className="flex gap-2" role="group" aria-label="Como registrar">
        <Button
          type="button"
          variant={modoHorimetro ? "outline" : "default"}
          size="sm"
          onClick={() => {
            setModoHorimetro(false);
            err.limparCampo("hour_meter_start");
            err.limparCampo("hour_meter_end");
          }}
        >
          Quantidade
        </Button>
        <Button
          type="button"
          variant={modoHorimetro ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setModoHorimetro(true);
            err.limparCampo("quantity");
          }}
        >
          Horímetro
        </Button>
      </div>

      {!modoHorimetro && (
        <Field label="Quantidade" required id={err.idDe("quantity")} error={err.erros.quantity}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit={unidade}
              value={quantity}
              onValueChange={(v) => {
                setQuantity(v);
                err.limparCampo("quantity");
              }}
            />
          )}
        </Field>
      )}

      {modoHorimetro && (
        <Field
          label="Horímetro no começo"
          required
          id={err.idDe("hour_meter_start")}
          error={err.erros.hour_meter_start}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="horas"
              value={hourMeterStart}
              onValueChange={(v) => {
                setHourMeterStart(v);
                err.limparCampo("hour_meter_start");
              }}
            />
          )}
        </Field>
      )}

      {modoHorimetro && (
        <Field
          label="Horímetro no fim"
          required
          id={err.idDe("hour_meter_end")}
          error={err.erros.hour_meter_end}
        >
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="horas"
              value={hourMeterEnd}
              onValueChange={(v) => {
                setHourMeterEnd(v);
                err.limparCampo("hour_meter_end");
              }}
            />
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
