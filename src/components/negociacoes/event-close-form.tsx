"use client";

import { useMemo, useState } from "react";
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
 * Encerrar a remessa de evento (Módulo 31, missão 3, §8.2).
 *
 * O documento manda a soma dos destinos bater com o enviado, e o servidor
 * recusa quando não bate. Aqui isso vira EXPERIÊNCIA: o que falta aparece
 * enquanto o produtor digita, para ele não descobrir só ao tocar em encerrar.
 *
 * O valor e os custos aparecem só quando "vendidos" passa de zero, que é a
 * decisão 4 da spec virando comportamento de tela: sem venda não se aceita
 * valor, e um campo visível pedindo valor num encerramento sem venda seria a
 * tela convidando para a recusa.
 */

type OutroDestino = { id: string; label: string; contraparte: string | null; ajuda: string };

const OUTROS_DESTINOS: OutroDestino[] = [
  {
    id: "pasto_terceiro",
    label: "Pasto de terceiro",
    contraparte: "Dono do pasto",
    ajuda: "Seguiram do evento direto para o pasto de outra pessoa.",
  },
  {
    id: "boitel",
    label: "Boitel",
    contraparte: "Nome do boitel",
    ajuda: "Seguiram do evento direto para o confinamento de terceiro.",
  },
  {
    id: "evento",
    label: "Outro evento",
    contraparte: "Leiloeira ou organizador",
    ajuda: "Seguiram para um segundo leilão ou feira, sem passar pela fazenda.",
  },
];

const ORDEM = ["quantity", "amount", "outro_destino"] as const;

type Custo = { descricao: string; amount: string };

