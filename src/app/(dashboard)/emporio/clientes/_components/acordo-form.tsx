"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { useAviso } from "@/components/ui/toast";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";
import { dividirEmParcelas } from "@/lib/emporio/acordo";
import { somarDias } from "@/lib/emporio/fiado";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { paraCampo } from "../../_components/formato";

/** Ordem VISUAL, com o nome que a API usa. */
const ORDEM = ["entry_ids", "installments", "notes"] as const;
type Campo = (typeof ORDEM)[number];

export type OrigemDoAcordo = {
  entry_id: string;
  /** "Venda 000123, 08/11/2026": já montado no servidor. */
  rotulo: string;
  open: number;
};

type Parcela = { due_date: string; amount: string };

const CLASSE_TEXTAREA =
  "flex min-h-20 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-base shadow-sm " +
  "transition-colors placeholder:text-texto-discreto sm:text-sm " +
  "focus-visible:outline-none focus-visible:border-primaria-tinta focus-visible:ring-2 focus-visible:ring-primaria-tinta/40";

const cent = (n: number) => Math.round(n * 100);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const inteiroEntre = (bruto: string, min: number, max: number) =>
  /^\d+$/.test(bruto.trim()) && Number(bruto) >= min && Number(bruto) <= max;

/**
 * O acordo de fiado em parcelas sem juros (Q230, Q233). As origens são os fiados em aberto do cliente; as parcelas
 * nascem iguais (o resto dos centavos na primeira) e podem ser editadas. O servidor confere a soma e o prazo de novo.
 */
