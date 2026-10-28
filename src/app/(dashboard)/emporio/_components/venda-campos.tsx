"use client";

import { useState } from "react";
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
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { ClienteNovoForm } from "./cliente-novo-form";
import { numeroBr, pctBr } from "./formato";
import { FORMA_ROTULO } from "./venda-rotulos";
import {
  ehCartao,
  liquidoDoCartaoCent,
  normalizar,
  type CampoDaVenda,
  type EstadoDaVenda,
  type FormaDePagamento,
  type ProdutoVenda,
} from "./venda-estado";

const SEM_CLIENTE = "__sem_cliente__";
const MAX_RESULTADOS = 8;

/** Na ordem do balcão: o que mais se usa primeiro. */
const FORMAS_DO_BALCAO: FormaDePagamento[] = [
  "dinheiro",
  "pix",
  "debito",
  "credito_vista",
  "credito_parcelado",
  "cheque",
  "fiado",
];
const PARCELAS = Array.from({ length: 11 }, (_, i) => i + 2);

/**
 * Os campos da venda: loja, itens, cliente e pagamento. Não escreve nada e não
 * tem botão de enviar: quem monta a tela (o balcão, a troca) cuida do envio.
 *
 * Os ids dos `Field` são os nomes da API (`establishment_id`, `items`,
 * `contact_id`, `payments`), para a recusa do servidor cair embaixo do campo
 * certo. `prefixoDeId` vem de quem chama, porque o balcão e a troca nunca
 * vivem juntos mas os ids passam pelo mesmo `idDe`.
 */
/**
 * O que o cartão rende, antes de enviar (Q89): a taxa da loja, o líquido e o
 * prazo. Sem taxa cadastrada para a forma, avisa agora em vez de esperar a
 * recusa do servidor. Só informa: quem decide o valor é o campo acima.
 */
function InfoDoCartao({ v, p }: { v: EstadoDaVenda; p: EstadoDaVenda["pagamentos"][number] }) {
  if (!v.loja) return null;
  const regra = v.regraDe(p.kind);
  if (!regra) {
    // `regraDe` devolve null também enquanto as taxas não chegaram: só avisa quando elas chegaram.
    return v.regrasCarregadas ? (
      <p className="rounded-md bg-atencao-suave px-3 py-2 text-xs text-atencao-tinta">
        Esta loja ainda não tem taxa de {FORMA_ROTULO[p.kind].toLowerCase()} cadastrada. Peça ao dono ou a um
        administrador para cadastrar em Caixa, Taxas de cartão.
      </p>
    ) : null;
  }
  const n = lerNumeroBr(p.valor);
  if (n === null || n <= 0) {
    return <p className="text-xs text-texto-secundario">Taxa de {pctBr(regra.fee_pct)} para esta forma.</p>;
  }
  const { liquidoCent } = liquidoDoCartaoCent(Math.round(Number((n * 100).toPrecision(12))), regra.fee_pct);
  const parcelas = p.kind === "credito_parcelado" ? Number(p.parcelas) || 2 : 1;
  const prazo =
    parcelas > 1
      ? `em ${parcelas} parcelas, a primeira em ${numeroBr(regra.days)} dias`
      : `em ${numeroBr(regra.days)} dias`;
  return (
    <p className="text-xs text-texto-secundario">
      Taxa {pctBr(regra.fee_pct)}: você recebe <strong className="text-texto">{reaisBr(liquidoCent / 100)}</strong>{" "}
      {prazo}.
    </p>
  );
}

