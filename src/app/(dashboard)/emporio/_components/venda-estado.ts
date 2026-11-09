"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet } from "@/lib/client-api";
import {
  adquirentesComTaxa,
  datasDasParcelas,
  hojeEmBrasilia,
  resolverTaxa,
  ROTULO_DA_BANDEIRA,
  type Bandeira,
  type LinhaDeTaxa,
} from "@/lib/emporio/cartao";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";
import type { ClienteEscolhido } from "@/lib/emporio/cliente-escolhido";
import type { OrigemDaVenda } from "@/lib/emporio/frete";
import type { VendaView } from "@/lib/actions/emporio-vendas";

/**
 * O estado e as contas da venda do Meu Empório (F3a), compartilhados pelo
 * balcão (`/emporio/vender`) e pela troca (`/emporio/vendas/[id]`): a troca é
 * uma devolução mais uma venda nova, e a venda nova usa o mesmo formulário.
 *
 * Dinheiro sempre em centavos inteiros: somar float é como o "falta fechar"
 * ganha um centavo fantasma. As regras de arredondamento espelham a action
 * (`prepararVenda`), para o total da tela ser o que o servidor vai gravar.
 */

export type ApresentacaoVenda = { id: string; name: string; base_qty: number; lacrada: boolean };
export type ProdutoVenda = {
  id: string;
  name: string;
  /** Também entram na busca do balcão (Q124). */
  brand: string | null;
  manufacturer: string | null;
  internal_code: string | null;
  base_unit: string;
  apresentacoes: ApresentacaoVenda[];
};
/** apresentação -> loja -> preço sugerido. */
export type PrecosVenda = Record<string, Record<string, number>>;

export type LinhaItem = {
  key: number;
  produtoId: string;
  apresentacaoId: string;
  qtd: string;
  preco: string;
  /** Preço mexido à mão: trocar de loja não o sobrescreve com o sugerido. */
  manual: boolean;
};

export type FormaDePagamento =
  | "dinheiro"
  | "pix"
  | "debito"
  | "credito_vista"
  | "credito_parcelado"
  | "cheque"
  | "fiado";
export type LinhaPagamento = {
  key: number;
  kind: FormaDePagamento;
  valor: string;
  vencimento: string;
  /** Crédito parcelado: 2 a 12. */
  parcelas: string;
  chequeNumero: string;
  chequeBanco: string;
  /** "Bom para", AAAA-MM-DD. */
  chequeBomPara: string;
  /** Cartão: a adquirente escolhida. Vazio com uma só adquirente com taxa na loja: vale a única. */
  adquirenteId: string;
  /** Cartão: a bandeira, sempre escolhida (nenhuma vem marcada). */
  bandeira: Bandeira | "";
};

/** Uma linha de taxa vigente da loja, com o nome da adquirente (a rota devolve os dois). */
export type TaxaDaVenda = LinhaDeTaxa & { acquirer_name: string };

export const FORMAS_DE_CARTAO: string[] = ["debito", "credito_vista", "credito_parcelado"];
export const ehCartao = (kind: string) => FORMAS_DE_CARTAO.includes(kind);

export type CampoDaVenda =
  | "establishment_id"
  | "items"
  | "customer_id"
  | "freight_amount"
  | "origin"
  | "acquirer_id"
  | "payments";

export const cent = (n: number) => Math.round(Number((n * 100).toPrecision(12)));
const arred3 = (n: number) => Math.round(Number((n * 1000).toPrecision(14))) / 1000;
export const centavosParaCampo = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/** Total do item em centavos, com os mesmos arredondamentos da action. */
export function totalDoItemCent(qtd: number, preco: number): number {
  return cent(arred3(qtd) * (cent(preco) / 100));
}

/** Sem acento e sem caixa: "racao" acha "Ração". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * A busca do balcão: nome, marca, fabricante e código interno, sem acento.
 * É o mesmo critério de `listarProdutosEmporioAction`; não importa `semAcento`
 * de lá porque aquele módulo arrasta o banco e este é client (`normalizar` faz
 * a mesma conta).
 */
export function produtoCasaBusca(p: ProdutoVenda, termo: string): boolean {
  return [p.name, p.brand, p.manufacturer, p.internal_code].some((campo) => !!campo && normalizar(campo).includes(termo));
}

