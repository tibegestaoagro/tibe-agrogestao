"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
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

type Pasture = { id: string; name: string };

export default function LotCloseForm({
  stayId,
  saldoAberto,
  descricao,
  pastures,
}: {
  stayId: string;
  saldoAberto: number;
  descricao: string;
  /** Pastos da fazenda deste lote, já filtrados pela página (§18). */
  pastures: Pasture[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(
    DESTINOS.map((d) => d.movement_type).concat("quantity", "value", "pasture_id"),
    `encerrar-${stayId}`,
  );

  const [valores, setValores] = useState<Record<string, string>>({});
  const [valorVenda, setValorVenda] = useState("");
  const [pastureId, setPastureId] = useState("");

  const informado = useMemo(
    () =>
      DESTINOS.reduce((soma, d) => soma + (lerValorDoCampo(valores[d.movement_type] ?? "") ?? 0), 0),
    [valores],
  );
  const falta = saldoAberto - informado;
  const vendeuAlgo = (lerValorDoCampo(valores.venda ?? "") ?? 0) > 0;
  const voltouParaPasto = (lerValorDoCampo(valores.retorno_estadia ?? "") ?? 0) > 0;

  function limpar() {
    setValores({});
    setValorVenda("");
    setPastureId("");
    err.limparTudo();
  }

  async function submit() {
    // Somar mais do que está no lote continua recusado (pelo servidor
    // também); somar menos passa a ser válido desde 31/08 e deixa o lote
    // aberto com o restante (§20).
    if (falta < 0) {
      err.setGlobal(null);
      err.reprovar({
        quantity: `Você informou ${Math.abs(falta).toLocaleString("pt-BR")} a mais do que as ${saldoAberto.toLocaleString("pt-BR")} que estão no lote.`,
      });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost<{ id: string; encerrada: boolean; saldo_aberto: number }>(
      `/api/v1/herd/stays/${stayId}/close`,
      {
        destinos: DESTINOS.map((d) => ({
          movement_type: d.movement_type,
          quantity: lerValorDoCampo(valores[d.movement_type] ?? "") ?? 0,
          value: d.movement_type === "venda" ? lerValorDoCampo(valorVenda) : null,
          // Pasto de destino é só para quem volta ao pasto (§18): venda e
          // morte não têm posição de destino nenhuma para o pasto pousar.
          ...(d.movement_type === "retorno_estadia" ? { pasture_id: pastureId || null } : {}),
        })).filter((d) => d.quantity > 0),
      },
    );
    setLoading(false);

    if (!res.ok) {
      err.doServidor(res);
      return;
    }

    aviso.sucesso(
      res.data.encerrada
        ? "Lote encerrado."
        : `Encerramento parcial registrado. Ainda restam ${res.data.saldo_aberto.toLocaleString("pt-BR")} cabeças no lote.`,
    );
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

      {DESTINOS.map((destino, indice) => (
        // A recusa de quantidade do `closeStay` vem com `field: "quantity"`,
        // que não é o id de nenhum destino: sem o `error=` no primeiro campo,
        // "Cada destino precisa de uma quantidade inteira" era gravada em
        // `erros.quantity` e nunca renderizada. O primeiro destino carrega a
        // mensagem porque é onde o produtor está olhando quando ela acontece.
        <Field
          key={destino.movement_type}
          label={destino.rotulo}
          id={err.idDe(destino.movement_type)}
          error={err.erros[destino.movement_type] ?? (indice === 0 ? err.erros.quantity : undefined)}
        >
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

      {voltouParaPasto && pastures.length > 0 && (
        <Field
          label="Pasto de destino"
          hint="Opcional. Para onde os que voltaram foram."
          id={err.idDe("pasture_id")}
          error={err.erros.pasture_id}
        >
          {({ id, ...aria }) => (
            <Select value={pastureId} onValueChange={setPastureId}>
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem pasto informado" />
              </SelectTrigger>
              <SelectContent>
                {pastures.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

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
          falta < 0
            ? "text-sm text-perigo-tinta"
            : falta === 0
              ? "text-sm font-medium text-sucesso-tinta"
              : "text-sm text-texto-secundario"
        }
      >
        {falta === 0
          ? "A conta fecha: os destinos somam tudo que está no lote."
          : falta > 0
            ? `Encerramento parcial: ${falta.toLocaleString("pt-BR")} cabeças continuam no lote depois de salvar.`
            : `Você informou ${Math.abs(falta).toLocaleString("pt-BR")} a mais do que há no lote.`}
      </p>
      {err.erros.quantity && (
        <p role="alert" className="text-sm text-perigo-tinta">
          {err.erros.quantity}
        </p>
      )}
    </FormSheet>
  );
}
