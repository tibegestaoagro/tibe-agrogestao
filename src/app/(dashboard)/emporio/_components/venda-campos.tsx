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
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import { ORIGENS_DA_VENDA, ROTULO_DA_ORIGEM } from "@/lib/emporio/frete";
import type { CreditoView } from "@/lib/actions/emporio-credito";
import type { Falta } from "@/lib/emporio/cliente-cadastro";
import type { ClienteEscolhido } from "@/lib/emporio/cliente-escolhido";
import { EscolherCliente } from "./escolher-cliente";
import {
  BANDEIRAS,
  ROTULO_DA_BANDEIRA,
  custoAntecipacaoCent,
  dividirEmParcelas,
  taxaDoPagamentoCent,
} from "@/lib/emporio/cartao";
import { somarDiasUteis } from "@/lib/emporio/dia-util";
import { formatarDocumento } from "@/lib/contatos/cadastro";
import { pctBr } from "./formato";
import { FORMA_ROTULO } from "./venda-rotulos";
import {
  diaDeHoje,
  ehCartao,
  normalizar,
  produtoCasaBusca,
  type CampoDaFranquia,
  type CampoDaVenda,
  type ContaPixDaLoja,
  type EstadoDaVenda,
  type FormaDePagamento,
  type ProdutoVenda,
} from "./venda-estado";

const MAX_RESULTADOS = 8;

/** Na ordem do balcão: o que mais se usa primeiro. */
const FORMAS_DO_BALCAO: FormaDePagamento[] = [
  "dinheiro",
  "pix",
  "debito",
  "credito_vista",
  "credito_parcelado",
  "cheque",
  "boleto",
  "fiado",
];
/** O item "Nenhum" do franqueado: o Radix não aceita valor vazio num item. */
const SEM_FRANQUEADO = "nenhum";
const PARCELAS =Array.from({ length: 11 }, (_, i) => i + 2);

/**
 * Os campos da venda: loja, itens, cliente e pagamento. Não escreve nada e não
 * tem botão de enviar: quem monta a tela (o balcão, a troca) cuida do envio.
 *
 * Os ids dos `Field` são os nomes da API (`establishment_id`, `items`,
 * `customer_id`, `payments`), para a recusa do servidor cair embaixo do campo
 * certo. `prefixoDeId` vem de quem chama, porque o balcão e a troca nunca
 * vivem juntos mas os ids passam pelo mesmo `idDe`.
 */
/**
 * O que o cartão rende, antes de enviar (Q89): a taxa da loja, o líquido e o
 * prazo. Sem taxa cadastrada para a forma, avisa agora em vez de esperar a
 * recusa do servidor. Só informa: quem decide o valor é o campo acima.
 */