const CARTAO_NOME: Record<string, string> = {
  debito: "débito",
  credito_vista: "crédito à vista",
  credito_parcelado: "crédito parcelado",
};

/** Hoje em Brasília, AAAA-MM-DD: o dia que vale para a taxa da venda. */
const diaDeHoje = () => hojeEmBrasilia().toISOString().slice(0, 10);

const paraIso =(data: string) => new Date(`${data}T12:00:00`).toISOString();

export type CorpoDaVenda = {
  establishment_id: string;
  customer_id: string | null;
  items: { emporio_product_id: string; presentation_id: string; quantity: number; unit_price: number }[];
  payments: {
    kind: FormaDePagamento;
    amount: number;
    due_date: string | null;
    installments?: number;
    acquirer_id?: string;
    brand?: Bandeira;
    check?: { number: string; bank: string; good_for: string };
  }[];
  /** Frete cobrado do cliente (Q244): omitido quando é zero. */
  freight_amount?: number;
  /** De onde veio a venda (Q248). */
  origin?: OrigemDaVenda;
};

/**
 * Entrega 4: o orçamento posto no carrinho para faturar, por apresentação, com
 * as contas do servidor. `referencia` (`preco_de_referencia`) faz o papel do
 * preço sugerido enquanto ele está carregado, e o desconto da tela é medido
 * contra ela, como na action; `vale` (`preco_que_vale`) é o preço da linha.
 * Apresentação sem preço que valha fica fora dos dois, e o item entra sem preço.
 */
export type CargaDoOrcamento = {
  referencia: Record<string, number>;
  vale: Record<string, number>;
  itens: { produtoId: string; apresentacaoId: string; qtd: string }[];
  /** O cliente do orçamento (só `id`, `name`, `phone` e `document`; o resto nulo), ou nulo sem cliente. */
  cliente: ClienteEscolhido | null;
};

const paraCampoDePreco = (s: number | null) => (s === null ? "" : centavosParaCampo(cent(s)));

/** Os itens do orçamento como linhas do carrinho, com o preço que vale (vazio quando não há). */
function linhasDaCarga(carga: CargaDoOrcamento, chave: (n: number) => number): LinhaItem[] {
  return carga.itens.map((i, n) => ({
    key: chave(n),
    produtoId: i.produtoId,
    apresentacaoId: i.apresentacaoId,
    qtd: i.qtd,
    preco: paraCampoDePreco(carga.vale[i.apresentacaoId] ?? null),
    manual: false,
  }));
}

/** O estado com que o balcão abre a edição de uma venda (Q249): tudo o que a venda tem, menos as chaves das linhas. */
export type InicialDaVenda = {
  itens: Omit<LinhaItem, "key">[];
  pagamentos: Omit<LinhaPagamento, "key">[];
  frete: string;
  origem: OrigemDaVenda;
  cliente: ClienteEscolhido | null;
};

/**
 * A venda gravada como estado do balcão. O item cuja apresentação já não está no
 * catálogo carregado fica de fora (e é contado em `ausentes`): o servidor
 * recusaria a venda com um item que não pode ser vendido, e quem edita o
 * acrescenta de novo. O preço entra como digitado (`manual`), para trocar de loja
 * ou de preço sugerido não reescrever o que foi cobrado.
 */
export function inicialDaVenda(
  venda: VendaView,
  produtos: ProdutoVenda[],
  cliente: ClienteEscolhido | null,
): { inicial: InicialDaVenda; ausentes: number } {
  const existe = (produtoId: string, apresentacaoId: string) =>
    !!produtos.find((p) => p.id === produtoId)?.apresentacoes.some((a) => a.id === apresentacaoId);
  const presentes = venda.items.filter((i) => existe(i.emporio_product_id, i.presentation_id));
  return {
    ausentes: venda.items.length - presentes.length,
    inicial: {
      itens: presentes.map((i) => ({
        produtoId: i.emporio_product_id,
        apresentacaoId: i.presentation_id,
        qtd: String(i.quantity).replace(".", ","),
        preco: centavosParaCampo(cent(i.unit_price)),
        manual: true,
      })),
      pagamentos: venda.payments.map((p) => ({
        kind: p.kind as FormaDePagamento,
        valor: centavosParaCampo(cent(p.amount)),
        vencimento: p.due_date ? p.due_date.slice(0, 10) : "",
        parcelas: String(p.installments ?? 2),
        chequeNumero: p.check?.number ?? "",
        chequeBanco: p.check?.bank ?? "",
        chequeBomPara: p.check ? p.check.good_for.slice(0, 10) : "",
        // O pagamento antigo sem adquirente e bandeira vem vazio: quem edita escolhe de novo.
        adquirenteId: p.acquirer_id ?? "",
        bandeira: (p.brand && p.brand !== "qualquer" ? p.brand : "") as Bandeira | "",
      })),
      frete: venda.freight_amount > 0 ? centavosParaCampo(cent(venda.freight_amount)) : "",
      origem: venda.origin,
      cliente,
    },
  };
}

