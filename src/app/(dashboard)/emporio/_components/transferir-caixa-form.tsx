"use client";

import { useRef, useState } from "react";
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
import { apiPost } from "@/lib/client-api";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";

// Ordem visual, de cima para baixo. Os nomes são os da API (`POST cash/transfers`).
const ORDEM = ["from", "to", "amount", "notes"] as const;
type Campo = (typeof ORDEM)[number];

/** Uma ponta do caixa. `valor` é "loja:ID" ou "conta:ID", para caber num Select. */
export type PontaOpcao = { valor: string; rotulo: string };

function paraPonta(valor: string): { establishment_id?: string; bank_account_id?: string } {
  const [tipo, id] = [valor.slice(0, valor.indexOf(":")), valor.slice(valor.indexOf(":") + 1)];
  return tipo === "loja" ? { establishment_id: id } : { bank_account_id: id };
}

/**
 * Transferir dinheiro entre caixas (Q92): da gaveta de uma loja para outra,
 * da gaveta para o banco, entre contas. Não toca no Financeiro: dinheiro só
 * muda de lugar. As contas só aparecem como origem para dono e administrador
 * (a página decide e passa as `origens`).
 */
export function TransferirCaixaForm({ origens, destinos }: { origens: PontaOpcao[]; destinos: PontaOpcao[] }) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, "transferir");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<{ assinatura: string; key: string } | null>(null);
  const [de, setDe] = useState("");
  const [para, setPara] = useState("");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    if (!de) novos.from = "Diga de onde sai o dinheiro.";
    if (!para) novos.to = "Diga para onde vai o dinheiro.";
    else if (para === de) novos.to = "A origem e o destino precisam ser diferentes.";
    const n = lerNumeroBr(valor);
    if (n === null || n <= 0) novos.amount = "O valor da transferência deve ser maior que zero.";
    if (Object.keys(novos).length > 0 || n === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    const assinatura = JSON.stringify([de, para, n, obs.trim()]);
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, key: crypto.randomUUID() };
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/cash/transfers", {
      operation_key: chave.current.key,
      from: paraPonta(de),
      to: paraPonta(para),
      amount: n,
      notes: obs.trim() || null,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    aviso.sucesso(`Transferido ${reaisBr(n)}.`);
    setOpen(false);
    setDe("");
    setPara("");
    setValor("");
    setObs("");
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button>Transferir entre caixas</Button>}
      title="Transferir entre caixas"
      description="O dinheiro sai de um lugar e entra no outro, sem virar receita nem despesa."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Transferir"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="De" required id={err.idDe("from")} error={err.erros.from}>
        {({ id, ...aria }) => (
          <Select
            value={de}
            onValueChange={(v) => {
              setDe(v);
              err.limparCampo("from");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha a origem" />
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

      <Field label="Para" required id={err.idDe("to")} error={err.erros.to}>
        {({ id, ...aria }) => (
          <Select
            value={para}
            onValueChange={(v) => {
              setPara(v);
              err.limparCampo("to");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha o destino" />
            </SelectTrigger>
            <SelectContent>
              {destinos
                .filter((d) => d.valor !== de)
                .map((d) => (
                  <SelectItem key={d.valor} value={d.valor}>
                    {d.rotulo}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Valor (R$)" required id={err.idDe("amount")} error={err.erros.amount}>
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

      <Field label="Observação" id={err.idDe("notes")} error={err.erros.notes} hint="Opcional. Ex: depósito do dia.">
        {({ id, ...aria }) => (
          <Input
            id={id}
            {...aria}
            value={obs}
            onChange={(e) => {
              setObs(e.target.value);
              err.limparCampo("notes");
            }}
          />
        )}
      </Field>
    </FormSheet>
  );
}