function InfoDoCartao({ v, p }: { v: EstadoDaVenda; p: EstadoDaVenda["pagamentos"][number] }) {
  if (!v.loja || !v.taxasCarregadas) return null;
  if (v.adquirentes.length === 0) {
    return (
      <p className="rounded-md bg-atencao-suave px-3 py-2 text-xs text-atencao-tinta">
        Esta loja ainda não tem taxa de cartão. Cadastre em Configurações, Cartões.
      </p>
    );
  }
  if (p.bandeira === "" || v.adquirenteDe(p) === "") {
    return <p className="text-xs text-texto-secundario">Escolha {p.bandeira === "" ? "a bandeira" : "a adquirente"} para ver a taxa.</p>;
  }
  const taxa = v.taxaDe(p);
  if (!taxa) {
    const adq = v.adquirentes.find((a) => a.id === v.adquirenteDe(p))?.name ?? "adquirente sem taxa vigente";
    return (
      <p className="rounded-md bg-atencao-suave px-3 py-2 text-xs text-atencao-tinta">
        Sem taxa para {ROTULO_DA_BANDEIRA[p.bandeira]}, {adq}, {FORMA_ROTULO[p.kind].toLowerCase()}
        {p.kind === "credito_parcelado" ? ` em ${Number(p.parcelas) || 2}x` : ""}: cadastre em Configurações.
      </p>
    );
  }
  const { linha, primeira } = taxa;
  const fixa = linha.fee_fixed > 0 ? ` + ${reaisBr(linha.fee_fixed)}` : "";
  const n = lerNumeroBr(p.valor);
  const dia = primeira.toISOString().slice(0, 10).split("-").reverse().slice(0, 2).join("/");
  if (n === null || n <= 0) {
    return (
      <p className="text-xs text-texto-secundario">
        Taxa {pctBr(linha.fee_pct)}
        {fixa}, 1ª parcela em {dia}.
      </p>
    );
  }
  const valorCent = Math.round(Number((n * 100).toPrecision(12)));
  const liquidoCent = valorCent - taxaDoPagamentoCent(valorCent, linha);

  // Antecipação automática (Q263): só no crédito, e só a partir da data configurada.
  const cfg = taxa.config;
  const automatica =
    p.kind !== "debito" &&
    cfg !== null &&
    cfg.auto_anticipation_enabled &&
    cfg.auto_anticipation_pct_month !== null &&
    cfg.auto_anticipation_since !== null &&
    cfg.auto_anticipation_since <= taxa.dia;
  let antecipado: { cai: string; liquidoCent: number } | null = null;
  if (automatica && cfg && cfg.auto_anticipation_pct_month !== null) {
    const cai = somarDiasUteis(new Date(`${taxa.dia}T00:00:00Z`), cfg.auto_anticipation_business_days);
    const partes = dividirEmParcelas(liquidoCent, taxa.parcelas);
    const custo = partes.reduce(
      (soma, liq, i) => soma + custoAntecipacaoCent(liq, cfg.auto_anticipation_pct_month as number, cai, taxa.datas[i]),
      0,
    );
    antecipado = {
      cai: cai.toISOString().slice(0, 10).split("-").reverse().slice(0, 2).join("/"),
      liquidoCent: liquidoCent - custo,
    };
  }
  return (
    <div className="space-y-1">
      <p className="text-xs text-texto-secundario">
        Taxa {pctBr(linha.fee_pct)}
        {fixa}: líquido <strong className="text-texto">{reaisBr(liquidoCent / 100)}</strong>, 1ª parcela em {dia}.
      </p>
      {antecipado && (
        <p className="text-xs text-texto-secundario">
          Antecipado: cai em {antecipado.cai}, líquido estimado{" "}
          <strong className="text-texto">{reaisBr(antecipado.liquidoCent / 100)}</strong>.
        </p>
      )}
    </div>
  );
}

