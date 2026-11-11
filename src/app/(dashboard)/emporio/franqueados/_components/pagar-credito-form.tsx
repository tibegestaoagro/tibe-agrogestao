"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { FormSheet } from "@/components/ui/form-sheet";
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";
import { reaisBr } from "@/lib/numero-br";
import { CaixaDaOperacao } from "../../_components/caixa-da-operacao";
import { abertosDaLoja, caixaInicial, type CaixaDaLoja } from "../../_components/caixas-da-loja";
import type { OrigemDoDinheiro } from "../../_components/pagar-contas-form";

// Ordem VISUAL, nomes da API. `cash_register_id` mora dentro de `paid_from` no corpo, mas a recusa do
// servidor sobre o caixa usa o próprio nome, então o campo só aparece quando precisa.
const ORDEM = ["amount", "paid_at", "paid_from", "cash_register_id", "notes"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Q304: paga parte ou todo o crédito do franqueado, saindo da gaveta do turno da loja ou de uma conta
 * bancária. A `operation_key` nasce com o painel e só troca depois de um pagamento gravado, para o
 * clique repetido não pagar duas vezes.
 */
export function PagarCreditoForm({
  franqueadoId,
  saldo,
  origens,
  caixas,
  usuarioId,
  hoje,
}: {
  franqueadoId: string;
  saldo: number;
  origens: OrigemDoDinheiro[];
  caixas: CaixaDaLoja[];
  usuarioId: string;
  /** "AAAA-MM-DD" de hoje em Brasília, calculado no servidor. */
  hoje: string;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `pagar-franqueado-${franqueadoId}`);
  const chave = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hoje);
  const [origem, setOrigem] = useState("");
  const [caixa, setCaixa] = useState("");
  const [notas, setNotas] = useState("");

  const lojaDaGaveta = origem.startsWith("loja:") ? origem.slice(5) : "";
  const abertos = abertosDaLoja(caixas, lojaDaGaveta);
  const caixaEscolhido = abertos.some((c) => c.id === caixa) ? caixa : caixaInicial(abertos, usuarioId);
  const mostrarCaixa = lojaDaGaveta !== "" && (abertos.length !== 1 || !!err.erros.cash_register_id);

  function mudarAberto(o: boolean) {
    setOpen(o);
    if (!o) {
      err.limparTudo();
      return;
    }
    err.limparTudo();
    chave.current = null;
    setValor("");
    setData(hoje);
    setOrigem("");
    setCaixa("");
    setNotas("");
  }

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const amount = lerValorDoCampo(valor);
    if (amount === null || amount <= 0) novos.amount = "Informe um valor maior que zero.";
    if (!data) novos.paid_at = "Informe a data do pagamento.";
    if (!origem) novos.paid_from = "Diga de onde sai o dinheiro: a gaveta da loja ou uma conta.";
    if (origem && lojaDaGaveta && abertos.length > 1 && !caixaEscolhido) {
      novos.cash_register_id = "Escolha o caixa de onde sai o dinheiro.";
    }
    if (Object.keys(novos).length > 0 || amount === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const [tipo, id] = origem.split(":");
    const res = await apiPost(`/api/v1/emporio/franchisees/${franqueadoId}/payments`, {
      operation_key: (chave.current ??= crypto.randomUUID()),
      amount,
      // Hoje vai sem data (o servidor usa o instante); outro dia vai ao meio-dia de Brasília, para não escorregar de dia.
      ...(data === hoje ? {} : { paid_at: `${data}T12:00:00-03:00` }),
      paid_from:
        tipo === "loja"
          ? { establishment_id: id, cash_register_id: caixaEscolhido || null }
          : { bank_account_id: id },
      notes: notas.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    aviso.sucesso("Pagamento registrado.");
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={
        <Button type="button" size="sm" disabled={saldo <= 0}>
          Pagar crédito
        </Button>
      }
      title="Pagar crédito"
      description="O dinheiro sai da gaveta ou da conta que você escolher. Pagar o crédito não é despesa: só tira do caixa."
      open={open}
      onOpenChange={mudarAberto}
      onSubmit={submit}
      submitLabel="Registrar pagamento"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field
        label="Valor"
        required
        id={err.idDe("amount")}
        error={err.erros.amount}
        hint={`Crédito a pagar agora: ${reaisBr(saldo)}.`}
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

      <Field label="Data do pagamento" required id={err.idDe("paid_at")} error={err.erros.paid_at}>
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            type="date"
            value={data}
            max={hoje}
            onChange={(e) => {
              setData(e.target.value);
              err.limparCampo("paid_at");
            }}
          />
        )}
      </Field>

      <Field label="De onde sai o dinheiro" required id={err.idDe("paid_from")} error={err.erros.paid_from}>
        {({ id, ...aria }) => (
          <Select
            value={origem}
            onValueChange={(v) => {
              setOrigem(v);
              err.limparCampo("paid_from");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a gaveta ou a conta" />
            </SelectTrigger>
            <SelectContent>
              {origens.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>
                  {o.rotulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {mostrarCaixa && (
        <Field
          label="Caixa de onde sai o dinheiro"
          required={abertos.length > 1}
          id={err.idDe("cash_register_id")}
          error={err.erros.cash_register_id}
        >
          {({ id, ...aria }) => (
            <CaixaDaOperacao
              id={id}
              aria={aria}
              abertos={abertos}
              valor={caixaEscolhido}
              aoMudar={(v) => {
                setCaixa(v);
                err.limparCampo("cash_register_id");
              }}
            />
          )}
        </Field>
      )}

      <Field label="Observação" id={err.idDe("notes")} error={err.erros.notes} hint="Opcional.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            autoComplete="off"
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
