"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { apiGet } from "@/lib/client-api";
import { reaisBr } from "@/lib/numero-br";
import type { OrcamentoView } from "@/lib/actions/emporio-orcamentos";
import { CONSUMIDOR_FINAL } from "@/lib/contatos/cadastro";
import { consumidorFinalEscolhido, type ClienteEscolhido } from "@/lib/emporio/cliente-escolhido";
import { numeroBr, paraCampo, UNIDADE_BASE_SUFIXO } from "./formato";
import type { CargaDoOrcamento, ProdutoVenda } from "./venda-estado";

/**
 * As peças do orçamento no balcão (entrega 4): o seletor Venda | Orçamento, o
 * orçamento carregado para faturar, a observação e o resumo do orçamento salvo.
 * Não escrevem nada: quem envia é o `Balcao`, e as recusas chegam pelo
 * `useErrosDeFormulario` dele (os ids são os nomes da API: `number`, `quote_id`, `notes`).
 */

export type ModoDoBalcao = "venda" | "orcamento";

/** "2026-11-12" vira "12/11/2026". */
export function dataBr(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/**
 * O orçamento como carga do carrinho, com as contas do servidor: o preço de cada
 * item é o `preco_que_vale`, e o desconto se mede contra o `preco_de_referencia`.
 * A mesma apresentação em duas linhas vale a mais barata de cada um, como na
 * action. Sem preço que valha (vencido e sem preço hoje), o item entra sem preço.
 */
export function cargaDoOrcamento(q: OrcamentoView, consumidorFinal: { id: string }): CargaDoOrcamento {
  const referencia: Record<string, number> = {};
  const vale: Record<string, number> = {};
  const menor = (mapa: Record<string, number>, chave: string, valor: number | null) => {
    if (valor === null) return;
    mapa[chave] = mapa[chave] === undefined ? valor : Math.min(mapa[chave], valor);
  };
  // Vencido, o servidor aplica a regra normal: os itens ficam no preço da loja.
  for (const i of q.situacao === "vencido" ? [] : q.items) {
    menor(referencia, i.presentation_id, i.preco_de_referencia);
    menor(vale, i.presentation_id, i.preco_que_vale);
  }
  return {
    referencia,
    vale,
    itens: q.items.map((i) => ({
      produtoId: i.emporio_product_id,
      apresentacaoId: i.presentation_id,
      qtd: paraCampo(i.quantity),
    })),
    cliente: q.customer.id ? clienteDoOrcamento(q.customer, consumidorFinal) : null,
  };
}

/** O cliente do orçamento como escolhido: o orçamento só traz nome, telefone e documento; o resto fica nulo. */
function clienteDoOrcamento(c: OrcamentoView["customer"], consumidorFinal: { id: string }): ClienteEscolhido {
  const fixo = c.id === consumidorFinal.id;
  return {
    ...consumidorFinalEscolhido({ id: c.id, name: c.name }),
    phone: c.phone,
    document: c.document,
    fixed: fixo,
    system_key: fixo ? CONSUMIDOR_FINAL.system_key : null,
  };
}

export function SeletorDeModo({ modo, aoMudar }: { modo: ModoDoBalcao; aoMudar: (m: ModoDoBalcao) => void }) {
  const opcoes: { valor: ModoDoBalcao; rotulo: string }[] = [
    { valor: "venda", rotulo: "Venda" },
    { valor: "orcamento", rotulo: "Orçamento" },
  ];
  return (
    <div role="group" aria-label="O que registrar" className="grid grid-cols-2 gap-1 rounded-lg border border-borda bg-superficie p-1 shadow-sm">
      {opcoes.map((o) => (
        <Button
          key={o.valor}
          type="button"
          variant={modo === o.valor ? "default" : "ghost"}
          aria-pressed={modo === o.valor}
          onClick={() => aoMudar(o.valor)}
        >
          {o.rotulo}
        </Button>
      ))}
    </div>
  );
}

type CampoDoOrcamento = "number" | "quote_id";

/**
 * Na Venda: o campo "Orçamento nº" com Carregar e, carregado, a faixa do
 * orçamento com os avisos (vencido, preço que mudou, estoque que falta).
 */
export function OrcamentoNaVenda({
  loja,
  orcamento,
  produtos,
  erros,
  idDe,
  limpar,
  reprovar,
  aoRecusar,
  aoCarregar,
  aoTirar,
}: {
  loja: string;
  orcamento: OrcamentoView | null;
  produtos: ProdutoVenda[];
  erros: Partial<Record<CampoDoOrcamento, string>>;
  idDe: (campo: CampoDoOrcamento) => string;
  limpar: (campo: CampoDoOrcamento) => void;
  reprovar: (novos: Partial<Record<CampoDoOrcamento, string>>) => void;
  aoRecusar: (res: { code: string; message: string; field?: string }) => void;
  aoCarregar: (q: OrcamentoView) => void;
  aoTirar: () => void;
}) {
  const [numero, setNumero] = useState("");
  const [buscando, setBuscando] = useState(false);

  if (!loja) return null;

  async function carregar() {
    if (buscando) return;
    const digitos = numero.replace(/\D/g, "");
    if (!digitos) {
      reprovar({ number: "Informe o número do orçamento." });
      return;
    }
    setBuscando(true);
    const res = await apiGet<OrcamentoView>(
      `/api/v1/emporio/quotes/lookup?establishment_id=${encodeURIComponent(loja)}&number=${digitos}`,
    );
    setBuscando(false);
    if (!res.ok) {
      aoRecusar(res);
      return;
    }
    if (res.data.situacao === "faturado" && res.data.sale) {
      // A mesma frase do servidor (`QUOTE_ALREADY_INVOICED`): não há o que faturar.
      reprovar({ number: `Este orçamento já foi faturado na venda nº ${res.data.sale.numero}.` });
      return;
    }
    setNumero("");
    aoCarregar(res.data);
  }

  if (!orcamento) {
    return (
      <Field
        label="Orçamento nº"
        id={idDe("number")}
        error={erros.number}
        hint="Para faturar um orçamento salvo, digite o número dele."
      >
        {({ id, ...aria }) => (
          <div className="flex gap-2">
            <Input
              id={id}
              {...aria}
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex.: 000012"
              value={numero}
              onChange={(e) => {
                setNumero(e.target.value);
                limpar("number");
              }}
              onKeyDown={(e) => {
                // Enter aqui carrega o orçamento; não pode fechar a venda.
                if (e.key !== "Enter") return;
                e.preventDefault();
                void carregar();
              }}
            />
            <Button type="button" variant="outline" disabled={buscando} onClick={() => void carregar()}>
              {buscando ? "Buscando..." : "Carregar"}
            </Button>
          </div>
        )}
      </Field>
    );
  }

  const unidadeDe = (produtoId: string) => {
    const unidade = produtos.find((p) => p.id === produtoId)?.base_unit;
    return unidade ? (UNIDADE_BASE_SUFIXO[unidade] ?? unidade) : "";
  };
  const avisos: string[] = [];
  for (const i of orcamento.items) {
    const nome = `${i.produto} (${i.apresentacao})`;
    if (i.mudou) {
      avisos.push(
        i.preco_que_vale === null
          ? `${nome}: O preço mudou: orçado ${reaisBr(i.preco_orcado)}, hoje não há preço nesta loja.`
          : `${nome}: O preço mudou: orçado ${reaisBr(i.preco_orcado)}, hoje vale ${reaisBr(i.preco_que_vale)}.`,
      );
    }
    if (i.falta) {
      avisos.push(`${nome}: Falta estoque: há ${`${numeroBr(i.saldo_base)} ${unidadeDe(i.emporio_product_id)}`.trim()} na loja.`);
    }
  }

  return (
    <Field label="Orçamento" id={idDe("quote_id")} error={erros.quote_id}>
      {({ id, ...aria }) => (
        <div id={id} tabIndex={-1} {...aria} className="space-y-2 rounded-lg bg-info-suave p-3 text-sm text-info-tinta">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-semibold">Faturando o orçamento nº {orcamento.numero}</p>
              <p>
                Cliente {orcamento.customer.name}
                {orcamento.seller_name ? `, vendedor ${orcamento.seller_name}` : ""}. Válido até{" "}
                {dataBr(orcamento.valid_until)}.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                aoTirar();
                limpar("quote_id");
              }}
            >
              Tirar orçamento
            </Button>
          </div>
          {/* Ao tentar fechar a venda, a mesma frase vem como a recusa do campo: não repete. */}
          {orcamento.situacao === "faturado" && orcamento.sale && !erros.quote_id && (
            <p className="rounded-md bg-perigo-suave px-3 py-2 text-perigo-tinta">
              Este orçamento já foi faturado na venda nº {orcamento.sale.numero}.
            </p>
          )}
          {orcamento.situacao === "vencido" && (
            <p className="rounded-md bg-atencao-suave px-3 py-2 text-atencao-tinta">
              Orçamento vencido em {dataBr(orcamento.valid_until)}: vale o preço de hoje.
            </p>
          )}
          {avisos.length > 0 && (
            <ul className="space-y-1 rounded-md bg-atencao-suave px-3 py-2 text-atencao-tinta">
              {avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}

const CLASSE_TEXTAREA =
  "flex min-h-20 w-full rounded-lg border border-borda-campo bg-superficie px-3 py-2 text-base shadow-sm " +
  "transition-colors placeholder:text-texto-discreto sm:text-sm " +
  "focus-visible:outline-none focus-visible:border-primaria-tinta focus-visible:ring-2 focus-visible:ring-primaria-tinta/40";

export function ObservacaoDoOrcamento({
  id: campoId,
  valor,
  erro,
  aoMudar,
}: {
  id: string;
  valor: string;
  erro?: string;
  aoMudar: (valor: string) => void;
}) {
  return (
    <Field label="Observação" id={campoId} error={erro}>
      {({ id, ...aria }) => (
        <textarea
          id={id}
          {...aria}
          rows={2}
          className={CLASSE_TEXTAREA}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )}
    </Field>
  );
}

const LINK = "inline-block font-medium underline";

/** O orçamento salvo: número, validade, os dois papéis e o que fazer em seguida. */
export function ResumoDoOrcamento({
  orcamento,
  aoFaturar,
  aoNovo,
}: {
  orcamento: OrcamentoView;
  aoFaturar: () => void;
  aoNovo: () => void;
}) {
  return (
    <section role="status" className="space-y-2 rounded-lg border border-borda bg-sucesso-suave p-4 text-sm text-sucesso-tinta">
      <p className="font-semibold">
        Orçamento nº {orcamento.numero} salvo, válido até {dataBr(orcamento.valid_until)}
      </p>
      <p>
        {reaisBr(orcamento.net_amount)}, cliente {orcamento.customer.name}
        {orcamento.seller_name ? `, vendedor ${orcamento.seller_name}` : ""}
      </p>
      <p>
        {orcamento.items
          .map((i) => `${numeroBr(i.quantity)} × ${i.produto} (${i.apresentacao})`)
          .join("; ")}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a href={`/emporio/imprimir/orcamento/${orcamento.id}?formato=a4`} target="_blank" rel="noopener noreferrer" className={LINK}>
          Imprimir A4
        </a>
        <a
          href={`/emporio/imprimir/orcamento/${orcamento.id}?formato=cupom`}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK}
        >
          Imprimir cupom
        </a>
        <Button type="button" size="sm" onClick={aoFaturar}>
          Faturar agora
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={aoNovo}>
          Novo atendimento
        </Button>
      </div>
    </section>
  );
}
