"use client";

import { useRef, useState } from "react";
import { lerNumeroBr, reaisBr } from "@/lib/numero-br";

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
export type ContatoDeVenda = { id: string; name: string; incomplete: boolean; consumidor_final: boolean };

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
};

/** A taxa da loja para uma forma de cartão (Q89): é o que o balcão mostra antes de enviar. */
export type RegraCartaoVenda = { establishment_id: string; kind: string; fee_pct: number; days: number };

export const FORMAS_DE_CARTAO: string[] = ["debito", "credito_vista", "credito_parcelado"];
export const ehCartao = (kind: string) => FORMAS_DE_CARTAO.includes(kind);

/** Líquido do cartão, com o mesmo arredondamento da action (`prepararVenda`). */
export function liquidoDoCartaoCent(valorCent: number, feePct: number): { taxaCent: number; liquidoCent: number } {
  const taxaCent = Math.round(Number(((valorCent * feePct) / 100).toPrecision(12)));
  return { taxaCent, liquidoCent: valorCent - taxaCent };
}

export type CampoDaVenda = "establishment_id" | "items" | "customer_id" | "payments";

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

const paraIso = (data: string) => new Date(`${data}T12:00:00`).toISOString();

export type CorpoDaVenda = {
  establishment_id: string;
  customer_id: string | null;
  items: { emporio_product_id: string; presentation_id: string; quantity: number; unit_price: number }[];
  payments: {
    kind: FormaDePagamento;
    amount: number;
    due_date: string | null;
    installments?: number;
    check?: { number: string; bank: string; good_for: string };
  }[];
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
  contatoId: string;
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
  contatoInicial = "",
  abatimentoCent = 0,
  regras = null,
  consumidorFinalId = "",
  cargaInicial = null,
}: {
  /** O orçamento que o balcão abre carregado (`/emporio/vender?orcamento=<id>`). */
  cargaInicial?: CargaDoOrcamento | null;
  /** O contato fixo "Consumidor final": não serve para fiado nem cheque. */
  consumidorFinalId?: string;
  produtos: ProdutoVenda[];
  precos: PrecosVenda;
  lojaInicial: string;
  contatoInicial?: string;
  /** Valor da troca que já paga parte da venda. */
  abatimentoCent?: number;
  /**
   * As taxas de cartão das lojas. `null` = ainda não se sabe (ou a tela não as
   * tem): nesse caso a conferência fica com o servidor, que recusa em `payments`.
   */
  regras?: RegraCartaoVenda[] | null;
}) {
  const contador = useRef(0);
  const proximo = () => {
    contador.current += 1;
    return contador.current;
  };

  const [loja, setLojaEstado] = useState(lojaInicial);
  // Os itens do orçamento inicial ganham chaves negativas: o contador só dá positivas.
  const [itens, setItens] = useState<LinhaItem[]>(() =>
    cargaInicial ? linhasDaCarga(cargaInicial, (n) => -(n + 1)) : [],
  );
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([]);
  const [contatoId, setContatoId] = useState(cargaInicial?.contatoId ?? contatoInicial);
  const [contatosNovos, setContatosNovos] = useState<ContatoDeVenda[]>([]);
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
    setContatoId(carga.contatoId);
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
  const aPagarCent = Math.max(0, totalCent - abatimentoCent);

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
        },
      ];
    });
  }

  /** A taxa da loja escolhida para a forma, ou `null` quando não há (ou ainda não se sabe). */
  function regraDe(kind: string): RegraCartaoVenda | null {
    if (!regras || !loja) return null;
    return regras.find((r) => r.establishment_id === loja && r.kind === kind) ?? null;
  }

  function atualizarPagamento(key: number, parte: Partial<LinhaPagamento>) {
    setPagamentos((lista) => lista.map((p) => (p.key === key ? { ...p, ...parte } : p)));
  }

  function removerPagamento(key: number) {
    setPagamentos((lista) => lista.filter((p) => p.key !== key));
  }

  function reiniciar() {
    setItens([]);
    setPagamentos([]);
    setContatoId(contatoInicial);
    setOrc(null);
  }

  /** Contato cadastrado ou completado agora: vale sobre o que veio do servidor, sem recarregar a página. */
  function contatoAtualizado(c: ContatoDeVenda) {
    setContatosNovos((l) => [...l.filter((x) => x.id !== c.id), c]);
  }

  function contatoCriado(c: ContatoDeVenda) {
    contatoAtualizado(c);
    setContatoId(c.id);
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
    const ehConsumidorFinal = consumidorFinalId !== "" && contatoId === consumidorFinalId;
    if (orcamento) {
      // A mesma frase do servidor (`QUOTE_CUSTOMER_REQUIRED`). O Consumidor final serve;
      // o cadastro incompleto é o servidor que recusa (`QUOTE_CUSTOMER_INCOMPLETE`).
      if (!contatoId) {
        novos.customer_id = "Escolha o cliente do orçamento. Quem não quer se identificar entra como Consumidor final.";
      }
      return {
        novos,
        corpo:
          Object.keys(novos).length > 0
            ? null
            : { establishment_id: loja, customer_id: contatoId, items: itensDaApi(), payments: [] },
        assinatura: JSON.stringify(["orcamento", loja, contatoId, itensDaApi()]),
      };
    }
    if (!contatoId) novos.customer_id = "Escolha o cliente da venda.";
    else if (temFiado && ehConsumidorFinal) novos.customer_id = "Fiado precisa do cliente de verdade, não do Consumidor final.";
    else if (temCheque && ehConsumidorFinal) novos.customer_id = "Cheque precisa do cliente de verdade, não do Consumidor final.";

    const pagamentosApi: CorpoDaVenda["payments"] = [];
    const ilegivel = pagamentos.some((p) => {
      const n = lerNumeroBr(p.valor);
      return n === null || n <= 0;
    });
    const semTaxa = regras && loja ? pagamentos.find((p) => ehCartao(p.kind) && !regraDe(p.kind)) : undefined;
    const chequeIncompleto = pagamentos.some(
      (p) => p.kind === "cheque" && (!p.chequeNumero.trim() || !p.chequeBanco.trim() || !p.chequeBomPara),
    );
    if (ilegivel) {
      novos.payments = "Cada pagamento precisa de um valor maior que zero.";
    } else if (semTaxa) {
      novos.payments = `Esta loja não tem taxa de ${CARTAO_NOME[semTaxa.kind] ?? "cartão"} cadastrada. Cadastre em Caixa, Taxas de cartão (dono ou administrador).`;
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
      customer_id: contatoId || null,
      items: itensDaApi(),
      payments: pagamentosApi,
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
    regraDe,
    regrasCarregadas: regras !== null,
    atualizarPagamento,
    removerPagamento,
    contatoId,
    setContatoId,
    contatosNovos,
    contatoCriado,
    contatoAtualizado,
    totalCent,
    descontoCent,
    descontoPct,
    aPagarCent,
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
