"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { centavosParaCampo } from "./venda-estado";

// Ordem visual, de cima para baixo.
const ORDEM = ["contact_id", "amount", "kind", "establishment_id"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Receber o fiado de um cliente. O valor pode ser parcial: o servidor abate das
 * vendas mais antigas para as mais novas. `contact_id` não é um campo que a
 * pessoa edita (o cliente é o da linha), mas entra na ordem com o nome dele,
 * para uma recusa sobre o cliente aparecer na tela em vez de sumir.
 */
export function ReceberFiadoForm({
  contatoId,
  contatoNome,
  devidoCent,
  lojas,
}: {
  contatoId: string;
  contatoNome: string;
  devidoCent: number;
  lojas: { id: string; name: string }[];
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `fiado-${contatoId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<{ assinatura: string; key: string } | null>(null);
  const [valor, setValor] = useState(centavosParaCampo(devidoCent));
  const [forma, setForma] = useState("dinheiro");
  const [loja, setLoja] = useState(lojas.length === 1 ? lojas[0].id : "");

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const n = lerNumeroBr(valor);
    if (n === null || n <= 0) novos.amount = "Informe o valor recebido, maior que zero.";
    if (!loja) novos.establishment_id = "Escolha a loja onde o dinheiro entra.";
    if (Object.keys(novos).length > 0 || n === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    const assinatura = JSON.stringify([contatoId, n, forma, loja]);
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, key: crypto.randomUUID() };
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/receivables/receive", {
      operation_key: chave.current.key,
      contact_id: contatoId,
      establishment_id: loja,
      amount: n,
      kind: forma,
    });
    setLoading(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    aviso.sucesso(`Recebido ${reaisBr(n)} de ${contatoNome}.`);
    setOpen(false);
    router.refresh();
  }

  return (
    <FormSheet
      trigger={<Button size="sm">Receber</Button>}
      title="Receber fiado"
      description="O valor abate das vendas mais antigas primeiro. Pode ser parcial."
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setValor(centavosParaCampo(devidoCent));
        if (!o) err.limparTudo();
      }}
      onSubmit={submit}
      submitLabel="Registrar recebimento"
      pending={loading}
      error={err.global}
      focarCampoId={err.focarCampoId}
      tentativa={err.tentativa}
    >
      <Field label="Cliente" id={err.idDe("contact_id")} error={err.erros.contact_id}>
        {({ id, ...aria }) => (
          <p id={id} tabIndex={-1} {...aria} className="text-base font-medium text-texto">
            {contatoNome}{" "}
            <span className="text-sm font-normal text-texto-secundario">deve {reaisBr(devidoCent / 100)}</span>
          </p>
        )}
      </Field>

      <Field label="Valor recebido (R$)" required id={err.idDe("amount")} error={err.erros.amount}>
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

      <Field label="Como o cliente pagou" required id={err.idDe("kind")} error={err.erros.kind}>
        {({ id, ...aria }) => (
          <Select
            value={forma}
            onValueChange={(v) => {
              setForma(v);
              err.limparCampo("kind");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dinheiro">Dinheiro (entra na gaveta da loja)</SelectItem>
              <SelectItem value="pix">PIX (entra na conta PIX da loja)</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      <Field label="Loja que recebe" required id={err.idDe("establishment_id")} error={err.erros.establishment_id}>
        {({ id, ...aria }) => (
          <Select
            value={loja}
            onValueChange={(v) => {
              setLoja(v);
              err.limparCampo("establishment_id");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Escolha" />
            </SelectTrigger>
            <SelectContent>
              {lojas.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </FormSheet>
  );
}
