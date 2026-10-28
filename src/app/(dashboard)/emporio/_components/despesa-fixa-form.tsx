"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPatch, apiPost } from "@/lib/client-api";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { paraCampo, pctBr } from "./formato";
import { RATEIO_ROTULO } from "./venda-rotulos";

// Ordem visual, de cima para baixo. Os nomes são os da API (`fixed-expenses`).
const ORDEM = ["name", "category", "amount", "due_day", "starts_on", "split_kind", "splits"] as const;
type Campo = (typeof ORDEM)[number];

const cent = (n: number) => Math.round(Number((n * 100).toPrecision(12)));

export type DespesaFixaParaEditar = {
  id: string;
  name: string;
  category: string;
  amount: number;
  due_day: number;
  split_kind: "percentual" | "valor";
  splits: { establishment_id: string; value: number }[];
};

/**
 * Despesa fixa mensal (OWNER e ADMIN, Q25 e Q100). O mesmo painel cria e
 * altera. Ao alterar, o rateio inteiro vai de novo, porque mudar o valor ou o
 * tipo de divisão sem o rateio novo deixaria o antigo incoerente.
 *
 * O rateio é uma linha por loja: a loja que fica em branco não entra.
 */
export function DespesaFixaForm({
  lojas,
  mesesDeInicio,
  mesAtual,
  despesa,
}: {
  lojas: { id: string; name: string }[];
  /** "AAAA-MM" e o nome do mês, vindos do servidor (o início não aceita data solta). */
  mesesDeInicio: { valor: string; rotulo: string }[];
  mesAtual: string;
  despesa?: DespesaFixaParaEditar;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `fixa-${despesa?.id ?? "nova"}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const inicial = () => ({
    nome: despesa?.name ?? "",
    // A categoria que o servidor devolve é o próprio nome quando a pessoa não escreveu uma.
    categoria: despesa && despesa.category !== despesa.name ? despesa.category : "",
    valor: despesa ? paraCampo(despesa.amount) : "",
    dia: despesa ? String(despesa.due_day) : "",
    inicio: mesAtual,
    tipo: (despesa?.split_kind ?? "percentual") as "percentual" | "valor",
    partes: Object.fromEntries(
      lojas.map((l) => {
        const s = despesa?.splits.find((x) => x.establishment_id === l.id);
        const sozinha = !despesa && lojas.length === 1;
        return [l.id, s ? paraCampo(s.value) : sozinha ? "100" : ""];
      }),
    ) as Record<string, string>,
  });
  const [f, setF] = useState(inicial);
  const set = (parcial: Partial<ReturnType<typeof inicial>>) => setF((a) => ({ ...a, ...parcial }));

  const valor = lerNumeroBr(f.valor);
  const preenchidas = lojas.filter((l) => f.partes[l.id]?.trim());
  const somaCent = preenchidas.reduce((t, l) => t + cent(lerNumeroBr(f.partes[l.id]) ?? 0), 0);
  const alvoCent = f.tipo === "percentual" ? 10000 : valor !== null ? cent(valor) : null;
  const faltaCent = alvoCent === null ? null : alvoCent - somaCent;
  const fmt = (c: number) => (f.tipo === "percentual" ? pctBr(c / 100) : reaisBr(c / 100));

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!f.nome.trim()) novos.name = "Dê um nome à despesa.";
    if (valor === null || valor <= 0) novos.amount = "O valor da despesa deve ser maior que zero.";
    const dia = lerNumeroBr(f.dia);
    if (dia === null || !Number.isInteger(dia) || dia < 1 || dia > 31) novos.due_day = "O dia do vencimento deve ser de 1 a 31.";
    if (!despesa && !f.inicio) novos.starts_on = "Escolha o mês em que a despesa começa.";

    const splits: { establishment_id: string; value: number }[] = [];
    let partesRuins = false;
    for (const l of preenchidas) {
      const v = lerNumeroBr(f.partes[l.id]);
      if (v === null || v <= 0) partesRuins = true;
      else splits.push({ establishment_id: l.id, value: v });
    }
    if (preenchidas.length === 0) novos.splits = "Escolha ao menos uma loja para a despesa.";
    else if (partesRuins) novos.splits = "A parte de cada loja deve ser um número maior que zero.";
    else if (faltaCent !== null && faltaCent !== 0) {
      novos.splits =
        f.tipo === "percentual"
          ? `Os percentuais somam ${pctBr(somaCent / 100)}: precisam fechar 100%.`
          : `As partes somam ${reaisBr(somaCent / 100)}: precisam fechar o valor da despesa (${reaisBr((alvoCent ?? 0) / 100)}).`;
    }
    if (Object.keys(novos).length > 0 || valor === null || dia === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const corpo = {
      name: f.nome.trim(),
      category: f.categoria.trim() || null,
      amount: valor,
      due_day: dia,
      split_kind: f.tipo,
      splits,
    };
    const res = despesa
      ? await apiPatch(`/api/v1/emporio/fixed-expenses/${despesa.id}`, corpo)
      : await apiPost("/api/v1/emporio/fixed-expenses", { ...corpo, starts_on: `${f.inicio}-01` });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(despesa ? "Despesa atualizada." : "Despesa cadastrada, com os próximos 12 meses gerados.");
    setOpen(false);
    if (!despesa) setF(inicial());
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        despesa ? (
          <Button variant="outline" size="sm">
            Editar
          </Button>
        ) : (
          <Button>Nova despesa fixa</Button>
        )
      }
      title={despesa ? "Editar despesa fixa" : "Nova despesa fixa"}
      description={
        despesa
          ? "Muda as contas dos meses que faltam e ainda não foram pagas. O que já foi pago não muda."
          : "Gera a conta a pagar dos próximos 12 meses, uma por loja."
      }
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setF(inicial());
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={despesa ? "Salvar despesa" : "Cadastrar despesa"}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Nome" required id={err.idDe("name")} error={err.erros.name} hint="Ex: Aluguel, Contador, Internet.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={f.nome}
            maxLength={80}
            onChange={(e) => {
              set({ nome: e.target.value });
              err.limparCampo("name");
            }}
          />
        )}
      </Field>

      <Field label="Categoria" id={err.idDe("category")} error={err.erros.category} hint="Se ficar em branco, usa o nome.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={f.categoria}
            onChange={(e) => {
              set({ categoria: e.target.value });
              err.limparCampo("category");
            }}
          />
        )}
      </Field>

      <Field label="Valor por mês" required id={err.idDe("amount")} error={err.erros.amount}>
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            value={f.valor}
            onValueChange={(v) => {
              set({ valor: v });
              err.limparCampo("amount");
            }}
          />
        )}
      </Field>

      <Field
        label="Dia do vencimento"
        required
        id={err.idDe("due_day")}
        error={err.erros.due_day}
        hint="De 1 a 31. Em mês mais curto, vence no último dia."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            kind="quantidade"
            hideEcho
            value={f.dia}
            onValueChange={(v) => {
              set({ dia: v });
              err.limparCampo("due_day");
            }}
          />
        )}
      </Field>

      {!despesa && (
        <Field label="Começa em" required id={err.idDe("starts_on")} error={err.erros.starts_on}>
          {({ id, ...aria }) => (
            <Select
              value={f.inicio}
              onValueChange={(v) => {
                set({ inicio: v });
                err.limparCampo("starts_on");
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {mesesDeInicio.map((m) => (
                  <SelectItem key={m.valor} value={m.valor}>
                    {m.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
      )}

      <Field label="Dividir entre as lojas" required id={err.idDe("split_kind")} error={err.erros.split_kind}>
        {({ id, ...aria }) => (
          <Select
            value={f.tipo}
            onValueChange={(v) => {
              set({ tipo: v as "percentual" | "valor", partes: Object.fromEntries(lojas.map((l) => [l.id, ""])) });
              err.limparCampo("split_kind");
              err.limparCampo("splits");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(RATEIO_ROTULO).map(([k, nome]) => (
                <SelectItem key={k} value={k}>
                  {nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field
        label={f.tipo === "percentual" ? "Parte de cada loja (%)" : "Parte de cada loja (R$)"}
        required
        id={err.idDe("splits")}
        error={err.erros.splits}
        hint="Deixe em branco a loja que não participa."
      >
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-2 rounded-md focus-visible:outline-none">
            {lojas.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_8rem] items-center gap-2">
                <label htmlFor={err.idDe("splits") + "-" + l.id} className="truncate text-sm text-texto">
                  {l.name}
                </label>
                <MoneyInput
                  id={err.idDe("splits") + "-" + l.id}
                  kind="quantidade"
                  hideEcho
                  unit={f.tipo === "percentual" ? "%" : undefined}
                  inputMode="decimal"
                  placeholder={f.tipo === "percentual" ? "0" : "0,00"}
                  value={f.partes[l.id] ?? ""}
                  onValueChange={(v) => {
                    set({ partes: { ...f.partes, [l.id]: v } });
                    err.limparCampo("splits");
                  }}
                />
              </div>
            ))}
            <p
              className={`text-sm ${faltaCent === 0 ? "text-sucesso-tinta" : "text-texto-secundario"}`}
              aria-live="polite"
            >
              {faltaCent === null
                ? `Soma: ${fmt(somaCent)}. Informe o valor da despesa para conferir.`
                : faltaCent === 0
                  ? `Soma: ${fmt(somaCent)}. Fechou.`
                  : faltaCent > 0
                    ? `Soma: ${fmt(somaCent)}. Faltam ${fmt(faltaCent)} para fechar.`
                    : `Soma: ${fmt(somaCent)}. Passou ${fmt(-faltaCent)}.`}
            </p>
          </div>
        )}
      </Field>
    </FormSheet>
  );
}