export function AcordoForm({
  customerId,
  origens,
  hoje,
}: {
  customerId: string;
  origens: OrigemDoAcordo[];
  /** "AAAA-MM-DD" de hoje em Brasília, calculado no servidor. */
  hoje: string;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "acordo");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const primeiraPadrao = iso(somarDias(new Date(`${hoje}T00:00:00Z`), 30));
  const todas = () => new Set(origens.map((o) => o.entry_id));
  const [marcadas, setMarcadas] = useState<Set<string>>(todas);
  const [quantidade, setQuantidade] = useState("3");
  const [primeira, setPrimeira] = useState(primeiraPadrao);
  const [aCada, setACada] = useState("30");
  const [parcelas, setParcelas] = useState<Parcela[]>([]);
  const [notas, setNotas] = useState("");

  const totalCent = origens.filter((o) => marcadas.has(o.entry_id)).reduce((s, o) => s + cent(o.open), 0);
  const somaCent = parcelas.reduce((s, p) => s + cent(lerNumeroBr(p.amount) ?? 0), 0);
  const parcelasBatem = parcelas.length > 0 && somaCent === totalCent;

  function reiniciar() {
    setMarcadas(todas());
    setQuantidade("3");
    setPrimeira(primeiraPadrao);
    setACada("30");
    setParcelas([]);
    setNotas("");
    err.limparTudo();
  }

  function alternar(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    // O total mudou: as parcelas montadas antes já não somam o mesmo.
    setParcelas([]);
    err.limparCampo("entry_ids");
    err.limparCampo("installments");
  }

  function montar() {
    if (totalCent <= 0) {
      err.setGlobal(null);
      err.reprovar({ entry_ids: "Marque ao menos um fiado para entrar no acordo." });
      return;
    }
    const novos: Partial<Record<Campo, string>> = {};
    if (!inteiroEntre(quantidade, 1, 48)) novos.installments = "O acordo tem de 1 a 48 parcelas.";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(primeira)) novos.installments = "Informe a data da primeira parcela.";
    else if (!inteiroEntre(aCada, 1, 365)) novos.installments = "O intervalo deve ser de 1 a 365 dias.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }
    err.limparCampo("installments");
    setParcelas(
      dividirEmParcelas(totalCent, Number(quantidade), new Date(`${primeira}T00:00:00Z`), Number(aCada)).map((p) => ({
        due_date: iso(p.due_date),
        amount: paraCampo(p.amount_cent / 100),
      })),
    );
  }

  function mudarParcela(i: number, mudanca: Partial<Parcela>) {
    setParcelas((ps) => ps.map((p, n) => (n === i ? { ...p, ...mudanca } : p)));
    err.limparCampo("installments");
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (marcadas.size === 0) novos.entry_ids = "Marque ao menos um fiado para entrar no acordo.";
    if (parcelas.length === 0) {
      novos.installments = "Monte as parcelas antes de fechar o acordo.";
    } else if (parcelas.some((p) => !p.due_date || (lerNumeroBr(p.amount) ?? 0) <= 0)) {
      novos.installments = "Toda parcela precisa de data e de valor maior que zero.";
    } else if (!parcelasBatem) {
      novos.installments = `As parcelas somam ${reaisBr(somaCent / 100)} e o acordo é de ${reaisBr(totalCent / 100)}.`;
    }
    if (notas.length > 500) novos.notes = "A observação aceita até 500 caracteres.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/customers/${customerId}/agreements`, {
      entry_ids: [...marcadas],
      installments: parcelas.map((p) => ({ due_date: p.due_date, amount: lerNumeroBr(p.amount) ?? 0 })),
      ...(notas.trim() ? { notes: notas.trim() } : {}),
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso("Acordo feito. As parcelas já valem como fiado.");
    setOpen(false);
    reiniciar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button type="button" variant="outline" size="sm">
          Fazer acordo
        </Button>
      }
      title="Fazer acordo"
      description="Junta fiados em aberto em parcelas, sem juros. Os fiados escolhidos saem da cobrança e as parcelas vencem e bloqueiam como fiado."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reiniciar();
      }}
      onSubmit={submit}
      submitLabel="Fechar o acordo"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Fiados do acordo" required id={err.idDe("entry_ids")} error={err.erros.entry_ids}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-2 text-sm focus-visible:outline-none">
            {origens.map((o) => (
              <label key={o.entry_id} className="flex min-h-11 items-center gap-3 text-texto sm:min-h-0">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primaria"
                  checked={marcadas.has(o.entry_id)}
                  onChange={() => alternar(o.entry_id)}
                />
                <span className="min-w-0 flex-1">{o.rotulo}</span>
                <span className="shrink-0">{reaisBr(o.open)}</span>
              </label>
            ))}
            <p className="flex justify-between gap-3 border-t border-borda pt-2 text-base font-semibold text-texto">
              <span>Total do acordo</span>
              <span>{reaisBr(totalCent / 100)}</span>
            </p>
          </div>
        )}
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label htmlFor="acordo-quantidade" className="text-sm font-medium text-texto">
            Parcelas
          </label>
          <Input
            id="acordo-quantidade"
            inputMode="numeric"
            autoComplete="off"
            value={quantidade}
            onChange={(e) => {
              setQuantidade(e.target.value.replace(/\D/g, "").slice(0, 2));
              setParcelas([]);
            }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="acordo-primeira" className="text-sm font-medium text-texto">
            Primeira parcela em
          </label>
          <Input
            id="acordo-primeira"
            type="date"
            value={primeira}
            onChange={(e) => {
              setPrimeira(e.target.value);
              setParcelas([]);
            }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="acordo-a-cada" className="text-sm font-medium text-texto">
            A cada (dias)
          </label>
          <Input
            id="acordo-a-cada"
            inputMode="numeric"
            autoComplete="off"
            value={aCada}
            onChange={(e) => {
              setACada(e.target.value.replace(/\D/g, "").slice(0, 3));
              setParcelas([]);
            }}
          />
        </div>
      </div>

      <Button type="button" variant="outline" onClick={montar}>
        Montar parcelas
      </Button>

      <Field
        label="Parcelas"
        required
        hint="Pode mudar a data e o valor de cada uma. A soma tem de fechar com o total."
        id={err.idDe("installments")}
        error={err.erros.installments}
      >
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-2 focus-visible:outline-none">
            {parcelas.length === 0 ? (
              <p className="text-sm text-texto-secundario">Toque em Montar parcelas.</p>
            ) : (
              <>
                {parcelas.map((p, i) => (
                  <div key={i} className="grid grid-cols-[2rem_1fr_1fr] items-start gap-2">
                    <span className="pt-2 text-sm text-texto-secundario">{i + 1}</span>
                    <Input
                      type="date"
                      aria-label={`Vencimento da parcela ${i + 1}`}
                      value={p.due_date}
                      onChange={(e) => mudarParcela(i, { due_date: e.target.value })}
                    />
                    <MoneyInput
                      aria-label={`Valor da parcela ${i + 1}`}
                      value={p.amount}
                      hideEcho
                      onValueChange={(v) => mudarParcela(i, { amount: v })}
                    />
                  </div>
                ))}
                <p className={parcelasBatem ? "text-sm text-texto-secundario" : "text-sm font-medium text-perigo-tinta"}>
                  Soma das parcelas: {reaisBr(somaCent / 100)} de {reaisBr(totalCent / 100)}
                </p>
              </>
            )}
          </div>
        )}
      </Field>

      <Field label="Observação" hint="Opcional. Até 500 caracteres." id={err.idDe("notes")} error={err.erros.notes}>
        {({ id, ...aria }) => (
          <textarea
            id={id}
            {...aria}
            rows={3}
            className={CLASSE_TEXTAREA}
            value={notas}
            onChange={(e) => {
              setNotas(e.target.value);
              err.limparCampo("notes");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