export type Montagem = {
  novos: Partial<Record<CampoDaVenda, string>>;
  corpo: CorpoDaVenda | null;
  /** Muda quando qualquer coisa da venda muda: é o que decide se a chave de operação é reaproveitada. */
  assinatura: string;
};

export function useVenda({
  produtos,
  precos,
  lojaInicial,
  clienteInicial = null,
  abatimentoCent = 0,
  cargaInicial = null,
  inicial = null,
  diaDaVenda,
}: {
  /** A venda que o balcão abre para editar (`/emporio/vender?editar=<id>`). */
  inicial?: InicialDaVenda | null;
  /** O orçamento que o balcão abre carregado (`/emporio/vender?orcamento=<id>`). */
  cargaInicial?: CargaDoOrcamento | null;
  produtos: ProdutoVenda[];
  precos: PrecosVenda;
  lojaInicial: string;
  /** A troca abre com o cliente da venda de origem; venda e orçamento, sem cliente. */
  clienteInicial?: ClienteEscolhido | null;
  /** Valor da troca que já paga parte da venda. */
  abatimentoCent?: number;
  /**
   * O dia (AAAA-MM-DD, Brasília) em que a taxa é resolvida. Na edição é o dia da
   * venda antiga (o servidor resolve em `sold_at`, decisão 1); sem ele, hoje.
   */
  diaDaVenda?: string;
}) {
  const diaDaTaxa = diaDaVenda ?? diaDeHoje();
  const contador = useRef(0);
  const proximo = () => {
    contador.current += 1;
    return contador.current;
  };

  const [loja, setLojaEstado] = useState(lojaInicial);
  // Os itens do orçamento inicial ganham chaves negativas: o contador só dá positivas.
  const [itens, setItens] = useState<LinhaItem[]>(() =>
    cargaInicial
      ? linhasDaCarga(cargaInicial, (n) => -(n + 1))
      : (inicial?.itens ?? []).map((i, n) => ({ ...i, key: -(n + 1) })),
  );
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>(() =>
    (inicial?.pagamentos ?? []).map((p, n) => ({ ...p, key: -(n + 1) })),
  );
  // O frete é o texto digitado no campo de dinheiro; vazio vale zero.
  const [frete, setFrete] = useState(inicial?.frete ?? "");
  const [origem, setOrigem] = useState<OrigemDaVenda>(inicial?.origem ?? "balcao");
  // O Consumidor final é `cliente.fixed`: não serve para fiado nem cheque.
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(
    cargaInicial ? cargaInicial.cliente : (inicial?.cliente ?? clienteInicial),
  );
  const [orc, setOrc] = useState<Pick<CargaDoOrcamento, "referencia" | "vale"> | null>(
    cargaInicial ? { referencia: cargaInicial.referencia, vale: cargaInicial.vale } : null,
  );

  const precoDaLoja = (apresentacaoId: string, lojaId: string): number | null =>
    precos[apresentacaoId]?.[lojaId] ?? null;

  /** Com orçamento carregado, a referência dele vale como o sugerido (a mesma conta do servidor). */
  const sugerido = (apresentacaoId: string, lojaId: string): number | null =>
    orc?.referencia[apresentacaoId] ?? precoDaLoja(apresentacaoId, lojaId);

  /** O preço que a linha recebe: o que vale no orçamento, senão o sugerido. */
  const precoInicial = (apresentacaoId: string, lojaId: string) =>
    paraCampoDePreco(orc?.vale[apresentacaoId] ?? sugerido(apresentacaoId, lojaId));

  /** Trocar de loja tira o orçamento carregado: o preço dele só vale na loja dele. */
  function setLoja(nova: string) {
    setLojaEstado(nova);
    setOrc(null);
    setItens((lista) =>
      lista.map((i) => (i.manual ? i : { ...i, preco: paraCampoDePreco(precoDaLoja(i.apresentacaoId, nova)) })),
    );
  }

  /** Põe o orçamento no carrinho: os itens dele no lugar dos que havia, o cliente dele, sem pagamento. */
  function carregarOrcamento(carga: CargaDoOrcamento) {
    setOrc({ referencia: carga.referencia, vale: carga.vale });
    setItens(linhasDaCarga(carga, proximo));
    setPagamentos([]);
    setCliente(carga.cliente);
  }

  /** Tira o orçamento: o carrinho fica, e o que não foi digitado volta ao preço da loja. */
  function soltarOrcamento() {
    setOrc(null);
    setItens((lista) =>
      lista.map((i) => (i.manual ? i : { ...i, preco: paraCampoDePreco(precoDaLoja(i.apresentacaoId, loja)) })),
    );
  }

  /** A menor apresentação primeiro: no balcão se vende o pacote pequeno mais vezes. */
  function apresentacaoPadrao(p: ProdutoVenda): ApresentacaoVenda {
    return [...p.apresentacoes].sort((a, b) => a.base_qty - b.base_qty)[0];
  }

  function adicionarProduto(p: ProdutoVenda) {
    if (p.apresentacoes.length === 0) return;
    const ap = apresentacaoPadrao(p);
    setItens((lista) => {
      const mesmo = lista.find((i) => i.produtoId === p.id && i.apresentacaoId === ap.id);
      if (mesmo) {
        const q = lerNumeroBr(mesmo.qtd);
        return lista.map((i) =>
          i.key === mesmo.key ? { ...i, qtd: String(((q === null ? 0 : q) + 1)).replace(".", ",") } : i,
        );
      }
      return [
        ...lista,
        { key: proximo(), produtoId: p.id, apresentacaoId: ap.id, qtd: "1", preco: precoInicial(ap.id, loja), manual: false },
      ];
    });
  }

  function atualizarItem(key: number, parte: Partial<LinhaItem>) {
    setItens((lista) =>
      lista.map((i) => {
        if (i.key !== key) return i;
        const novo = { ...i, ...parte };
        // Trocar a apresentação traz o preço dela, a não ser que o preço tenha sido digitado.
        if (parte.apresentacaoId && parte.apresentacaoId !== i.apresentacaoId && !novo.manual) {
          novo.preco = precoInicial(parte.apresentacaoId, loja);
        }
        return novo;
      }),
    );
  }

  function removerItem(key: number) {
    setItens((lista) => lista.filter((i) => i.key !== key));
  }

  // ----- contas -----
  const linhas = itens.map((i) => {
    const produto = produtos.find((p) => p.id === i.produtoId) ?? null;
    const apresentacao = produto?.apresentacoes.find((a) => a.id === i.apresentacaoId) ?? null;
    const q = lerNumeroBr(i.qtd);
    const p = lerNumeroBr(i.preco);
    const sug = sugerido(i.apresentacaoId, loja);
    const valida = q !== null && q > 0 && p !== null && p > 0;
    const total = valida ? totalDoItemCent(q, p) : 0;
    // Desconto (Q85): só o que fica abaixo do sugerido.
    const desconto = valida && sug !== null && cent(p) < cent(sug) ? cent(arred3(q) * ((cent(sug) - cent(p)) / 100)) : 0;
    const baseDoItem = valida && sug !== null ? cent(arred3(q) * (cent(sug) / 100)) : 0;
    // O preço que o orçamento garante nesta linha (nulo fora dele).
    const doOrcamento = orc?.vale[i.apresentacaoId] ?? null;
    return {
      linha: i,
      produto,
      apresentacao,
      q,
      p,
      sugerido: sug,
      doOrcamento,
      valida,
      totalCent: total,
      descontoCent: desconto,
      baseCent: baseDoItem,
    };
  });

  const totalCent = linhas.reduce((s, l) => s + l.totalCent, 0);
  const descontoCent = linhas.reduce((s, l) => s + l.descontoCent, 0);
  const baseCent = linhas.reduce((s, l) => s + l.baseCent, 0);
  const descontoPct = baseCent > 0 ? (descontoCent / baseCent) * 100 : 0;
  const freteLido = lerNumeroBr(frete);
  const freteCent = freteLido === null || freteLido <= 0 ? 0 : cent(freteLido);
  // O frete é cobrado além dos itens: o cliente paga itens mais frete.
  const aPagarCent = Math.max(0, totalCent + freteCent - abatimentoCent);

  // As linhas de taxa vigentes da loja escolhida (hoje, em Brasília): recarregam ao trocar de loja.
  const [taxas, setTaxas] = useState<{ lojaId: string; linhas: TaxaDaVenda[] } | null>(null);
  useEffect(() => {
    if (!loja) return;
    let vivo = true;
    void apiGet<TaxaDaVenda[]>(
      `/api/v1/emporio/card-fee-rates?establishment_id=${encodeURIComponent(loja)}&vigentes_em=${diaDaTaxa}`,
    ).then((res) => {
      if (vivo && res.ok) setTaxas({ lojaId: loja, linhas: res.data });
    });
    return () => {
      vivo = false;
    };
  }, [loja, diaDaTaxa]);
  const linhasDaLoja = taxas && taxas.lojaId === loja ? taxas.linhas : null;
  const taxasCarregadas = linhasDaLoja !== null;
  const adquirentes = linhasDaLoja
    ? adquirentesComTaxa(linhasDaLoja, diaDaTaxa).map((id) => ({
        id,
        name: linhasDaLoja.find((l) => l.acquirer_id === id)?.acquirer_name ?? "",
      }))
    : [];

  const somaPagamentos = pagamentos.reduce((s, p) => {
    const n = lerNumeroBr(p.valor);
    return s + (n === null || n <= 0 ? 0 : cent(n));
  }, 0);
  const faltaCent = Math.max(0, aPagarCent - somaPagamentos);
  const trocoCent = Math.max(0, somaPagamentos - aPagarCent);

  function adicionarPagamento(kind: FormaDePagamento) {
    setPagamentos((lista) => {
      if (kind === "fiado" && lista.some((p) => p.kind === "fiado")) return lista;
      return [
        ...lista,
        {
          key: proximo(),
          kind,
          valor: faltaCent > 0 ? centavosParaCampo(faltaCent) : "",
          vencimento: "",
          parcelas: "2",
          chequeNumero: "",
          chequeBanco: "",
          chequeBomPara: "",
          adquirenteId: "",
          bandeira: "",
        },
      ];
    });
  }

  /**
   * A adquirente que vale para o pagamento: a escolhida, ou a única com taxa na
   * loja. Vazio quando há mais de uma e nenhuma foi escolhida.
   */
  function adquirenteDe(p: LinhaPagamento): string {
    // A adquirente do pagamento antigo fica, mesmo sem linha vigente no dia: trocar em silêncio
    // mudaria a taxa sem a pessoa ver. A prévia avisa e ela escolhe outra.
    if (p.adquirenteId) return p.adquirenteId;
    return adquirentes.length === 1 ? adquirentes[0].id : "";
  }

  /** O que o cartão rende, com a mesma conta do servidor. `null` sem bandeira, sem adquirente ou sem linha. */
  function taxaDe(p: LinhaPagamento): { linha: TaxaDaVenda; parcelas: number; primeira: Date } | null {
    if (!linhasDaLoja || p.bandeira === "") return null;
    const acquirer_id = adquirenteDe(p);
    if (!acquirer_id) return null;
    const parcelas = p.kind === "credito_parcelado" ? Number(p.parcelas) || 2 : 1;
    const linha = resolverTaxa(linhasDaLoja, {
      acquirer_id,
      brand: p.bandeira,
      kind: p.kind as LinhaDeTaxa["kind"],
      installments: parcelas,
      dia: diaDaTaxa,
    }) as TaxaDaVenda | null;
    if (!linha) return null;
    return { linha, parcelas, primeira: datasDasParcelas(new Date(`${diaDaTaxa}T12:00:00Z`), linha.days, 1)[0] };
  }

  /** Há cartão sem bandeira, sem adquirente ou sem taxa para a combinação: a venda não fecha. */
  const cartaoIncompleto = taxasCarregadas && pagamentos.some((p) => ehCartao(p.kind) && taxaDe(p) === null);

  function atualizarPagamento(key: number, parte: Partial<LinhaPagamento>) {
    setPagamentos((lista) => lista.map((p) => (p.key === key ? { ...p, ...parte } : p)));
  }

  function removerPagamento(key: number) {
    setPagamentos((lista) => lista.filter((p) => p.key !== key));
  }

  function reiniciar() {
    setItens([]);
    setPagamentos([]);
    setCliente(clienteInicial);
    setOrc(null);
    setFrete("");
    setOrigem("balcao");
  }

  function itensDaApi(): CorpoDaVenda["items"] {
    return linhas.map((l) => ({
      emporio_product_id: l.linha.produtoId,
      presentation_id: l.linha.apresentacaoId,
      quantity: l.q ?? 0,
      unit_price: l.p ?? 0,
    }));
  }

  /**
   * Valida e monta o corpo da API. `exigeLoja` é falso na troca, em que a loja é a da venda de origem.
   * `orcamento` (entrega 4): sem pagamento, e o cliente tem de ser de verdade (o servidor confere o cadastro).
   */
  function montar(exigeLoja: boolean, { orcamento = false }: { orcamento?: boolean } = {}): Montagem {
    const novos: Partial<Record<CampoDaVenda, string>> = {};
    if (exigeLoja && !loja) novos.establishment_id = "Escolha a loja que está vendendo.";

    if (linhas.length === 0) {
      novos.items = orcamento ? "Inclua ao menos um produto no orçamento." : "Inclua ao menos um produto na venda.";
    } else if (linhas.some((l) => !l.valida)) {
      novos.items = "Cada item precisa de quantidade e preço maiores que zero.";
    }

    const temFiado = pagamentos.some((p) => p.kind === "fiado");
    const temCheque = pagamentos.some((p) => p.kind === "cheque");
    const ehConsumidorFinal = cliente?.fixed === true;
    if (orcamento) {
      // A mesma frase do servidor (`QUOTE_CUSTOMER_REQUIRED`). O Consumidor final serve;
      // o cadastro incompleto é o servidor que recusa (`QUOTE_CUSTOMER_INCOMPLETE`).
      if (!cliente) {
        novos.customer_id = "Escolha o cliente do orçamento. Quem não quer se identificar entra como Consumidor final.";
      }
      return {
        novos,
        corpo:
          Object.keys(novos).length > 0 || !cliente
            ? null
            : { establishment_id: loja, customer_id: cliente.id, items: itensDaApi(), payments: [] },
        assinatura: JSON.stringify(["orcamento", loja, cliente?.id ?? null, itensDaApi()]),
      };
    }
    // Texto preenchido e ilegível ou negativo: a recusa fica embaixo do campo do frete.
    if (frete.trim() !== "" && (freteLido === null || freteLido < 0)) {
      novos.freight_amount = "Informe o frete em reais, zero ou mais.";
    }
    if (!cliente) novos.customer_id = "Escolha o cliente da venda.";
    else if (temFiado && ehConsumidorFinal) novos.customer_id = "Fiado precisa do cliente de verdade, não do Consumidor final.";
    else if (temCheque && ehConsumidorFinal) novos.customer_id = "Cheque precisa do cliente de verdade, não do Consumidor final.";

    const pagamentosApi: CorpoDaVenda["payments"] = [];
    const ilegivel = pagamentos.some((p) => {
      const n = lerNumeroBr(p.valor);
      return n === null || n <= 0;
    });
    // Com as taxas da loja carregadas, a conferência é daqui; sem elas (leitura falhou) fica com o servidor.
    const cartoes = taxasCarregadas && loja ? pagamentos.filter((p) => ehCartao(p.kind)) : [];
    const semAdquirente = cartoes.find((p) => adquirenteDe(p) === "") && adquirentes.length > 1;
    if (semAdquirente) novos.acquirer_id = "Escolha a adquirente do cartão.";
    const semBandeira = cartoes.find((p) => p.bandeira === "");
    const semTaxa = cartoes.find((p) => p.bandeira !== "" && adquirenteDe(p) !== "" && taxaDe(p) === null);
    const chequeIncompleto = pagamentos.some(
      (p) => p.kind === "cheque" && (!p.chequeNumero.trim() || !p.chequeBanco.trim() || !p.chequeBomPara),
    );
    if (ilegivel) {
      novos.payments = "Cada pagamento precisa de um valor maior que zero.";
    } else if (semAdquirente) {
      // A recusa fica embaixo do seletor da adquirente; o rodapé do pagamento não repete.
    } else if (semBandeira) {
      novos.payments = `Escolha a bandeira do cartão (${CARTAO_NOME[semBandeira.kind] ?? "cartão"}).`;
    } else if (adquirentes.length === 0 && cartoes.length > 0) {
      novos.payments = "Esta loja não tem taxa de cartão cadastrada. Cadastre em Configurações, Cartões.";
    } else if (semTaxa) {
      novos.payments = `Sem taxa para ${semTaxa.bandeira === "" ? "" : ROTULO_DA_BANDEIRA[semTaxa.bandeira]}, ${CARTAO_NOME[semTaxa.kind] ?? "cartão"}: cadastre em Configurações.`;
    } else if (chequeIncompleto) {
      novos.payments = "Informe o número, o banco e a data do cheque (bom para).";
    } else if (aPagarCent > 0 && pagamentos.length === 0) {
      novos.payments = "Escolha como o cliente vai pagar.";
    } else if (faltaCent > 0) {
      novos.payments = `Faltam ${reaisBr(faltaCent / 100)} para fechar a venda.`;
    } else {
      // O troco é só da tela: o servidor recebe o valor da venda, então o
      // excesso sai das linhas de dinheiro, da última para a primeira.
      let excesso = trocoCent;
      const dinheiro = pagamentos.filter((p) => p.kind === "dinheiro").reduce((s, p) => s + cent(lerNumeroBr(p.valor) as number), 0);
      if (excesso > dinheiro) {
        novos.payments = "O valor passa do total e só o dinheiro dá troco.";
      } else {
        for (const p of [...pagamentos].reverse()) {
          let c = cent(lerNumeroBr(p.valor) as number);
          if (p.kind === "dinheiro" && excesso > 0) {
            const tira = Math.min(excesso, c);
            c -= tira;
            excesso -= tira;
          }
          if (c > 0) {
            pagamentosApi.unshift({
              kind: p.kind,
              amount: c / 100,
              due_date: p.kind === "fiado" && p.vencimento ? paraIso(p.vencimento) : null,
              ...(p.kind === "credito_parcelado" ? { installments: Number(p.parcelas) || 2 } : {}),
              ...(ehCartao(p.kind) && p.bandeira !== ""
                ? { brand: p.bandeira, ...(adquirenteDe(p) ? { acquirer_id: adquirenteDe(p) } : {}) }
                : {}),
              ...(p.kind === "cheque"
                ? { check: { number: p.chequeNumero.trim(), bank: p.chequeBanco.trim(), good_for: p.chequeBomPara } }
                : {}),
            });
          }
        }
      }
    }

    const corpo: CorpoDaVenda = {
      establishment_id: loja,
      customer_id: cliente?.id ?? null,
      items: itensDaApi(),
      payments: pagamentosApi,
      ...(freteCent > 0 ? { freight_amount: freteCent / 100 } : {}),
      origin: origem,
    };
    return {
      novos,
      corpo: Object.keys(novos).length > 0 ? null : corpo,
      assinatura: JSON.stringify(corpo),
    };
  }

  return {
    loja,
    setLoja,
    itens,
    linhas,
    adicionarProduto,
    atualizarItem,
    removerItem,
    pagamentos,
    adicionarPagamento,
    adquirentes,
    adquirenteDe,
    taxaDe,
    taxasCarregadas,
    cartaoIncompleto,
    atualizarPagamento,
    removerPagamento,
    cliente,
    setCliente,
    totalCent,
    descontoCent,
    descontoPct,
    aPagarCent,
    frete,
    freteCent,
    definirFrete: setFrete,
    origem,
    definirOrigem: setOrigem,
    somaPagamentos,
    faltaCent,
    trocoCent,
    reiniciar,
    montar,
    carregarOrcamento,
    soltarOrcamento,
  };
}

export type EstadoDaVenda = ReturnType<typeof useVenda>;
