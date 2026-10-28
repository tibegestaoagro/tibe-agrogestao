"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { apiPost } from "@/lib/client-api";
import { reaisBr } from "@/lib/numero-br";

// Ordem visual. `entry_ids` é a lista de contas, no topo; `from` e `paid_at` vêm da API.
const ORDEM = ["entry_ids", "from", "paid_at"] as const;
type Campo = (typeof ORDEM)[number];

export type OrigemDoDinheiro = { valor: string; rotulo: string };

/**
 * Paga várias contas de uma vez, saindo da gaveta de uma loja ou de uma conta
 * bancária (Q98). Pagar aqui tira do caixa do Empório; pagar pelo Financeiro
 * não tira (dívida 2.26), e por isso o aviso fica no painel.
 */
export function PagarContasForm({
  contas,
  origens,
  hoje,
  aoPagar,
}: {
  contas: { entry_id: string; name: string; establishment_name: string | null; open_amount: number }[];
  origens: OrigemDoDinheiro[];
  /** "AAAA-MM-DD" de hoje em Brasília, calculado no servidor. */
  hoje: string;
  aoPagar: () => void;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "pagar");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [origem, setOrigem] = useState("");
  const [data, setData] = useState(hoje);

  const totalCent = contas.reduce((s, c) => s + Math.round(c.open_amount * 100), 0);

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (contas.length === 0) novos.entry_ids = "Escolha ao menos uma conta para pagar.";
    if (!origem) novos.from = "Diga de onde sai o dinheiro: uma gaveta ou uma conta.";
    if (!data) novos.paid_at = "Informe a data do pagamento.";
    if (Object.keys(novos).length > 0) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    setLoading(true);
    const [tipo, id] = origem.split(":");
    const res = await apiPost("/api/v1/emporio/payables/pay", {
      entry_ids: contas.map((c) => c.entry_id),
      // Hoje vai sem data (o servidor usa o instante); outro dia vai ao meio-dia de Brasília, para não escorregar de dia.
      paid_at: data === hoje ? null : `${data}T12:00:00-03:00`,
      from: tipo === "loja" ? { establishment_id: id } : { bank_account_id: id },
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    aviso.sucesso(contas.length === 1 ? "Conta paga." : `${contas.length} contas pagas.`);
    setOpen(false);
    aoPagar();
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button disabled={contas.length === 0}>Pagar selecionadas ({contas.length})</Button>}
      title="Pagar contas"
      description="O dinheiro sai da gaveta ou da conta que você escolher, e o pagamento entra no caixa do Empório."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setData(hoje);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel={`Pagar ${reaisBr(totalCent / 100)}`}
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Contas" id={err.idDe("entry_ids")} error={err.erros.entry_ids}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-1 text-sm focus-visible:outline-none">
            {contas.map((c) => (
              <p key={c.entry_id} className="flex justify-between gap-3 text-texto">
                <span className="truncate">
                  {c.name}
                  {c.establishment_name ? `, ${c.establishment_name}` : ""}
                </span>
                <span className="shrink-0">{reaisBr(c.open_amount)}</span>
              </p>
            ))}
            <p className="flex justify-between gap-3 border-t border-borda pt-1 font-semibold text-texto">
              <span>Total</span>
              <span>{reaisBr(totalCent / 100)}</span>
            </p>
          </div>
        )}
      </Field>

      <Field label="De onde sai o dinheiro" required id={err.idDe("from")} error={err.erros.from}>
        {({ id, ...aria }) => (
          <Select
            value={origem}
            onValueChange={(v) => {
              setOrigem(v);
              err.limparCampo("from");
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
    </FormSheet>
  );
}