/** Adquirente (quando há mais de uma com taxa) e bandeira do cartão: nenhuma bandeira vem marcada. */
function EscolhaDoCartao({
  v,
  p,
  primeiro,
  erro,
  idDoCampo,
  limpar,
}: {
  v: EstadoDaVenda;
  p: EstadoDaVenda["pagamentos"][number];
  /** O primeiro seletor da tela leva o `id` da API (`acquirer_id`), onde a recusa do servidor cai. */
  primeiro: boolean;
  erro?: string;
  idDoCampo: string;
  limpar: () => void;
}) {
  if (!v.taxasCarregadas || v.adquirentes.length === 0) return null;
  const seletor = (id: string, aria?: Record<string, unknown>) => (
    <Select
      value={p.adquirenteId}
      onValueChange={(valor) => {
        v.atualizarPagamento(p.key, { adquirenteId: valor });
        limpar();
      }}
    >
      <SelectTrigger id={id} {...aria}>
        <SelectValue placeholder="Escolha a adquirente" />
      </SelectTrigger>
      <SelectContent>
        {v.adquirentes.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
  return (
    <div className="space-y-2">
      {v.adquirentes.length > 1 || (p.adquirenteId !== "" && !v.adquirentes.some((a) => a.id === p.adquirenteId)) ? (
        primeiro ? (
          <Field label="Adquirente" required id={idDoCampo} error={erro}>
            {({ id, ...aria }) => seletor(id, aria)}
          </Field>
        ) : (
          <div className="space-y-1">
            <label htmlFor={`adquirente-${p.key}`} className="text-xs text-texto-secundario">
              Adquirente
            </label>
            {seletor(`adquirente-${p.key}`)}
          </div>
        )
      ) : primeiro ? (
        // Com uma só adquirente o seletor some, mas a recusa do servidor (2.59) precisa de onde cair.
        <Field label="Adquirente" id={idDoCampo} error={erro}>
          {({ id, ...aria }) => (
            <p id={id} tabIndex={-1} {...aria} className="text-sm text-texto">
              {v.adquirentes[0].name}
            </p>
          )}
        </Field>
      ) : (
        <p className="text-xs text-texto-secundario">Adquirente: {v.adquirentes[0].name}</p>
      )}
      <div className="space-y-1">
        <p id={`bandeira-${p.key}`} className="text-xs text-texto-secundario">
          Bandeira
        </p>
        <div role="group" aria-labelledby={`bandeira-${p.key}`} className="flex flex-wrap gap-2">
          {BANDEIRAS.map((b) => (
            <Button
              key={b}
              type="button"
              size="sm"
              variant={p.bandeira === b ? "default" : "outline"}
              aria-pressed={p.bandeira === b}
              onClick={() => {
                v.atualizarPagamento(p.key, { bandeira: b });
                limpar();
              }}
            >
              {ROTULO_DA_BANDEIRA[b]}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * O seletor da conta do PIX (Q314) e, embaixo, o favorecido e o CNPJ da escolhida. Quem chama põe o
 * rótulo e o `id`: no balcão é um rótulo pequeno, no fiado é o `Field` da `bank_account_id`. Com uma
 * conta só o seletor fica travado mostrando o nome; sem nenhuma, avisa e o servidor recusa o envio.
 */
export function ContaPixSelect({
  contas,
  carregadas,
  valor,
  aoMudar,
  id,
  aria,
}: {
  contas: ContaPixDaLoja[];
  carregadas: boolean;
  valor: string;
  aoMudar: (id: string) => void;
  id?: string;
  aria?: Record<string, unknown>;
}) {
  if (!carregadas) return null;
  if (contas.length === 0) {
    return (
      <p
        id={id}
        tabIndex={-1}
        {...aria}
        className="rounded-md bg-atencao-suave px-3 py-2 text-xs text-atencao-tinta"
      >
        Nenhuma conta PIX liberada para esta loja.
      </p>
    );
  }
  const escolhida = contas.find((c) => c.id === valor) ?? null;
  const doc = escolhida?.document ? formatarDocumento(escolhida.document) : "";
  return (
    <div className="space-y-1">
      <Select
        value={valor}
        disabled={contas.length === 1}
        onValueChange={(novo) => {
          // O Radix dispara "" quando o valor some da lista: nunca é escolha de ninguém.
          if (novo !== "") aoMudar(novo);
        }}
      >
        <SelectTrigger id={id} {...aria}>
          <SelectValue placeholder="Escolha a conta" />
        </SelectTrigger>
        <SelectContent>
          {contas.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {escolhida && (escolhida.beneficiary || doc) && (
        <p className="text-xs text-texto-secundario">
          {[escolhida.beneficiary, doc ? `CNPJ ${doc}` : ""].filter(Boolean).join(", ")}
        </p>
      )}
    </div>
  );
}

/** "Fiado em aberto: R$ X de R$ L · Bloqueado: vencido há N dias". Só informa. */
function AvisoDoFiado({ credito }: { credito: CreditoView }) {
  const situacao =
    credito.status === "bloqueado_por_atraso"
      ? ` · Bloqueado: vencido há ${credito.oldest_overdue?.days ?? credito.block_after_days} dias`
      : credito.status === "no_limite"
        ? " · No limite"
        : "";
  return (
    <p
      className={
        credito.status === "em_dia" ? "text-xs text-texto-secundario" : "text-xs font-medium text-atencao-tinta"
      }
    >
      Fiado em aberto: {reaisBr(credito.owed_total)}
      {credito.limit !== null ? ` de ${reaisBr(credito.limit)}` : ""}
      {situacao}
    </p>
  );
}

/**
 * O franqueado e o crédito dele (Q301), no balcão, na venda e no orçamento. Os ids são os nomes da API
 * (`franchisee_id`, `franchisee_credit`). Fica fora de `VendaCampos` porque a troca usa os mesmos campos
 * e não tem franqueado. Sem franqueado na lista e nenhum escolhido (perfil que não os vê), não aparece.
 */
export function FranquiaCampos({
  v,
  franqueados,
  erros,
  idDe,
  limpar,
}: {
  v: EstadoDaVenda;
  franqueados: { id: string; name: string }[];
  erros: Partial<Record<CampoDaFranquia, string>>;
  idDe: (campo: CampoDaFranquia) => string;
  limpar: (campo: CampoDaFranquia | "payments") => void;
}) {
  if (franqueados.length === 0 && v.franqueadoId === "") return null;
  return (
    <>
      <Field label="Franqueado (opcional)" id={idDe("franchisee_id")} error={erros.franchisee_id}>
        {({ id, ...aria }) => (
          <Select
            value={v.franqueadoId === "" ? SEM_FRANQUEADO : v.franqueadoId}
            onValueChange={(valor) => {
              // O Radix dispara "" quando o valor some da lista: nunca é escolha de ninguém.
              if (valor === "") return;
              v.definirFranqueado(valor === SEM_FRANQUEADO ? "" : valor);
              limpar("franchisee_id");
              limpar("franchisee_credit");
              limpar("payments");
            }}
          >
            <SelectTrigger id={id} {...aria}>
              <SelectValue placeholder="Nenhum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={SEM_FRANQUEADO}>Nenhum</SelectItem>
              {franqueados.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field
        label="Crédito do franqueado (R$)"
        id={idDe("franchisee_credit")}
        error={erros.franchisee_credit}
        hint="Cobrado do cliente a mais e repassado ao franqueado: não entra no faturamento da loja."
      >
        {({ id, ...aria }) => (
          <MoneyInput
            id={id}
            {...aria}
            placeholder="0,00"
            value={v.credito}
            onValueChange={(valor) => {
              v.definirCredito(valor);
              limpar("franchisee_credit");
              limpar("franchisee_id");
              limpar("payments");
            }}
          />
        )}
      </Field>
    </>
  );
}

export function VendaCampos({
  v,
  produtos,
  lojas,
  consumidorFinal,
  erros,
  idDe,
  limpar,
  lojaFixa,
  permitirCadastro,
  aoEscolherLoja,
  semPagamento,
  depoisDaLoja,
  depoisDoCliente,
  avisoDoCliente,
  aoEscolherCliente,
  creditoDoFiado,
  depoisDoPagamento,
  comFrete,
  depoisDoFrete,
}: {
  /** O que o balcão põe logo abaixo do frete e da origem (o franqueado e o crédito), na ordem visual do `ORDEM`. */
  depoisDoFrete?: ReactNode;
  /** Frete cobrado e origem da venda (Q244, Q248): só o balcão, e só na venda (orçamento e troca não têm). */
  comFrete?: boolean;
  /** O crédito do cliente, lido pelo balcão quando há fiado: só informa, a recusa de verdade é do servidor. */
  creditoDoFiado?: CreditoView | null;
  /** O que o balcão põe logo abaixo do pagamento (o atalho da recusa de crédito). */
  depoisDoPagamento?: ReactNode;
  /** Orçamento (entrega 4): não há pagamento a escolher. */
  semPagamento?: boolean;
  /** O que o balcão põe logo abaixo da loja (o orçamento a faturar), na ordem visual do `ORDEM`. */
  depoisDaLoja?: ReactNode;
  /** O que o balcão põe logo abaixo do cliente (o pedido para entrega), na ordem visual do `ORDEM`. */
  depoisDoCliente?: ReactNode;
  /** O que falta no cliente para o pedido para entrega: o quadro do cliente mostra, com "Completar cadastro". */
  avisoDoCliente?: Falta | null;
  /** Chamado a cada escolha (também depois de completar o cadastro), antes de `setCliente`. */
  aoEscolherCliente?: (c: ClienteEscolhido) => void;
  v: EstadoDaVenda;
  produtos: ProdutoVenda[];
  lojas: { id: string; name: string }[];
  /** O cliente fixo, sempre no topo da janela de escolha. */
  consumidorFinal: { id: string; name: string };
  erros: Partial<Record<CampoDaVenda, string>>;
  idDe: (campo: CampoDaVenda) => string;
  limpar: (campo: CampoDaVenda) => void;
  /** Troca: a loja é a da venda de origem, não se escolhe. */
  lojaFixa?: boolean;
  /** "Cadastrar novo cliente" e "Completar cadastro" no campo Cliente. */
  permitirCadastro?: boolean;
  aoEscolherLoja?: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [semTaxaDeCartao, setSemTaxaDeCartao] = useState(false);
  const termo = normalizar(busca);
  const hoje = diaDeHoje();
  const resultados =
    termo === ""
      ? []
      : produtos.filter((p) => p.apresentacoes.length > 0 && produtoCasaBusca(p, termo)).slice(0, MAX_RESULTADOS);

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

      {depoisDaLoja}

      <Field label="Produtos" required id={idDe("items")} error={erros.items}>
        {({ id, ...aria }) => (
          <div id={id} tabIndex={-1} {...aria} className="space-y-3">
            <Input
              type="search"
              aria-label="Buscar produto"
              placeholder="Buscar por nome, marca ou código"
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
                    {l.sugerido === null
                      ? "Sem preço cadastrado nesta loja"
                      : l.doOrcamento !== null
                        ? `Preço do orçamento ${reaisBr(l.doOrcamento)} (sugerido ${reaisBr(l.sugerido)})`
                        : `Preço sugerido ${reaisBr(l.sugerido)}`}
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

      <Field label="Cliente" required id={idDe("customer_id")} error={erros.customer_id}>
        {(campo) => (
          <EscolherCliente
            campo={campo}
            consumidorFinal={consumidorFinal}
            valor={v.cliente}
            onEscolher={(c) => {
              aoEscolherCliente?.(c);
              v.setCliente(c);
              limpar("customer_id");
            }}
            permitirCadastro={!!permitirCadastro}
            aviso={avisoDoCliente ?? null}
          />
        )}
      </Field>

      {depoisDoCliente}

      {comFrete && (
        <>
          <Field label="Frete cobrado do cliente (opcional)" id={idDe("freight_amount")} error={erros.freight_amount}>
            {({ id, ...aria }) => (
              <MoneyInput
                id={id}
                {...aria}
                placeholder="0,00"
                value={v.frete}
                onValueChange={(valor) => {
                  v.definirFrete(valor);
                  limpar("freight_amount");
                  limpar("payments");
                }}
              />
            )}
          </Field>
          <Field label="Origem da venda" id={idDe("origin")} error={erros.origin}>
            {({ id, ...aria }) => (
              <div id={id} tabIndex={-1} {...aria} className="flex flex-wrap gap-2">
                {ORIGENS_DA_VENDA.map((o) => (
                  <Button
                    key={o}
                    type="button"
                    size="sm"
                    variant={v.origem === o ? "default" : "outline"}
                    aria-pressed={v.origem === o}
                    onClick={() => {
                      v.definirOrigem(o);
                      limpar("origin");
                    }}
                  >
                    {ROTULO_DA_ORIGEM[o]}
                  </Button>
                ))}
              </div>
            )}
          </Field>
        </>
      )}

      {depoisDoFrete}

      {!semPagamento && (
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
                      // Sem adquirente com taxa na loja, o cartão não entra: o aviso diz onde cadastrar.
                      const semTaxaNaLoja = ehCartao(k) && v.taxasCarregadas && v.adquirentes.length === 0;
                      setSemTaxaDeCartao(semTaxaNaLoja);
                      if (semTaxaNaLoja) return;
                      v.adicionarPagamento(k);
                      limpar("payments");
                    }}
                  >
                    + {FORMA_ROTULO[k]}
                  </Button>
                ))}
              </div>
              {semTaxaDeCartao && v.adquirentes.length === 0 && (
                <p className="rounded-md bg-atencao-suave px-3 py-2 text-xs text-atencao-tinta">
                  Esta loja não tem taxa de cartão. Cadastre em Configurações, Cartões.
                </p>
              )}

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
                  {p.kind === "pix" && (
                    <div className="space-y-1">
                      <label htmlFor={`conta-pix-${p.key}`} className="text-xs text-texto-secundario">
                        Conta do PIX
                      </label>
                      <ContaPixSelect
                        id={`conta-pix-${p.key}`}
                        contas={v.opcoesDeContaPix(p)}
                        carregadas={v.contasPixCarregadas}
                        valor={v.contaPixDe(p)}
                        aoMudar={(conta) => {
                          v.atualizarPagamento(p.key, { contaPixId: conta, contaPixNome: "" });
                          limpar("payments");
                        }}
                      />
                    </div>
                  )}
                  {ehCartao(p.kind) && (
                    <>
                      <EscolhaDoCartao
                        v={v}
                        p={p}
                        primeiro={v.pagamentos.find((q) => ehCartao(q.kind))?.key === p.key}
                        erro={erros.acquirer_id}
                        idDoCampo={idDe("acquirer_id")}
                        limpar={() => {
                          limpar("acquirer_id");
                          limpar("payments");
                        }}
                      />
                      <InfoDoCartao v={v} p={p} />
                    </>
                  )}
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
                      <div className="space-y-1 sm:col-span-2">
                        <label htmlFor={`cheque-titular-${p.key}`} className="text-xs text-texto-secundario">
                          Em nome de
                        </label>
                        <Input
                          id={`cheque-titular-${p.key}`}
                          autoComplete="off"
                          value={p.chequeTitular}
                          onChange={(e) => {
                            v.atualizarPagamento(p.key, { chequeTitular: e.target.value, chequeTitularEditado: true });
                            limpar("payments");
                          }}
                        />
                      </div>
                      {!v.cliente && (
                        <p className="text-xs text-atencao-tinta sm:col-span-2">
                          O cheque precisa de um cliente: escolha acima.
                        </p>
                      )}
                    </div>
                  )}
                  {p.kind === "boleto" && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <label htmlFor={`boleto-vencimento-${p.key}`} className="text-xs text-texto-secundario">
                          Vencimento
                        </label>
                        <Input
                          id={`boleto-vencimento-${p.key}`}
                          type="date"
                          min={hoje}
                          value={p.vencimento}
                          onChange={(e) => {
                            v.atualizarPagamento(p.key, { vencimento: e.target.value });
                            limpar("payments");
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor={`boleto-numero-${p.key}`} className="text-xs text-texto-secundario">
                          Número do boleto (opcional)
                        </label>
                        <Input
                          id={`boleto-numero-${p.key}`}
                          autoComplete="off"
                          value={p.boletoNumero}
                          onChange={(e) => {
                            v.atualizarPagamento(p.key, { boletoNumero: e.target.value });
                            limpar("payments");
                          }}
                        />
                      </div>
                      {!v.cliente && (
                        <p className="text-xs text-atencao-tinta sm:col-span-2">
                          O boleto precisa de um cliente: escolha acima.
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
                      {creditoDoFiado && p.vencimento === "" && (
                        <p className="text-xs text-texto-secundario">
                          Sem data, vence em {creditoDoFiado.suggested_due_date.split("-").reverse().join("/")}
                        </p>
                      )}
                      {creditoDoFiado && <AvisoDoFiado credito={creditoDoFiado} />}
                    </div>
                  )}
                </div>
              ))}

              <div className="space-y-1 rounded-lg bg-superficie-afundada px-3 py-2 text-sm" aria-live="polite">
                {v.freteCent > 0 && (
                  <p className="text-texto-secundario">
                    Itens {reaisBr(v.totalCent / 100)} + frete {reaisBr(v.freteCent / 100)}. Total com frete:{" "}
                    <strong className="text-texto">{reaisBr((v.totalCent + v.freteCent) / 100)}</strong>
                  </p>
                )}
                {v.creditoCent > 0 && (
                  <p className="text-texto-secundario">
                    Crédito do franqueado {reaisBr(v.creditoCent / 100)} (fora do faturamento). Total a pagar:{" "}
                    <strong className="text-texto">
                      {reaisBr((v.totalCent + v.freteCent + v.creditoCent) / 100)}
                    </strong>
                  </p>
                )}
                {v.totalCent > 0 && v.aPagarCent !== v.totalCent + v.freteCent + v.creditoCent && (
                  <p className="text-texto-secundario">
                    Valor da troca abatido: {reaisBr((v.totalCent + v.freteCent + v.creditoCent - v.aPagarCent) / 100)}. A pagar:{" "}
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
      )}

      {depoisDoPagamento}

      {v.descontoCent > 0 && (
        <p className="rounded-lg bg-atencao-suave px-3 py-2 text-sm text-atencao-tinta">
          Desconto total: {reaisBr(v.descontoCent / 100)} ({pctBr(Math.round(v.descontoPct * 100) / 100)} sobre o preço
          sugerido).
        </p>
      )}
    </div>
  );
}
