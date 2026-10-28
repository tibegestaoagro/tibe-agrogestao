"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useErrosDeFormulario } from "@/components/ui/use-erros-de-formulario";
import { apiGet, apiPost } from "@/lib/client-api";
import { reaisBr } from "@/lib/numero-br";
import { VendaCampos } from "./venda-campos";
import { numeroBr } from "./formato";
import { FORMA_ROTULO } from "./venda-rotulos";
import { useVenda, type PrecosVenda, type ProdutoVenda, type RegraCartaoVenda } from "./venda-estado";

/**
 * O balcão (Q87): a venda de dez segundos. Abre direto na venda, sem lista na
 * frente, e foi desenhado para o celular: alvos de 44px, total e botão de
 * fechar a venda presos no rodapé da tela.
 *
 * Não é um `FormSheet`: o balcão é uma PÁGINA, e abrir um painel lateral por
 * cima de um balcão que já ocupa a tela só adicionaria um toque a cada venda.
 * Os campos (`VendaCampos`) vivem no kit (`Field`), a recusa do servidor cai
 * embaixo do campo certo pelo `useErrosDeFormulario`, e o foco vai para o
 * primeiro campo recusado, como no `FormSheet`.
 *
 * A `operation_key` é uma por venda: reenviar a MESMA venda (falha de rede)
 * reaproveita a chave e devolve a venda já gravada; mexer na venda gera outra.
 */

const ORDEM = ["establishment_id", "items", "contact_id", "payments"] as const;

const CHAVE_LOJA = "tibe:emporio:loja-do-balcao";

type VendaGravada = {
  id: string;
  net_amount: number;
  contact_name: string | null;
  items: { product_name: string; presentation_name: string; quantity: number }[];
  payments: { kind: string; amount: number }[];
};

type Resumo = { venda: VendaGravada; trocoCent: number };

export function Balcao({
  lojas,
  produtos,
  precos,
  contatos,
}: {
  lojas: { id: string; name: string }[];
  produtos: ProdutoVenda[];
  precos: PrecosVenda;
  contatos: { id: string; name: string }[];
}) {
  const err = useErrosDeFormulario(ORDEM);
  const [regras, setRegras] = useState<RegraCartaoVenda[] | null>(null);
  const v = useVenda({ produtos, precos, lojaInicial: lojas.length === 1 ? lojas[0].id : "", regras });
  const [enviando, setEnviando] = useState(false);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const chave = useRef<{ assinatura: string; key: string } | null>(null);

  // A loja da última venda volta sozinha. Lido no efeito, não no estado
  // inicial, para o HTML do servidor e o do navegador não divergirem.
  const { loja, setLoja } = v;
  useEffect(() => {
    if (lojas.length <= 1 || loja !== "") return;
    try {
      const guardada = window.localStorage.getItem(CHAVE_LOJA);
      if (guardada && lojas.some((l) => l.id === guardada)) setLoja(guardada);
    } catch {
      // Armazenamento bloqueado: a pessoa escolhe a loja de novo, sem prejuízo.
    }
  }, [lojas, loja, setLoja]);

  // As taxas de cartão das lojas, só para informar o líquido e avisar antes de
  // enviar. Se a leitura falhar, o balcão segue sem o aviso e o servidor recusa
  // em `payments` a venda no cartão sem taxa.
  useEffect(() => {
    let vivo = true;
    void apiGet<RegraCartaoVenda[]>("/api/v1/emporio/card-fee-rules").then((res) => {
      if (vivo && res.ok) setRegras(res.data);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // O mesmo efeito do FormSheet: leva o foco ao primeiro campo recusado.
  useEffect(() => {
    if (!err.focarCampoId) return;
    const alvo = document.getElementById(err.focarCampoId);
    if (!alvo) return;
    alvo.focus({ preventScroll: true });
    alvo.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [err.focarCampoId, err.tentativa]);

  function lembrarLoja(id: string) {
    try {
      window.localStorage.setItem(CHAVE_LOJA, id);
    } catch {
      // Sem armazenamento, só não lembra.
    }
  }

  async function enviar() {
    const m = v.montar(true);
    if (!m.corpo) {
      err.setGlobal(null);
      err.reprovar(m.novos);
      return;
    }

    err.limparTudo();
    if (chave.current?.assinatura !== m.assinatura) {
      chave.current = { assinatura: m.assinatura, key: crypto.randomUUID() };
    }
    const trocoCent = v.trocoCent;
    setEnviando(true);
    const res = await apiPost<VendaGravada>("/api/v1/emporio/sales", {
      operation_key: chave.current.key,
      ...m.corpo,
    });
    setEnviando(false);
    if (!res.ok) {
      err.doServidor(res);
      return;
    }
    chave.current = null;
    setResumo({ venda: res.data, trocoCent });
    v.reiniciar();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="space-y-4">
      {resumo && (
        <section
          role="status"
          className="space-y-1 rounded-lg border border-borda bg-sucesso-suave p-4 text-sm text-sucesso-tinta"
        >
          <p className="font-semibold">Venda registrada: {reaisBr(resumo.venda.net_amount)}</p>
          <p>
            {resumo.venda.items
              .map((i) => `${numeroBr(i.quantity)} × ${i.product_name} (${i.presentation_name})`)
              .join("; ")}
          </p>
          <p>
            {resumo.venda.payments.map((p) => `${FORMA_ROTULO[p.kind] ?? p.kind} ${reaisBr(p.amount)}`).join(", ")}
            {resumo.venda.contact_name ? `, cliente ${resumo.venda.contact_name}` : ""}
          </p>
          {resumo.trocoCent > 0 && (
            <p className="font-semibold">Troco entregue: {reaisBr(resumo.trocoCent / 100)}</p>
          )}
          <Link href={`/emporio/vendas/${resumo.venda.id}`} className="inline-block font-medium underline">
            Ver a venda
          </Link>
        </section>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          // O painel de "Cliente novo" é filho desta árvore do React: o submit
          // dele sobe até aqui, e não pode fechar a venda.
          if (e.target !== e.currentTarget) return;
          if (enviando) return;
          void enviar();
        }}
        className="space-y-4"
      >
        <div className="rounded-lg border border-borda bg-superficie p-4 shadow-sm">
          <VendaCampos
            v={v}
            produtos={produtos}
            lojas={lojas}
            contatos={contatos}
            erros={err.erros}
            idDe={err.idDe}
            limpar={err.limparCampo}
            permitirClienteNovo
            aoEscolherLoja={lembrarLoja}
          />
        </div>

        <div className="sticky bottom-0 -mx-1 space-y-2 border-t border-borda bg-superficie px-4 py-3 shadow-sm sm:mx-0 sm:rounded-lg sm:border">
          {err.global && (
            <p role="alert" className="rounded-md bg-perigo-suave px-3 py-2 text-sm text-perigo-tinta">
              {err.global}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-texto-secundario">Total da venda</p>
              <p className="text-xl font-semibold text-texto">{reaisBr(v.totalCent / 100)}</p>
            </div>
            <Button type="submit" size="lg" disabled={enviando} className="min-w-40">
              {enviando ? "Registrando..." : "Fechar a venda"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
