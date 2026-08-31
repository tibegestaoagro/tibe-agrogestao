"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiPost } from "@/lib/client-api";

/**
 * Encerrar um lote de confinamento, total ou parcial (§17 a §20 da spec).
 *
 * Reusa a mesma rota de encerramento de estadia do Módulo 30 fase 2
 * (`POST /api/v1/herd/stays/:id/close`), mas com formulário próprio: o painel
 * de Rebanho (`stay-close-form.tsx`) não conhece o tipo `confinamento`, e esta
 * tela abre um card por lote, então cada um precisa de um `id` de campo
 * isolado que aquele componente não tem motivo para carregar.
 *
 * Os destinos são os mesmos para `confinamento` e `boitel`
 * (`src/lib/herd/stay-rules.ts`): retorno ao pasto, venda direta, morte.
 */

const DESTINOS: { movement_type: string; rotulo: string }[] = [
  { movement_type: "retorno_estadia", rotulo: "Voltaram para o pasto" },
  { movement_type: "venda", rotulo: "Vendidos direto do confinamento" },
  { movement_type: "morte", rotulo: "Morreram" },
];

export default function LotCloseForm({
  stayId,
  saldoAberto,
  descricao,
}: {
  stayId: string;
  saldoAberto: number;
  descricao: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(
    DESTINOS.map((d) => d.movement_type).concat("quantity", "value"),
    `encerrar-${stayId}`,
  );

  const [valores, setValores] = useState<Record<string, string>>({});
  const [valorVenda, setValorVenda] = useState("");

  const informado = useMemo(
    () =>
      DESTINOS.reduce((soma, d) => soma + (lerValorDoCampo(valores[d.movement_type] ?? "") ?? 0), 0),
    [valores],
  );
  const falta = saldoAberto - informado;
  const vendeuAlgo = (lerValorDoCampo(valores.venda ?? "") ?? 0) > 0;

  function limpar() {
    setValores({});
    setValorVenda("");
    err.limparTudo();
  }

  async function submit() {
    if (falta !== 0) {
      err.setGlobal(null);
      err.reprovar({
        quantity:
          falta > 0
            ? `Ainda faltam ${falta.toLocaleString("pt-BR")} cabeças para fechar as ${saldoAberto.toLocaleString("pt-BR")}.`
            : `Você informou ${Math.abs(falta).toLocaleString("pt-BR")} a mais do que as ${saldoAberto.toLocaleString("pt-BR")} que estão no lote.`,
      });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/herd/stays/${stayId}/close`, {
      destinos: DESTINOS.map((d) => ({
        movement_type: d.movement_type,
        quantity: lerValorDoCampo(valores[d.movement_type] ?? "") ?? 0,
        value: d.movement_type === "venda" ? lerValorDoCampo(valorVenda) : null,
      })).filter((d) => d.quantity > 0),
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
      trigger={
        <Button variant="outline" size="sm">
          Encerrar
        </Button>
      }
      title="Encerrar lote"
      description={descricao}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Encerrar"
      submitPendingLabel="Encerrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <p className="rounded-md bg-superficie-afundada px-3 py-2 text-sm text-texto-secundario">
        Estão no lote{" "}
        <span className="tabular-nums font-medium text-texto">
          {saldoAberto.toLocaleString("pt-BR")}
        </span>{" "}
        {saldoAberto === 1 ? "cabeça" : "cabeças"}. Diga para onde cada uma foi.
      </p>

      {DESTINOS.map((destino) => (
        <Field key={destino.movement_type} label={destino.rotulo} id={err.idDe(destino.movement_type)}>
          {({ id, ...aria }) => (
            <MoneyInput
              id={id}
              {...aria}
              kind="quantidade"
              unit="cabeças"
              value={valores[destino.movement_type] ?? ""}
              onValueChange={(v) => {
                setValores((atuais) => ({ ...atuais, [destino.movement_type]: v }));
                err.limparCampo("quantity");
              }}
            />
          )}
        </Field>
      ))}

      {vendeuAlgo && (
        <Field
          label="Valor recebido pelos vendidos, em R$"
          hint="Opcional. Gera a receita no Financeiro."
          id={err.idDe("value")}
          error={err.erros.value}
        >
          {({ id, ...aria }) => (
            <MoneyInput id={id} {...aria} value={valorVenda} onValueChange={setValorVenda} />
          )}
        </Field>
      )}

      <p
        className={
          falta === 0 ? "text-sm font-medium text-sucesso-tinta" : "text-sm text-texto-secundario"
        }
      >
        {falta === 0
          ? "A conta fecha: os destinos somam o que está no lote."
          : falta > 0
            ? `Faltam ${falta.toLocaleString("pt-BR")} para fechar.`
            : `Sobram ${Math.abs(falta).toLocaleString("pt-BR")}: você informou mais do que há no lote.`}
      </p>
      {err.erros.quantity && (
        <p role="alert" className="text-sm text-perigo-tinta">
          {err.erros.quantity}
        </p>
      )}
    </FormSheet>
  );
}
