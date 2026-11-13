"use client";

import { useEffect, useRef, useState } from "react";
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
import { apiGet, apiPost } from "@/lib/client-api";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { centavosParaCampo, type ContaPixDaLoja } from "./venda-estado";
import { ContaPixSelect } from "./venda-campos";
import { CaixaDaOperacao } from "./caixa-da-operacao";
import { abertosDaLoja, caixaInicial, type CaixaDaLoja } from "./caixas-da-loja";

// Ordem visual, de cima para baixo.
const ORDEM = ["customer_id", "amount", "kind", "establishment_id", "bank_account_id", "cash_register_id"] as const;
type Campo = (typeof ORDEM)[number];

/**
 * Receber o fiado de um cliente. O valor pode ser parcial: o servidor abate das
 * vendas mais antigas para as mais novas. `customer_id` não é um campo que a
 * pessoa edita (o cliente é o da linha), mas entra na ordem com o nome dele,
 * para uma recusa sobre o cliente aparecer na tela em vez de sumir.
 */
export function ReceberFiadoForm({
  contatoId,
  contatoNome,
  devidoCent,
  lojas,
  caixas,
  usuarioId,
  soPix = false,
}: {
  /** O Financeiro não está na loja: recebe por PIX na conta, e o dinheiro é do caixa da loja. */
  soPix?: boolean;
  contatoId: string;
  contatoNome: string;
  devidoCent: number;
  lojas: { id: string; name: string }[];
  caixas: CaixaDaLoja[];
  usuarioId: string;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const err = useErrosDeFormulario(ORDEM, `fiado-${contatoId}`);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const chave = useRef<{ assinatura: string; key: string } | null>(null);
  const [valor, setValor] = useState(centavosParaCampo(devidoCent));
  const [forma, setForma] = useState(soPix ? "pix" : "dinheiro");
  const [loja, setLoja] = useState(lojas.length === 1 ? lojas[0].id : "");
  const [caixa, setCaixa] = useState("");
  // A conta do PIX (Q314): lida da loja escolhida quando a forma é PIX; vem marcada só a padrão ou a única.
  const [contaEscolhida, setContaEscolhida] = useState("");
  const [lidas, setLidas] = useState<{ lojaId: string; lista: ContaPixDaLoja[] } | null>(null);
  useEffect(() => {
    if (!open || forma !== "pix" || !loja) return;
    let vivo = true;
    void apiGet<ContaPixDaLoja[]>(`/api/v1/emporio/establishments/${encodeURIComponent(loja)}/pix-accounts`).then((res) => {
      if (vivo && res.ok) setLidas({ lojaId: loja, lista: res.data });
    });
    return () => {
      vivo = false;
    };
  }, [open, forma, loja]);
  const contas = lidas && lidas.lojaId === loja ? lidas.lista : null;
  const contaDoPix = contas
    ? contas.some((c) => c.id === contaEscolhida)
      ? contaEscolhida
      : ((contas.find((c) => c.is_store_default) ?? (contas.length === 1 ? contas[0] : undefined))?.id ?? "")
    : "";
  // Só o dinheiro entra na gaveta; PIX nunca vê o campo do caixa.
  const abertos = abertosDaLoja(caixas, loja);
  const caixaEscolhido = abertos.some((c) => c.id === caixa) ? caixa : caixaInicial(abertos, usuarioId);
  const mostrarCaixa =
    forma === "dinheiro" && loja !== "" && (abertos.length !== 1 || !!err.erros.cash_register_id);

  async function submit() {
    const novos: Partial<Record<Campo, string>> = {};
    const n = lerNumeroBr(valor);
    if (n === null || n <= 0) novos.amount = "Informe o valor recebido, maior que zero.";
    if (!loja) novos.establishment_id = "Escolha a loja onde o dinheiro entra.";
    else if (forma === "dinheiro" && abertos.length > 1 && !caixaEscolhido) novos.cash_register_id = "Escolha o caixa que recebe.";
    else if (forma === "pix" && contas && !contaDoPix) {
      novos.bank_account_id = contas.length === 0 ? "Nenhuma conta PIX liberada para esta loja." : "Escolha a conta do PIX.";
    }
    if (Object.keys(novos).length > 0 || n === null) {
      err.setGlobal(null);
      err.reprovar(novos);
      return;
    }

    err.limparTudo();
    const contaDaApi = forma === "pix" && contaDoPix ? contaDoPix : null;
    const assinatura = JSON.stringify([contatoId, n, forma, loja, contaDaApi]);
    if (chave.current?.assinatura !== assinatura) chave.current = { assinatura, key: crypto.randomUUID() };
    setLoading(true);
    const res = await apiPost("/api/v1/emporio/receivables/receive", {
      operation_key: chave.current.key,
      customer_id: contatoId,
      establishment_id: loja,
      amount: n,
      kind: forma,
      ...(contaDaApi ? { bank_account_id: contaDaApi } : {}),
      cash_register_id: forma === "dinheiro" && caixaEscolhido ? caixaEscolhido : null,
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
      <Field label="Cliente" id={err.idDe("customer_id")} error={err.erros.customer_id}>
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
              {!soPix && <SelectItem value="dinheiro">Dinheiro (entra na gaveta da loja)</SelectItem>}
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
              setContaEscolhida("");
              err.limparCampo("establishment_id");
              err.limparCampo("bank_account_id");
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

      {forma === "pix" && loja !== "" && contas !== null && (
        <Field label="Conta do PIX" id={err.idDe("bank_account_id")} error={err.erros.bank_account_id}>
          {({ id, ...aria }) => (
            <ContaPixSelect
              id={id}
              aria={aria}
              contas={contas}
              carregadas
              valor={contaDoPix}
              aoMudar={(c) => {
                setContaEscolhida(c);
                err.limparCampo("bank_account_id");
              }}
            />
          )}
        </Field>
      )}

      {mostrarCaixa && (
        <Field
          label="Caixa que recebe"
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
    </FormSheet>
  );
}
