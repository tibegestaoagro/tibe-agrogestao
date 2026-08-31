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
import { apiPost } from "@/lib/client-api";

/**
 * Encerrar uma estadia.
 *
 * A regra do documento é que a soma dos destinos bata com o que está na
 * estadia, e o servidor recusa quando não bate. Aqui ela vira EXPERIÊNCIA: o
 * que falta (ou sobra) aparece enquanto o produtor digita, para ele não
 * descobrir só ao tocar em salvar.
 *
 * Os destinos oferecidos vêm do tipo da estadia, e são os mesmos que a tabela
 * de regras do servidor aceita: desaparecimento não oferece venda.
 */

type Destino = { movement_type: string; rotulo: string; ajuda?: string };

const DESTINOS_POR_TIPO: Record<string, Destino[]> = {
  pasto_terceiro: [
    { movement_type: "retorno_estadia", rotulo: "Voltaram para a fazenda" },
    { movement_type: "venda", rotulo: "Vendidos" },
    { movement_type: "morte", rotulo: "Morreram" },
  ],
  boitel: [
    { movement_type: "retorno_estadia", rotulo: "Voltaram para a fazenda" },
    { movement_type: "venda", rotulo: "Vendidos" },
    { movement_type: "morte", rotulo: "Morreram" },
  ],
  evento: [
    { movement_type: "retorno_estadia", rotulo: "Voltaram para a fazenda" },
    { movement_type: "venda", rotulo: "Vendidos" },
    { movement_type: "morte", rotulo: "Morreram" },
  ],
  terceiro_na_fazenda: [
    { movement_type: "saida_terceiro", rotulo: "Devolvidos ao dono" },
  ],
  desaparecimento: [
    { movement_type: "retorno_estadia", rotulo: "Encontrados", ajuda: "Voltam para o pasto." },
    { movement_type: "morte", rotulo: "Morte confirmada" },
    {
      movement_type: "perda_confirmada",
      rotulo: "Perda confirmada",
      ajuda: "Saem do rebanho de vez, sem terem sido vendidos.",
    },
  ],
};

const SEM_DESTINOS: Destino[] = [];

type Pasture = { id: string; name: string };
const SEM_PASTOS: Pasture[] = [];

export default function StayCloseForm({
  stayId,
  tipo,
  saldoAberto,
  descricao,
  pastures,
}: {
  stayId: string;
  tipo: string;
  saldoAberto: number;
  descricao: string;
  /**
   * Pastos da fazenda desta estadia, já filtrados pela página (§18 do
   * documento de Confinamento, que a decisão do usuário estendeu aos SEIS
   * tipos de estadia). Opcional porque `/rebanho` ainda não os passa: sem a
   * lista, o campo simplesmente não aparece, como antes.
   */
  pastures?: Pasture[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // `?? []` criaria um array novo a cada render, e o `useMemo` de baixo
  // recalcularia sempre. A constante vazia é a mesma referência.
  const destinos = DESTINOS_POR_TIPO[tipo] ?? SEM_DESTINOS;
  const pastosDisponiveis = pastures ?? SEM_PASTOS;
  const err = useErrosDeFormulario(
    destinos.map((d) => d.movement_type).concat("quantity", "value", "pasture_id"),
  );

  const [valores, setValores] = useState<Record<string, string>>({});
  const [valorVenda, setValorVenda] = useState("");
  const [pastureId, setPastureId] = useState("");

  const informado = useMemo(
    () =>
      destinos.reduce((soma, d) => soma + (lerValorDoCampo(valores[d.movement_type] ?? "") ?? 0), 0),
    [destinos, valores],
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
    if (falta !== 0) {
      err.setGlobal(null);
      err.reprovar({
        quantity:
          falta > 0
            ? `Ainda faltam ${falta.toLocaleString("pt-BR")} cabeças para fechar as ${saldoAberto.toLocaleString("pt-BR")}.`
            : `Você informou ${Math.abs(falta).toLocaleString("pt-BR")} a mais do que as ${saldoAberto.toLocaleString("pt-BR")} que estão na estadia.`,
      });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/herd/stays/${stayId}/close`, {
      destinos: destinos
        .map((d) => ({
          movement_type: d.movement_type,
          quantity: lerValorDoCampo(valores[d.movement_type] ?? "") ?? 0,
          value: d.movement_type === "venda" ? lerValorDoCampo(valorVenda) : null,
          // Pasto de destino é só para quem volta ao pasto (§18): venda,
          // morte e os demais destinos não têm posição de destino para o
          // pasto pousar.
          ...(d.movement_type === "retorno_estadia" ? { pasture_id: pastureId || null } : {}),
        }))
        .filter((d) => d.quantity > 0),
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
      title="Encerrar estadia"
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
        Estão na estadia{" "}
        <span className="tabular-nums font-medium text-texto">
          {saldoAberto.toLocaleString("pt-BR")}
        </span>{" "}
        {saldoAberto === 1 ? "cabeça" : "cabeças"}. Diga para onde cada uma foi.
      </p>

      {destinos.map((destino) => (
        <Field
          key={destino.movement_type}
          label={destino.rotulo}
          hint={destino.ajuda}
          id={destino.movement_type}
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

      {voltouParaPasto && pastosDisponiveis.length > 0 && (
        <Field
          label="Pasto de destino"
          hint="Opcional. Para onde os que voltaram foram."
          id="pasture_id"
        >
          {({ id, ...aria }) => (
            <Select value={pastureId} onValueChange={setPastureId}>
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Sem pasto informado" />
              </SelectTrigger>
              <SelectContent>
                {pastosDisponiveis.map((p) => (
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
          id="value"
          error={err.erros.value}
        >
          {({ id, ...aria }) => (
            <MoneyInput id={id} {...aria} value={valorVenda} onValueChange={setValorVenda} />
          )}
        </Field>
      )}

      {/* O placar da soma: aparece enquanto se digita, para a recusa do
          servidor nunca ser surpresa ao tocar em salvar. */}
      <p
        className={
          falta === 0
            ? "text-sm font-medium text-sucesso-tinta"
            : "text-sm text-texto-secundario"
        }
        id="quantity-placar"
      >
        {falta === 0
          ? "A conta fecha: os destinos somam o que está na estadia."
          : falta > 0
            ? `Faltam ${falta.toLocaleString("pt-BR")} para fechar.`
            : `Sobram ${Math.abs(falta).toLocaleString("pt-BR")}: você informou mais do que há na estadia.`}
      </p>
      {err.erros.quantity && (
        <p role="alert" className="text-sm text-perigo-tinta">
          {err.erros.quantity}
        </p>
      )}
    </FormSheet>
  );
}