export function VendaCampos({
  v,
  produtos,
  lojas,
  contatos,
  erros,
  idDe,
  limpar,
  lojaFixa,
  permitirClienteNovo,
  aoEscolherLoja,
}: {
  v: EstadoDaVenda;
  produtos: ProdutoVenda[];
  lojas: { id: string; name: string }[];
  contatos: { id: string; name: string }[];
  erros: Partial<Record<CampoDaVenda, string>>;
  idDe: (campo: CampoDaVenda) => string;
  limpar: (campo: CampoDaVenda) => void;
  /** Troca: a loja é a da venda de origem, não se escolhe. */
  lojaFixa?: boolean;
  permitirClienteNovo?: boolean;
  aoEscolherLoja?: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const termo = normalizar(busca);
  const resultados =
    termo === ""
      ? []
      : produtos.filter((p) => p.apresentacoes.length > 0 && normalizar(p.name).includes(termo)).slice(0, MAX_RESULTADOS);

  const todosContatos = [...contatos, ...v.contatosNovos.filter((n) => !contatos.some((c) => c.id === n.id))];

  function escolher(p: ProdutoVenda) {
    v.adicionarProduto(p);
    limpar("items");
    setBusca("");
  }

  return (
    <div className="space-y-5">
      {!lojaFixa && (
        <Field label="Loja" required id={idDe("establishment_id")} error={erros.establishment_id}>
          {({ id, ...aria }) => (
            <Select
              value={v.loja}
              onValueChange={(valor) => {
                v.setLoja(valor);
                limpar("establishment_id");
                aoEscolherLoja?.(valor);
              }}
            >
              <SelectTrigger id={id} {...aria}>
                <SelectValue placeholder="Escolha a loja" />
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
      )}

      <Field label="Produtos" required id={idDe("items")} error={erros.items}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-3">
            <Input
              type="search"
              aria-label="Buscar produto"
              placeholder="Buscar produto pelo nome"
              autoComplete="off"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                // Enter no campo de busca não pode fechar a venda: com um só resultado, ele escolhe.
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (resultados.length === 1) escolher(resultados[0]);
              }}
            />

            {termo !== "" && (
              <div className="space-y-1">
                {resultados.length === 0 ? (
                  <p className="text-sm text-texto-secundario">Nenhum produto com esse nome.</p>
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
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
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
                  <MoneyInput
                    hideEcho
                    aria-label={`Preço do item ${n + 1} (R$)`}
                    placeholder="Preço (R$)"
                    value={l.linha.preco}
                    onValueChange={(valor) => {
                      v.atualizarItem(l.linha.key, { preco: valor, manual: true });
                      limpar("items");
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="text-texto-secundario">
                    {l.sugerido === null ? "Sem preço cadastrado nesta loja" : `Preço sugerido ${reaisBr(l.sugerido)}`}
                  </span>
                  <strong className="text-texto">{reaisBr(l.totalCent / 100)}</strong>
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

      <Field label="Cliente" id={idDe("contact_id")} error={erros.contact_id} hint="Opcional, menos no fiado.">
        {({ id, ...aria }) => (
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Select
                value={v.contatoId || SEM_CLIENTE}
                onValueChange={(valor) => {
                  v.setContatoId(valor === SEM_CLIENTE ? "" : valor);
                  limpar("contact_id");
                }}
              >
                <SelectTrigger id={id} {...aria}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_CLIENTE}>Sem cliente</SelectItem>
                  {todosContatos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {permitirClienteNovo && (
              <ClienteNovoForm
                onCriado={(c) => {
                  v.contatoCriado(c);
                  limpar("contact_id");
                }}
              />
            )}
          </div>
        )}
      </Field>

      <Field label="Pagamento" required={v.aPagarCent > 0} id={idDe("payments")} error={erros.payments}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {FORMAS_DO_BALCAO.map((k) => (
                <Button
                  key={k}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={k === "fiado" && v.pagamentos.some((p) => p.kind === "fiado")}
                  onClick={() => {
                    v.adicionarPagamento(k);
                    limpar("payments");
                  }}
                >
                  + {FORMA_ROTULO[k]}
                </Button>
              ))}
            </div>

            {v.pagamentos.map((p) => (
              <div key={p.key} className="space-y-2 rounded-lg border border-borda bg-superficie-afundada p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-texto">{FORMA_ROTULO[p.kind]}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover pagamento em ${FORMA_ROTULO[p.kind]}`}
                    onClick={() => {
                      v.removerPagamento(p.key);
                      limpar("payments");
                    }}
                  >
                    Remover
                  </Button>
                </div>
                <MoneyInput
                  hideEcho
                  aria-label={`Valor em ${FORMA_ROTULO[p.kind]} (R$)`}
                  placeholder="Valor (R$)"
                  value={p.valor}
                  onValueChange={(valor) => {
                    v.atualizarPagamento(p.key, { valor });
                    limpar("payments");
                  }}
                />
                {p.kind === "credito_parcelado" && (
                  <div className="space-y-1">
                    <label htmlFor={`parcelas-${p.key}`} className="text-xs text-texto-secundario">
                      Número de parcelas
                    </label>
                    <Select
                      value={p.parcelas}
                      onValueChange={(valor) => {
                        v.atualizarPagamento(p.key, { parcelas: valor });
                        limpar("payments");
                      }}
                    >
                      <SelectTrigger id={`parcelas-${p.key}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PARCELAS.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n}x
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {ehCartao(p.kind) && <InfoDoCartao v={v} p={p} />}
                {p.kind === "cheque" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <label htmlFor={`cheque-numero-${p.key}`} className="text-xs text-texto-secundario">
                        Número do cheque
                      </label>
                      <Input
                        id={`cheque-numero-${p.key}`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={p.chequeNumero}
                        onChange={(e) => {
                          v.atualizarPagamento(p.key, { chequeNumero: e.target.value });
                          limpar("payments");
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={`cheque-banco-${p.key}`} className="text-xs text-texto-secundario">
                        Banco
                      </label>
                      <Input
                        id={`cheque-banco-${p.key}`}
                        autoComplete="off"
                        value={p.chequeBanco}
                        onChange={(e) => {
                          v.atualizarPagamento(p.key, { chequeBanco: e.target.value });
                          limpar("payments");
                        }}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label htmlFor={`cheque-bom-para-${p.key}`} className="text-xs text-texto-secundario">
                        Bom para (data)
                      </label>
                      <Input
                        id={`cheque-bom-para-${p.key}`}
                        type="date"
                        value={p.chequeBomPara}
                        onChange={(e) => {
                          v.atualizarPagamento(p.key, { chequeBomPara: e.target.value });
                          limpar("payments");
                        }}
                      />
                    </div>
                    {!v.contatoId && (
                      <p className="text-xs text-atencao-tinta sm:col-span-2">
                        O cheque precisa de um cliente: escolha acima.
                      </p>
                    )}
                  </div>
                )}
                {p.kind === "fiado" && (
                  <div className="space-y-1">
                    <label htmlFor={`vencimento-${p.key}`} className="text-xs text-texto-secundario">
                      Vence em (opcional)
                    </label>
                    <Input
                      id={`vencimento-${p.key}`}
                      type="date"
                      value={p.vencimento}
                      onChange={(e) => v.atualizarPagamento(p.key, { vencimento: e.target.value })}
                    />
                  </div>
                )}
              </div>
            ))}

            <div className="space-y-1 rounded-lg bg-superficie-afundada px-3 py-2 text-sm" aria-live="polite">
              {v.totalCent > 0 && v.aPagarCent !== v.totalCent && (
                <p className="text-texto-secundario">
                  Valor da troca abatido: {reaisBr((v.totalCent - v.aPagarCent) / 100)}. A pagar:{" "}
                  <strong className="text-texto">{reaisBr(v.aPagarCent / 100)}</strong>
                </p>
              )}
              {v.faltaCent > 0 && v.pagamentos.length > 0 && (
                <p className="text-atencao-tinta">Falta {reaisBr(v.faltaCent / 100)}.</p>
              )}
              {v.trocoCent > 0 && (
                <p className="text-texto">
                  Troco: <strong>{reaisBr(v.trocoCent / 100)}</strong>
                </p>
              )}
              {v.faltaCent === 0 && v.trocoCent === 0 && v.pagamentos.length > 0 && (
                <p className="text-sucesso-tinta">Pagamento fechado.</p>
              )}
              {v.pagamentos.length === 0 && v.aPagarCent > 0 && (
                <p className="text-texto-secundario">Escolha como o cliente vai pagar.</p>
              )}
            </div>
          </div>
        )}
      </Field>

      {v.descontoCent > 0 && (
        <p className="rounded-lg bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
          Desconto total: {reaisBr(v.descontoCent / 100)} ({pctBr(Math.round(v.descontoPct * 100) / 100)} sobre o preço
          sugerido).
        </p>
      )}
    </div>
  );
}
