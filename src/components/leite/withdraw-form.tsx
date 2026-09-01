"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MilkDestination } from "@/generated/prisma/client";
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
import { DESTINOS, DESTINO_LABEL } from "@/components/leite/storage-labels";

/**
 * A retirada do §15 e do §21, com composição por dono.
 *
 * A tela lista os donos COM SALDO no local e já vem preenchida com o saldo
 * total de cada um, que é o exemplo do §21 na íntegra (950 saindo de um tanque
 * com 400 próprio, 300 do João e 250 do Carlos). Coleta parcial é ajustar os
 * campos.
 *
 * ⚠️ Nada é rateado. O §21 manda "dar baixa separadamente em cada volume", e
 * dividir 500 proporcionalmente entre três donos transformaria o número de
 * cada produtor numa conta que ninguém fez.
 *
 * ⚠️ Destino `venda` NÃO gera dinheiro nesta fase, e a dica do campo diz isso:
 * o produtor precisa saber que registrar a saída não registrou a venda.
 */

type Posicao = { owner_id: string | null; owner_name: string; liters: number };
type Site = { id: string; name: string };

const ORDEM = ["site_id", "destination", "itens", "occurred_at", "notes"] as const;
type Campo = (typeof ORDEM)[number];

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function formatar(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export default function WithdrawForm({
  sites,
  posicoesPorLocal,
}: {
  sites: Site[];
  /** Donos com saldo em cada local, já filtrados: posição zerada não entra. */
  posicoesPorLocal: Record<string, Posicao[]>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const err = useErrosDeFormulario(ORDEM, "retirar");

  const [siteId, setSiteId] = useState("");
  const [destino, setDestino] = useState<MilkDestination | "">("");
  const [data, setData] = useState(hoje());
  const [notes, setNotes] = useState("");
  /** Litros por dono, com a chave "-" para o leite próprio. */
  const [valores, setValores] = useState<Record<string, string>>({});

  const posicoes = siteId ? (posicoesPorLocal[siteId] ?? []) : [];
  const total = posicoes.reduce(
    (s, p) => s + (lerValorDoCampo(valores[p.owner_id ?? "-"] ?? "") ?? 0),
    0,
  );

  function escolherLocal(id: string) {
    setSiteId(id);
    err.limparCampo("site_id");
    // Pré-preenche com o saldo de cada dono: é o §21 literal, e a coleta que
    // esvazia o tanque é o caso comum. Quem coletou menos ajusta.
    const iniciais: Record<string, string> = {};
    for (const p of posicoesPorLocal[id] ?? []) {
      iniciais[p.owner_id ?? "-"] = String(p.liters);
    }
    setValores(iniciais);
    err.limparCampo("itens");
  }

  function limpar() {
    setSiteId("");
    setDestino("");
    setData(hoje());
    setNotes("");
    setValores({});
    err.limparTudo();
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!siteId) novos.site_id = "Escolha o local.";
    if (!destino) novos.destination = "Escolha o destino.";
    if (!data) novos.occurred_at = "Informe a data.";

    const itens = posicoes
      .map((p) => ({
        owner_id: p.owner_id,
        liters: lerValorDoCampo(valores[p.owner_id ?? "-"] ?? "") ?? 0,
        saldo: p.liters,
        nome: p.owner_name,
      }))
      .filter((i) => i.liters > 0);

    if (siteId && itens.length === 0) {
      novos.itens = "Informe quantos litros saíram, de pelo menos um dono.";
    }
    // Conferir aqui, e não só no servidor, poupa uma ida ao banco e mostra a
    // recusa no lugar certo. O servidor continua conferindo: esta é a borda
    // de conveniência, não a de verdade.
    const estourado = itens.find((i) => i.liters > i.saldo);
    if (estourado) {
      novos.itens = `${estourado.nome} tem ${formatar(estourado.saldo)} L no local, e você informou ${formatar(estourado.liters)} L.`;
    }

    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const res = await apiPost("/api/v1/milk/storage", {
      gesto: "retirar",
      site_id: siteId,
      destination: destino,
      itens: itens.map((i) => ({ owner_id: i.owner_id, liters: i.liters })),
      occurred_at: new Date(`${data}T12:00:00`).toISOString(),
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
      trigger={<Button variant="outline">Registrar retirada</Button>}
      title="Registrar retirada de leite"
      description="Informe quanto saiu de cada dono. O TIBÉ não divide sozinho."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) limpar();
      }}
      onSubmit={submit}
      submitLabel="Registrar retirada"
      submitPendingLabel="Registrando..."
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="De onde saiu" required id="retirar-site_id" error={err.erros.site_id}>
        {({ id, ...aria }) => (
          <Select value={siteId} onValueChange={escolherLocal}>
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o local" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Destino"
        required
        id="retirar-destination"
        error={err.erros.destination}
        hint={
          destino === "venda"
            ? "Registrar a saída não registra a venda: o dinheiro entra quando a venda existir."
            : undefined
        }
      >
        {({ id, ...aria }) => (
          <Select
            value={destino}
            onValueChange={(v) => {
              setDestino(v as MilkDestination);
              err.limparCampo("destination");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Para onde foi" />
            </SelectTrigger>
            <SelectContent>
              {DESTINOS.map((d) => (
                <SelectItem key={d} value={d}>
                  {DESTINO_LABEL[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label="Quanto saiu de cada dono"
        required
        id="retirar-itens"
        error={err.erros.itens}
        hint={
          siteId
            ? `Total informado: ${formatar(total)} L.`
            : "Escolha o local para ver os donos com leite lá."
        }
      >
        {({ id }) => (
          <div id={id} className="space-y-2">
            {siteId && posicoes.length === 0 && (
              <p className="text-sm text-texto-secundario">
                Não há leite neste local agora.
              </p>
            )}
            {posicoes.map((p) => {
              const chave = p.owner_id ?? "-";
              return (
                <div key={chave} className="flex items-center gap-2">
                  <span className="w-32 shrink-0 truncate text-sm text-texto">{p.owner_name}</span>
                  <MoneyInput
                    kind="quantidade"
                    unit="L"
                    hideEcho
                    aria-label={`Litros de ${p.owner_name}`}
                    value={valores[chave] ?? ""}
                    onValueChange={(v) => {
                      setValores((atuais) => ({ ...atuais, [chave]: v }));
                      err.limparCampo("itens");
                    }}
                  />
                  <span className="w-24 shrink-0 text-right text-xs text-texto-discreto">
                    de {formatar(p.liters)} L
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="Data" required id="retirar-occurred_at" error={err.erros.occurred_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              err.limparCampo("occurred_at");
            }}
          />
        )}
      </Field>

      <Field label="Observação" id="retirar-notes" error={err.erros.notes} hint="Opcional.">
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
