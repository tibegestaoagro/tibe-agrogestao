"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { Field } from "@/components/ui/field";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { reaisBr } from "@/lib/numero-br";
import { codigoParaBusca } from "@/lib/emporio/codigo-de-barras";
import { pctBr } from "./formato";
import { FraseDaAutorizacao, PedidoDeAutorizacao } from "./autorizacao-gestor";
import {
  apresentacaoDoCodigo,
  normalizar,
  produtoCasaBusca,
  type ApresentacaoVenda,
  type CampoDaVenda,
  type EstadoDaVenda,
  type ProdutoVenda,
} from "./venda-estado";

const MAX_RESULTADOS = 8;

/**
 * A busca e as linhas dos itens. O `id` do `Field` é `items`, o nome da API.
 */
export function CamposDosItens({
  v,
  produtos,
  erros,
  idDe,
  limpar,
  teclaDaBusca,
}: {
  v: EstadoDaVenda;
  produtos: ProdutoVenda[];
  erros: Partial<Record<CampoDaVenda, string>>;
  idDe: (campo: CampoDaVenda) => string;
  limpar: (campo: CampoDaVenda) => void;
  /** A tecla do atalho da busca (um `TeclaDoAtalho`), posta ao lado do campo; sem ela, nada muda. */
  teclaDaBusca?: ReactNode;
}) {
  const [busca, setBusca] = useState("");
  // O produto que não entrou no carrinho por falta de preço na loja (Q328).
  const [semPrecoDe, setSemPrecoDe] = useState<string | null>(null);
  const termo = normalizar(busca);
  const resultados =
    termo === ""
      ? []
      : produtos.filter((p) => p.apresentacoes.length > 0 && produtoCasaBusca(p, termo)).slice(0, MAX_RESULTADOS);

  // Só dígitos (8 a 14) que não casam com apresentação nenhuma: o aviso do leitor, no lugar do "nome".
  const buscaEhCodigo = codigoParaBusca(busca) !== null;

  function escolher(p: ProdutoVenda, apresentacao?: ApresentacaoVenda) {
    const entrou = v.adicionarProduto(p, apresentacao);
    setSemPrecoDe(entrou ? null : p.name);
    limpar("items");
    setBusca("");
  }
  const campoDeBusca = (
    <Input
      type="search"
      aria-label="Buscar produto"
      data-atalho="busca"
      placeholder="Buscar por nome, marca ou código"
      autoComplete="off"
      value={busca}
      onChange={(e) => setBusca(e.target.value)}
      onKeyDown={(e) => {
        // Enter no campo de busca não pode fechar a venda: com um só resultado, ele escolhe.
        if (e.key !== "Enter") return;
        e.preventDefault();
        // O Ctrl+Enter é do atalho de fechar (`atalhos-do-balcao`): aqui não lê nem escolhe.
        if (e.ctrlKey) return;
        // O leitor digita o código e manda Enter: o código exato entra na apresentação lida,
        // antes de qualquer resultado da busca por texto (que escolheria a padrão).
        const codigo = codigoParaBusca(busca);
        const lido = codigo ? apresentacaoDoCodigo(produtos, codigo) : null;
        if (lido) {
          escolher(lido.produto, lido.apresentacao);
          return;
        }
        if (resultados.length === 1) escolher(resultados[0]);
      }}
    />
  );
  return (
    <Field label="Produtos" required id={idDe("items")} error={erros.items}>
      {({ id, ...aria }) => (
        <div id={id} tabIndex={-1} {...aria} className="space-y-3">
          {teclaDaBusca ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">{campoDeBusca}</div>
              {teclaDaBusca}
            </div>
          ) : (
            campoDeBusca
          )}

          {termo !== "" && (
            <div className="space-y-1">
              {resultados.length === 0 ? (
                <p className="text-sm text-texto-secundario">
                  {buscaEhCodigo ? `Nenhum produto com o código ${busca.trim()}.` : "Nenhum produto com esse nome."}
                </p>
              ) : (
                resultados.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => escolher(p)}
                    className="flex min-h-11 w-full items-center justify-between rounded-lg border border-borda bg-superficie-afundada px-3 py-2 text-left text-sm text-texto hover:border-borda-forte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria-tinta"
                  >
                    <span>{p.name}</span>
                    <span className="text-xs text-texto-secundario">Adicionar</span>
                  </button>
                ))
              )}
            </div>
          )}

          {semPrecoDe && (
            <p role="status" className="rounded-md bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
              {semPrecoDe}: sem preço nesta loja. Cadastre o preço antes de vender.
            </p>
          )}

          {v.linhas.length === 0 && termo === "" && (
            <p className="text-sm text-texto-secundario">Busque o produto e toque nele para adicionar.</p>
          )}

          {v.linhas.map((l, n) => (
            <div key={l.linha.key} className="space-y-2 rounded-lg border border-borda bg-superficie-afundada p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-texto">{l.produto?.name ?? "Produto"}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover ${l.produto?.name ?? "item"}`}
                  onClick={() => {
                    v.removerItem(l.linha.key);
                    limpar("items");
                  }}
                >
                  Remover
                </Button>
              </div>

              {l.produto && l.produto.apresentacoes.length > 1 && (
                <Select
                  value={l.linha.apresentacaoId}
                  onValueChange={(valor) => {
                    v.atualizarItem(l.linha.key, { apresentacaoId: valor });
                    limpar("items");
                  }}
                >
                  <SelectTrigger aria-label={`Apresentação do item ${n + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {l.produto.apresentacoes.map((a) => (
                      <SelectItem key={a.id} value={a.id} disabled={!v.temPreco(a.id)}>
                        {a.name}
                        {v.temPreco(a.id) ? "" : " (sem preço nesta loja)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {l.produto && l.produto.apresentacoes.length === 1 && (
                <p className="text-xs text-texto-secundario">{l.apresentacao?.name}</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <MoneyInput
                  kind="quantidade"
                  hideEcho
                  aria-label={`Quantidade do item ${n + 1}`}
                  placeholder="Quantidade"
                  value={l.linha.qtd}
                  onValueChange={(valor) => {
                    v.atualizarItem(l.linha.key, { qtd: valor });
                    limpar("items");
                  }}
                />
                {l.linha.daOriginal ? (
                  // A linha da venda editada mantém o preço da original: o desconto novo entra por um item novo.
                  <p className="self-center text-sm text-texto-secundario">Preço da venda original</p>
                ) : (
                  <MoneyInput
                    kind="quantidade"
                    unit="%"
                    hideEcho
                    aria-label={`Desconto do item ${n + 1} (%)`}
                    placeholder="Desconto (%)"
                    value={l.linha.desconto}
                    onValueChange={(valor) => {
                      v.atualizarItem(l.linha.key, { desconto: valor });
                      limpar("items");
                      limpar("discount_authorization");
                    }}
                  />
                )}
              </div>

              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="text-texto-secundario">
                  {l.semPreco
                    ? "Sem preço nesta loja"
                    : l.unitCent === 0
                      ? "Brinde"
                      : l.doOrcamento !== null && !l.linha.daOriginal
                        ? `Preço do orçamento ${reaisBr(l.doOrcamento)}`
                        : `Preço ${reaisBr((l.preco ?? 0))}`}
                  {l.pct > 0 && l.unitCent !== null && l.unitCent > 0 ? `, com ${pctBr(l.pct)} de desconto: ${reaisBr(l.unitCent / 100)}` : ""}
                </span>
                <strong className="text-texto">{l.totalCent === 0 && l.valida ? "Brinde" : reaisBr(l.totalCent / 100)}</strong>
              </div>
              {l.descontoCent > 0 && (
                <p className="text-sm text-atencao-tinta">
                  Desconto de {reaisBr(l.descontoCent / 100)} neste item.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Field>
  );
}

/** O bloco da autorização: aparece quando o desconto pede uma, quando há uma valendo ou quando o servidor recusou. */
export function CampoDaAutorizacao({
  v,
  erros,
  idDe,
  limpar,
  autorizacaoHerdada,
}: {
  v: EstadoDaVenda;
  erros: Partial<Record<CampoDaVenda, string>>;
  idDe: (campo: CampoDaVenda) => string;
  limpar: (campo: CampoDaVenda) => void;
  autorizacaoHerdada?: boolean;
}) {
  const mostrar =
    v.autorizacaoValida !== null ||
    (v.precisaDeAutorizacao && !autorizacaoHerdada) ||
    !!erros.discount_authorization ||
    v.pedidoAberto;
  if (!mostrar) return null;
  return (
    <Field label="Autorização do desconto" id={idDe("discount_authorization")} error={erros.discount_authorization}>
      {({ id, ...aria }) => (
        <div id={id} tabIndex={-1} {...aria} className="space-y-2">
          {v.autorizacaoValida ? (
            <FraseDaAutorizacao autorizacao={v.autorizacaoValida} />
          ) : v.descontoCent > 0 && (v.precisaDeAutorizacao || !!erros.discount_authorization || v.pedidoAberto) ? (
            <p className="text-sm text-atencao-tinta">
              O desconto de {pctBr(v.pctParaAutorizar)} passa do limite desta loja ({pctBr(v.limitePct)}). O gestor da loja
              precisa autorizar com o PIN dele.
            </p>
          ) : null}
          {v.loja !== "" && (
            <PedidoDeAutorizacao
              lojaId={v.loja}
              pct={v.pctParaAutorizar}
              aberto={v.pedidoAberto}
              aoMudarAberto={v.definirPedidoAberto}
              rotulo={v.autorizacaoValida ? "Pedir de novo" : "Pedir autorização do gestor"}
              aoAutorizar={(a) => {
                v.guardarAutorizacao(a);
                limpar("items");
                limpar("discount_authorization");
              }}
            />
          )}
        </div>
      )}
    </Field>
  );
}