function reais(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EventCloseForm({
  negotiationId,
  saldoAberto,
  descricao,
}: {
  negotiationId: string;
  saldoAberto: number;
  descricao: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM);

  const [vendidos, setVendidos] = useState("");
  const [retornados, setRetornados] = useState("");
  const [outros, setOutros] = useState("");
  const [tipoDoDestino, setTipoDoDestino] = useState("");
  const [contraparte, setContraparte] = useState("");
  const [valor, setValor] = useState("");
  const [custos, setCustos] = useState<Custo[]>([]);

  const nVendidos = lerValorDoCampo(vendidos) ?? 0;
  const nRetornados = lerValorDoCampo(retornados) ?? 0;
  const nOutros = lerValorDoCampo(outros) ?? 0;
  const falta = saldoAberto - (nVendidos + nRetornados + nOutros);
  const vendeuAlgo = nVendidos > 0;
  const seguiuAdiante = nOutros > 0;

  const somaCustos = useMemo(
    () => custos.reduce((s, c) => s + (lerValorDoCampo(c.amount) ?? 0), 0),
    [custos],
  );
  const nValor = lerValorDoCampo(valor) ?? 0;
  const destinoEscolhido = OUTROS_DESTINOS.find((d) => d.id === tipoDoDestino) ?? null;

  function limpar() {
    setVendidos("");
    setRetornados("");
    setOutros("");
    setTipoDoDestino("");
    setContraparte("");
    setValor("");
    setCustos([]);
    err.limparTudo();
  }

  async function submit() {
    if (falta !== 0) {
      err.setGlobal(null);
      err.reprovar({
        quantity:
          falta > 0
            ? `Ainda faltam ${falta.toLocaleString("pt-BR")} para fechar as ${saldoAberto.toLocaleString("pt-BR")} da remessa.`
            : `Você informou ${Math.abs(falta).toLocaleString("pt-BR")} a mais do que as ${saldoAberto.toLocaleString("pt-BR")} que estão na remessa.`,
      });
      return;
    }
    if (vendeuAlgo && nValor <= 0) {
      err.setGlobal(null);
      err.reprovar({ amount: "Informe por quanto os animais foram vendidos." });
      return;
    }
    if (seguiuAdiante && !tipoDoDestino) {
      err.setGlobal(null);
      err.reprovar({ outro_destino: "Escolha para onde eles seguiram." });
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost(`/api/v1/negotiations/${negotiationId}/close-event`, {
      vendidos: nVendidos,
      retornados: nRetornados,
      outro_destino: seguiuAdiante
        ? {
            quantity: nOutros,
            type: tipoDoDestino,
            counterparty_name: contraparte.trim() || null,
          }
        : null,
      amount: vendeuAlgo ? nValor : null,
      pago: true,
      custos: custos
        .filter((c) => c.descricao.trim() && (lerValorDoCampo(c.amount) ?? 0) > 0)
        .map((c) => ({ descricao: c.descricao.trim(), amount: lerValorDoCampo(c.amount) ?? 0 })),
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
          Encerrar remessa
        </Button>
      }
      title="Encerrar a remessa"
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
        Estão na remessa{" "}
        <span className="tabular-nums font-medium text-texto">
          {saldoAberto.toLocaleString("pt-BR")}
        </span>{" "}
        {saldoAberto === 1 ? "cabeça" : "cabeças"}. Diga para onde cada uma foi.
      </p>

      <Field label="Vendidos no evento" id="quantity" error={err.erros.quantity}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="cabeças"
            value={vendidos}
            onValueChange={(v) => {
              setVendidos(v);
              err.limparCampo("quantity");
            }}
          />
        )}
      </Field>

      <Field label="Voltaram para a fazenda" id="retornados">
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="cabeças"
            value={retornados}
            onValueChange={(v) => {
              setRetornados(v);
              err.limparCampo("quantity");
            }}
          />
        )}
      </Field>

      <Field
        label="Seguiram para outro destino"
        hint="Não voltaram nem foram vendidas: foram para outro lugar."
        id="outros"
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            unit="cabeças"
            value={outros}
            onValueChange={(v) => {
              setOutros(v);
              err.limparCampo("quantity");
            }}
          />
        )}
      </Field>

      {seguiuAdiante && (
        <>
          <Field
            label="Para onde seguiram"
            required
            id="outro_destino"
            error={err.erros.outro_destino}
            hint={destinoEscolhido?.ajuda}
          >
            {({ id, ...aria }) => (
              <Select
                value={tipoDoDestino}
                onValueChange={(v) => {
                  setTipoDoDestino(v);
                  err.limparCampo("outro_destino");
                }}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue placeholder="Escolha o destino" />
                </SelectTrigger>
                <SelectContent>
                  {OUTROS_DESTINOS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          {destinoEscolhido?.contraparte && (
            <Field label={destinoEscolhido.contraparte} id="contraparte">
              {({ id, ...aria }) => (
                <Input
                  id={id}
                  {...aria}
                  value={contraparte}
                  onChange={(e) => setContraparte(e.target.value)}
                />
              )}
            </Field>
          )}
        </>
      )}

      {vendeuAlgo && (
        <>
          <Field
            label="Valor total da venda, em R$"
            required
            hint="Só dos vendidos. Gera a receita no Financeiro."
            id="amount"
            error={err.erros.amount}
          >
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                value={valor}
                onValueChange={(v) => {
                  setValor(v);
                  err.limparCampo("amount");
                }}
              />
            )}
          </Field>

          <div className="rounded-md border border-borda p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-texto">Comissão, taxa, frete</p>
              <button
                type="button"
                onClick={() => setCustos([...custos, { descricao: "", amount: "" }])}
                className="text-sm text-acento-tinta underline"
              >
                Adicionar
              </button>
            </div>
            {custos.map((c, i) => (
              <div key={i} className="mt-2 flex items-center gap-2">
                <Input
                  placeholder="Ex: Comissão da leiloeira"
                  value={c.descricao}
                  onChange={(e) => {
                    const novos = [...custos];
                    novos[i] = { ...novos[i], descricao: e.target.value };
                    setCustos(novos);
                  }}
                />
                <MoneyInput
                  hideEcho
                  aria-label={`Valor do custo ${i + 1}`}
                  placeholder="0,00"
                  value={c.amount}
                  onValueChange={(v) => {
                    const novos = [...custos];
                    novos[i] = { ...novos[i], amount: v };
                    setCustos(novos);
                  }}
                />
              </div>
            ))}
            {somaCustos > 0 && nValor > 0 && (
              <p className="mt-2 text-sm text-texto-secundario">
                Líquido da venda: {reais(nValor - somaCustos)}
              </p>
            )}
          </div>
        </>
      )}

      {/* O placar da soma: aparece enquanto se digita, para a recusa do
          servidor nunca ser surpresa ao tocar em encerrar. Some quando a
          reprovação aparece, porque as duas frases dizem o mesmo número e ler
          isso duas vezes seguidas faz o aviso parecer eco, não resposta. */}
      <p
        className={
          falta === 0 ? "text-sm font-medium text-sucesso-tinta" : "text-sm text-texto-secundario"
        }
        hidden={!!err.erros.quantity}
      >
        {falta === 0
          ? "A conta fecha: os destinos somam o que está na remessa."
          : falta > 0
            ? `Faltam ${falta.toLocaleString("pt-BR")} para fechar.`
            : `Sobram ${Math.abs(falta).toLocaleString("pt-BR")}: você informou mais do que há na remessa.`}
      </p>
      {err.erros.quantity && (
        <p role="alert" className="text-sm text-perigo-tinta">
          {err.erros.quantity}
        </p>
      )}
    </FormSheet>
  );
}
