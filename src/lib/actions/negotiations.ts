import type { NegotiationType, Prisma, FinancialEntryStatus } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { runSerializableTenantTransaction, createLinkedEntry } from "@/lib/financial";
import { recordMovementInTx, getPositions, type HerdPositionKey } from "@/lib/actions/herd-ledger";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { findOrCreateContact } from "@/lib/actions/contacts";
import { getStockBalance, deltaDoMovimento } from "@/lib/actions/stock-ledger";
import { descreverQuantidade } from "@/lib/stock/units";

/**
 * Área Negociações (docs/moduloNegociacao), missão 1: negócio de gado.
 *
 * A DECISÃO CENTRAL, tomada com o usuário por grilling em 2026-08-11: a
 * Negociação é um **envelope comercial**, não a fonte da verdade. O §17.1 pede
 * "registro único", e isso é exigência de EXPERIÊNCIA (o produtor preenche um
 * formulário só); o armazenamento continua como estava, com o saldo do rebanho
 * sendo a soma de `HerdMovement` e o dinheiro vivendo em `FinancialEntry`.
 *
 * Consequência prática: aqui não se calcula saldo nem se grava quantidade. Esta
 * action só orquestra, e cada peça é gravada por quem já sabe gravá-la.
 *
 * TUDO NUMA TRANSAÇÃO SÓ. Uma negociação com 2 categorias e 3 parcelas são 6
 * escritas: ou entram todas ou nenhuma. É por isso que existe
 * `recordMovementInTx`: chamar `recordMovement` em sequência abriria uma
 * transação por movimento, e uma falha no terceiro deixaria os dois primeiros
 * gravados, com o rebanho já alterado e sem negociação nenhuma apontando.
 *
 * O dinheiro passa por `createLinkedEntry`, como o CLAUDE.md exige de todo
 * lançamento automático. O helper ganhou `negotiation_id`/`negotiation_role`
 * para isto (`src/lib/financial.ts`). Uma versão anterior criava o
 * `FinancialEntry` direto e justificava o desvio dizendo que o helper "abre a
 * própria transação": era falso, ele recebe o client por parâmetro e já era
 * chamado com `tx` em quatro lugares, inclusive no `herd-ledger.ts` em que esta
 * action se apoia.
 */

export type ItemGadoInput = {
  category_id: string;
  quantity: number;
  pasture_id?: string | null;
};

export type ParcelaInput = { due_date: Date; amount: number };

export type CustoInput = { descricao: string; amount: number };

export type NegociacaoGadoInput = {
  type: "compra_gado" | "venda_gado";
  property_id: string;
  itens: ItemGadoInput[];
  /** Valor PRINCIPAL combinado, sem os custos adicionais (§15). */
  amount: number;
  contact_id?: string | null;
  /**
   * Nome dito na conversa ("comprei 20 bezerros DO JOÃO", §18.1). Resolvido ou
   * criado DENTRO da transação, para que uma recusa posterior (saldo
   * insuficiente, por exemplo) não deixe o contato órfão no banco.
   * Ignorado quando `contact_id` já vem preenchido.
   */
  contact_name?: string | null;
  occurred_at?: Date | null;
  /** §6.3 e §7.3: "o pagamento já foi feito?" */
  pago?: boolean;
  /**
   * §6.3 e §7.3: quando NÃO foi pago, o vencimento é o primeiro dado pedido
   * ("Data de vencimento; Quantidade de parcelas, QUANDO HOUVER"). Sem ele, a
   * conta nascia vencendo no mesmo dia e o alerta `bill_due` disparava na hora,
   * mostrando como atrasada uma conta combinada para dali a 30 dias.
   * Ignorado quando há parcelas: aí cada parcela traz o seu.
   */
  due_date?: Date | null;
  /** §14: quando não foi pago. A soma tem que dar exatamente `amount`. */
  parcelas?: ParcelaInput[];
  custos?: CustoInput[];
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

/** §16, derivada dos filhos: nunca gravada. Ver o comentário no schema. */
export type SituacaoNegociacao =
  | "confirmada"
  /** §14: parcela em aberto com vencimento no passado. */
  | "vencida"
  | "parcialmente_paga"
  | "paga"
  | "cancelada";

export type NegotiationDetail = {
  id: string;
  type: NegotiationType;
  occurred_at: Date;
  property_id: string;
  contact_id: string | null;
  contact_name: string | null;
  amount: number | null;
  notes: string | null;
  canceled_at: Date | null;
  canceled_reason: string | null;
  created_at: Date;
  situacao: SituacaoNegociacao;
  totais: {
    /** O valor combinado. */
    principal: number;
    /** Frete, comissão, taxas (§15). */
    custos: number;
    /** O que a compra custou de verdade: principal + custos. */
    total: number;
    /** O que a venda rendeu de verdade: principal - custos. */
    liquido: number;
  };
  movimentos: {
    id: string;
    movement_type: string;
    quantity: number;
    /** Categoria negociada: destino numa compra, origem numa venda. */
    category_id: string | null;
    canceled_at: Date | null;
  }[];
  /**
   * Os produtos, quando o negócio é de insumo (§9). Uma negociação de gado tem
   * esta lista vazia e vice-versa; ficam separadas porque animal se conta por
   * categoria e produto se conta por unidade, e juntar os dois numa lista só
   * obrigaria toda leitura a descobrir qual dos dois está olhando.
   */
  produtos: {
    id: string;
    product_id: string;
    product_name: string;
    unit: string;
    quantity: number;
    canceled_at: Date | null;
  }[];
  lancamentos: {
    id: string;
    entry_type: string;
    amount: number;
    status: string;
    due_date: Date | null;
    category: string | null;
    negotiation_role: string | null;
  }[];
};

/**
 * Todo tipo de negociação que ENTRA dinheiro.
 *
 * Existe como função porque a comparação estava escrita à mão como
 * `type === "venda_gado"`, e no dia em que `venda_produto` passou a existir a
 * situação dela virou "decidida pelos custos": uma venda inteiramente recebida
 * ficava sem situação nenhuma, e uma venda a receber com o frete pago aparecia
 * como PAGA, com o dinheiro do produtor ainda na rua. Achado por um revisor
 * independente, não por teste. A missão 3 traz `evento` e a 4 traz `permuta`:
 * as duas passam por aqui, e a lista precisa ser um lugar só.
 */
function ehVenda(tipo: NegotiationType): boolean {
  return tipo === "venda_gado" || tipo === "venda_produto";
}

/**
 * Onde o estorno do cancelamento é arquivado.
 *
 * O lançamento original de uma compra de PRODUTO nasce `geral`, e o estorno dela
 * estava indo para `rebanho`: cancelar uma compra de adubo devolvia o dinheiro
 * dentro do módulo Rebanho. Valor e sinal estavam certos, a gaveta não.
 */
function moduloDoEstorno(tipo: NegotiationType): "rebanho" | "geral" {
  return tipo === "compra_gado" || tipo === "venda_gado" ? "rebanho" : "geral";
}

const CATEGORIA_FINANCEIRA: Record<"compra_gado" | "venda_gado", string> = {
  compra_gado: "Compra de animal",
  venda_gado: "Venda de animal",
};

type Falha = {
  ok: false;
  code: string;
  message: string;
  status: number;
  /** Preservado até a rota: é o que põe a mensagem embaixo do campo certo. */
  field?: string;
};

/**
 * Aborta a transação carregando o erro de negócio.
 *
 * POR QUE UM THROW, e não um `return fail(...)`: devolver um valor de dentro do
 * callback de `$transaction` **confirma** a transação. Só um throw faz rollback.
 * Como a negociação é criada ANTES dos movimentos, um `return fail` numa venda
 * sem saldo deixava o envelope gravado e órfão, apontando para nada. Quem pegou
 * foi o próprio teste de atomicidade do `test:m35`.
 */
export class AbortarNegociacao extends Error {
  constructor(readonly falha: Falha) {
    super(falha.message);
    this.name = "AbortarNegociacao";
  }
}

/** Converte o abort de volta em resultado, depois do rollback já ter ocorrido. */
export async function comRollback<T>(
  operacao: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await operacao();
  } catch (err) {
    if (err instanceof AbortarNegociacao) return err.falha;
    throw err;
  }
}

/**
 * Os status que ainda representam uma conta viva.
 *
 * `overdue` entra junto com `pending` em TODOS os pontos: nada no código grava
 * esse status hoje, mas o enum existe, a tela do Financeiro filtra por ele e
 * oferece cancelamento para ele. No dia em que alguém passar a gravá-lo, olhar
 * só `pending` faria um negócio cancelado deixar uma conta atrasada viva, e a
 * situação derivada deixaria de enxergar o atraso.
 */
const EM_ABERTO: FinancialEntryStatus[] = ["pending", "overdue"];

/** Moeda como o produtor lê: "R$ 60.000,00", com centavos, nunca "R$ 60.000". */
function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Comparação de dinheiro em centavos: `0.1 + 0.2 !== 0.3` em ponto flutuante. */
function centavos(v: number): number {
  return Math.round(v * 100);
}

function validar(input: NegociacaoGadoInput): { code: string; message: string } | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { code: "VALIDATION_ERROR", message: "Informe o valor total do negócio." };
  }
  if (!input.itens || input.itens.length === 0) {
    return { code: "VALIDATION_ERROR", message: "Informe a categoria e a quantidade dos animais." };
  }
  for (const item of input.itens) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return {
        code: "VALIDATION_ERROR",
        message: "A quantidade de animais deve ser um número inteiro maior que zero.",
      };
    }
  }
  for (const custo of input.custos ?? []) {
    if (!Number.isFinite(custo.amount) || custo.amount < 0) {
      return { code: "VALIDATION_ERROR", message: "Custo adicional não pode ser negativo." };
    }
  }

  const parcelas = input.parcelas ?? [];
  // Pago à vista E parcelado é contradição: antes desta checagem as parcelas
  // eram descartadas em silêncio e o produtor via uma linha só, quitada, sem
  // nenhum aviso de que o parcelamento que ele digitou tinha sumido.
  if (input.pago && parcelas.length > 0) {
    return {
      code: "VALIDATION_ERROR",
      message: "Um negócio já pago não pode ser parcelado. Escolha uma coisa ou outra.",
    };
  }
  if (!input.pago && parcelas.length > 0) {
    // §14: "a soma das parcelas deverá corresponder ao valor financeiro da
    // operação". Validado em centavos e RECUSADO, não ajustado: corrigir a
    // conta do produtor em silêncio esconderia um erro de digitação dele.
    const soma = parcelas.reduce((s, p) => s + centavos(p.amount), 0);
    if (soma !== centavos(input.amount)) {
      return {
        code: "PARCELAS_NAO_FECHAM",
        message:
          `A soma das parcelas (${moeda(soma / 100)}) não corresponde ao valor ` +
          `do negócio (${moeda(input.amount)}). Revise os valores.`,
      };
    }
    if (parcelas.some((p) => !Number.isFinite(p.amount) || p.amount <= 0)) {
      return { code: "VALIDATION_ERROR", message: "Cada parcela precisa de um valor maior que zero." };
    }
  }

  return null;
}

export async function createCattleNegotiation(
  db: TenantPrismaClient,
  input: NegociacaoGadoInput,
): Promise<ActionResult<{ id: string }>> {
  const erro = validar(input);
  if (erro) return fail(erro.code, erro.message, 422);

  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Fazenda inválida", 422);
  if (input.contact_id) {
    const contato = await db.contact.findFirst({ where: { id: input.contact_id } });
    if (!contato) return fail("INVALID_CONTACT", "Contato inválido", 422);
  }

  const occurred_at = input.occurred_at ?? new Date();
  const compra = input.type === "compra_gado";

  return comRollback(() =>
    runSerializableTenantTransaction(db, async (tx) => {
    // §4: o contato nasce com só o nome, sem classificação. A regra vive em
    // `contacts.ts` e roda com o `tx` desta transação: se a negociação for
    // recusada adiante (saldo, por exemplo), o contato não fica órfão.
    let contactId = input.contact_id ?? null;
    if (!contactId && input.contact_name?.trim()) {
      contactId = (await findOrCreateContact(tx, input.contact_name)).id;
    }

    const negociacao = await tx.negotiation.create({
      data: scoped({
        type: input.type,
        occurred_at,
        property_id: input.property_id,
        contact_id: contactId,
        amount: input.amount,
        notes: input.notes ?? null,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
      }),
    });

    // Os animais. Numa compra entram; numa venda saem, e é o livro-razão que
    // barra saldo negativo (§7.5), com a mesma trava já validada em produção.
    for (const item of input.itens) {
      const posicao: HerdPositionKey = {
        category_id: item.category_id,
        property_id: input.property_id,
        pasture_id: item.pasture_id ?? null,
        situation: "presente",
        owner: "proprio",
      };

      const movimento = await recordMovementInTx(db, tx, {
        movement_type: compra ? "compra" : "venda",
        quantity: item.quantity,
        from: compra ? null : posicao,
        to: compra ? posicao : null,
        // O valor NÃO vai aqui: quem cria o lançamento financeiro é esta
        // action, com as parcelas e os custos do negócio. Deixar o livro-razão
        // criar também geraria dois lançamentos para a mesma compra.
        value: null,
        occurred_at,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
        negotiation_id: negociacao.id,
      });
      // throw, nao return: e o unico jeito de desfazer a negociacao ja criada.
      if (!movimento.ok) throw new AbortarNegociacao(movimento);
    }

    // O dinheiro do valor principal: uma linha à vista, ou uma por parcela.
    const parcelas: ParcelaInput[] =
      input.pago || !input.parcelas || input.parcelas.length === 0
        ? [
            {
              // Sem vencimento informado, a conta vence HOJE, não na data do
              // negócio: num registro retroativo ("comprei semana passada,
              // ainda não paguei") ela nasceria vencida, disparando o alerta
              // `bill_due` na criação e pintando a linha de vermelho. Mesma
              // regra do custo adicional, abaixo, que já tinha sido corrigido.
              due_date: input.pago ? occurred_at : (input.due_date ?? new Date()),
              amount: input.amount,
            },
          ]
        : input.parcelas;

    for (const parcela of parcelas) {
      await createLinkedEntry(tx, {
        entry_type: compra ? "expense" : "income",
        category: CATEGORIA_FINANCEIRA[input.type],
        amount: parcela.amount,
        related_module: "rebanho",
        related_id: negociacao.id,
        occurred_at,
        due_date: parcela.due_date,
        status: input.pago ? "paid" : "pending",
        negotiation_id: negociacao.id,
        negotiation_role: "principal",
      });
    }

    // §15: frete, comissão e taxas são DESPESA sempre, mesmo numa venda, e
    // lançamento próprio para aparecerem no DRE e no fluxo de caixa. Em campos
    // da negociação eles sumiriam do financeiro, e o produtor veria a venda
    // render menos sem conseguir apontar onde.
    for (const custo of input.custos ?? []) {
      await createLinkedEntry(tx, {
        entry_type: "expense",
        category: custo.descricao,
        amount: custo.amount,
        related_module: "rebanho",
        related_id: negociacao.id,
        occurred_at,
        // Um custo em aberto NÃO vence na data do negócio: num registro
        // retroativo ("comprei semana passada") ele nasceria vencido e marcaria
        // a negociação inteira como "Vencida" no instante da criação. Segue o
        // vencimento combinado; sem ele, a data do próprio registro.
        due_date: input.pago ? occurred_at : (input.due_date ?? new Date()),
        status: input.pago ? "paid" : "pending",
        negotiation_id: negociacao.id,
        negotiation_role: "custo_adicional",
      });
    }

    return ok({ id: negociacao.id });
    }),
  );
}

/**
 * §16, derivada dos filhos, nunca gravada.
 *
 * "Vencida" (§14) vence sobre "confirmada" e sobre "parcialmente_paga" de
 * propósito: é a única das situações que pede ação hoje, e escondê-la atrás de
 * "parcial" faria a linha que precisa de atenção parecer igual à que está em
 * dia. Só perde para "paga" e "cancelada", que já encerraram o assunto.
 *
 * `agora` entra por parâmetro para tornar a função determinística: quem
 * chama de dentro de um teste pode fixar o dia e provar as duas bordas
 * (vence hoje, venceu ontem) sem depender de quando a suíte roda.
 */
function derivarSituacao(
  canceled_at: Date | null,
  lancamentosPrincipais: { status: string; due_date: Date | null }[],
  agora: Date = new Date(),
): SituacaoNegociacao {
  if (canceled_at) return "cancelada";
  const pagos = lancamentosPrincipais.filter((l) => l.status === "paid").length;
  if (pagos === lancamentosPrincipais.length && lancamentosPrincipais.length > 0) return "paga";

  // Comparação por DIA, não por instante: uma conta que vence HOJE não está
  // vencida, e comparar timestamps fazia um negócio criado agora, com
  // vencimento hoje, nascer "vencido" milissegundos depois.
  const inicioDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const vencida = lancamentosPrincipais.some(
    (l) => (EM_ABERTO as string[]).includes(l.status) && l.due_date != null && l.due_date < inicioDeHoje,
  );
  if (vencida) return "vencida";

  if (pagos === 0) return "confirmada";
  return "parcialmente_paga";
}

export async function getNegotiation(
  db: TenantPrismaClient,
  id: string,
): Promise<NegotiationDetail | null> {
  const n = await db.negotiation.findFirst({
    where: { id },
    include: {
      contact: { select: { name: true } },
      movements: {
        select: {
          id: true,
          movement_type: true,
          quantity: true,
          from_category_id: true,
          to_category_id: true,
          canceled_at: true,
        },
        orderBy: { created_at: "asc" },
      },
      stock_movements: {
        select: {
          id: true,
          product_id: true,
          quantity: true,
          canceled_at: true,
          product: { select: { name: true, unit: true } },
        },
        orderBy: { created_at: "asc" },
      },
      entries: {
        select: {
          id: true,
          entry_type: true,
          amount: true,
          status: true,
          due_date: true,
          category: true,
          negotiation_role: true,
        },
        orderBy: { due_date: "asc" },
      },
    },
  });
  if (!n) return null;

  const lancamentos = n.entries.map((e) => ({
    id: e.id,
    entry_type: e.entry_type,
    amount: decToNum(e.amount) ?? 0,
    status: e.status,
    due_date: e.due_date,
    category: e.category,
    negotiation_role: e.negotiation_role,
  }));

  const principais = lancamentos.filter((l) => l.negotiation_role === "principal");
  const custosLista = lancamentos.filter((l) => l.negotiation_role === "custo_adicional");

  // Os totais são SOMA, nunca campo: é a mesma regra do saldo do rebanho.
  const principal = principais.reduce((s, l) => s + l.amount, 0);
  const custos = custosLista.reduce((s, l) => s + l.amount, 0);

  return {
    id: n.id,
    type: n.type,
    occurred_at: n.occurred_at,
    property_id: n.property_id,
    contact_id: n.contact_id,
    contact_name: n.contact?.name ?? null,
    amount: decToNum(n.amount),
    notes: n.notes,
    canceled_at: n.canceled_at,
    canceled_reason: n.canceled_reason,
    created_at: n.created_at,
    /**
     * A situação olha os lançamentos NA DIREÇÃO do negócio: despesa numa
     * compra, receita numa venda.
     *
     * Isso resolve os dois erros opostos que já aconteceram aqui. Olhar só o
     * `principal` deixava uma COMPRA com frete em aberto aparecendo como
     * "Quitada" enquanto o mesmo frete era somado em "Ainda tenho a pagar" na
     * mesma tela. Olhar TUDO fazia uma VENDA inteiramente recebida aparecer
     * como "Parcialmente recebida", porque o frete dela é despesa e entrava na
     * conta como se fosse um recebimento que faltou.
     *
     * Numa compra, principal e custos são os dois despesa, então ambos contam:
     * o negócio só está quitado quando não sobra nada a pagar. Numa venda, o
     * que se recebe é a receita; o frete é uma conta a pagar de verdade, que
     * aparece em "Ainda tenho a pagar" e não torna a venda "parcialmente
     * recebida". Estorno fica fora dos dois: ele registra que o dinheiro
     * voltou, não é uma conta do negócio.
     */
    situacao: derivarSituacao(
      n.canceled_at,
      lancamentos.filter(
        (l) =>
          l.negotiation_role !== "estorno" &&
          l.entry_type === (ehVenda(n.type) ? "income" : "expense"),
      ),
    ),
    totais: {
      principal,
      custos,
      total: principal + custos,
      liquido: principal - custos,
    },
    movimentos: n.movements.map((m) => ({
      id: m.id,
      movement_type: m.movement_type,
      quantity: m.quantity,
      // Numa compra os animais ENTRAM (to); numa venda SAEM (from).
      category_id: m.to_category_id ?? m.from_category_id,
      canceled_at: m.canceled_at,
    })),
    produtos: n.stock_movements.map((m) => ({
      id: m.id,
      product_id: m.product_id,
      product_name: m.product.name,
      unit: m.product.unit,
      quantity: decToNum(m.quantity) ?? 0,
      canceled_at: m.canceled_at,
    })),
    lancamentos,
  };
}

export type NegotiationFilter = {
  type?: NegotiationType;
  contact_id?: string;
  property_id?: string;
  since?: Date;
  until?: Date;
  include_canceled?: boolean;
};

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 200;

export async function listNegotiations(
  db: TenantPrismaClient,
  filter: NegotiationFilter = {},
  options: { limit?: number; offset?: number } = {},
): Promise<{ items: NegotiationDetail[]; total: number }> {
  const where: Prisma.NegotiationWhereInput = {};
  if (filter.include_canceled === false) where.canceled_at = null;
  if (filter.type) where.type = filter.type;
  if (filter.contact_id) where.contact_id = filter.contact_id;
  if (filter.property_id) where.property_id = filter.property_id;
  if (filter.since || filter.until) {
    where.occurred_at = {
      ...(filter.since ? { gte: filter.since } : {}),
      ...(filter.until ? { lte: filter.until } : {}),
    };
  }

  const take = Math.min(Math.max(options.limit ?? LIMITE_PADRAO, 1), LIMITE_MAXIMO);
  const skip = Math.max(options.offset ?? 0, 0);

  const [linhas, total] = await Promise.all([
    db.negotiation.findMany({
      where,
      orderBy: [{ occurred_at: "desc" }, { created_at: "desc" }, { id: "desc" }],
      take,
      skip,
      select: { id: true },
    }),
    db.negotiation.count({ where }),
  ]);

  const items: NegotiationDetail[] = [];
  for (const linha of linhas) {
    const detalhe = await getNegotiation(db, linha.id);
    if (detalhe) items.push(detalhe);
  }

  return { items, total };
}

/**
 * §17.9: cancelar recalcula tudo. Como saldo é sempre soma, "recalcular" aqui
 * é cancelar os filhos: os movimentos param de contar no rebanho e os
 * lançamentos deixam de pesar no financeiro. A negociação permanece no
 * histórico, identificada (§17.10).
 *
 * O documento pede alerta quando parte do item já foi movimentada. Isso já
 * existe pronto no livro-razão: cancelar uma entrada é bloqueado quando os
 * animais que entraram por ela já saíram. Aqui a checagem é a mesma, feita
 * antes de mexer em qualquer coisa.
 */
/**
 * O que fazer com o dinheiro que JÁ FOI PAGO, quando o negócio é cancelado.
 *
 * As três são realidades diferentes do curral, e o produtor resolve na mesma
 * tela, sem sair para o Financeiro (decisão do usuário, 2026-08-13: correto
 * contabilmente, mas sem exigir desvio).
 *
 * - `mantem`: paguei e o dinheiro não voltou. A despesa continua lançada,
 *   porque saiu mesmo. É o padrão, e o único que não inventa nada.
 * - `devolvido`: o dinheiro voltou. Gera um lançamento de ESTORNO com a data de
 *   hoje, em vez de apagar o original: saiu num mês e voltou em outro, e o DRE
 *   dos dois meses precisa contar a história como ela aconteceu.
 * - `engano`: o pagamento nunca existiu, foi erro de digitação. Aí o lançamento
 *   é cancelado, porque não há nada que ele represente no mundo.
 */
export type DestinoDoPagamento = "mantem" | "devolvido" | "engano";

export async function cancelNegotiation(
  db: TenantPrismaClient,
  id: string,
  reason: string,
  dinheiroPago: DestinoDoPagamento = "mantem",
  /** §17.10: quem desfez. Sem isto, o evento mais sensível ficava sem autor. */
  canceledByUserId?: string | null,
): Promise<
  ActionResult<{
    id: string;
    /** O que já tinha ENTRADO e continua lançado (principal de uma venda). */
    valor_recebido_mantido: number;
    /** O que já tinha SAÍDO e continua lançado (principal de uma compra, custos). */
    valor_pago_mantido: number;
    valor_estornado: number;
  }>
> {
  return comRollback(() =>
    runSerializableTenantTransaction(db, async (tx) => {
    /**
     * A leitura e a guarda ficam DENTRO da transação, de propósito.
     *
     * `runSerializableTenantTransaction` reexecuta o callback inteiro em caso
     * de P2034 (conflito de serialização). Com a guarda do lado de fora, dois
     * cancelamentos concorrentes levavam a um reexecutar sem passar de novo
     * pela checagem de `canceled_at`, criando um SEGUNDO lançamento de estorno
     * com a mesma data: o produtor veria o dinheiro voltando duas vezes.
     */
    const negociacao = await tx.negotiation.findFirst({
      where: { id },
      include: { movements: true, stock_movements: { include: { product: true } } },
    });
    if (!negociacao) {
      throw new AbortarNegociacao({
        ok: false,
        code: "NOT_FOUND",
        message: "Negociação não encontrada",
        status: 404,
      });
    }
    if (negociacao.canceled_at) {
      throw new AbortarNegociacao({
        ok: false,
        code: "ALREADY_CANCELED",
        message: "Esta negociação já foi cancelada",
        status: 422,
      });
    }

    /**
     * O QUE FAZER COM O QUE JÁ FOI PAGO.
     *
     * Isto NÃO vem do §17.9: aquele parágrafo fala de ITEM já utilizado,
     * vendido ou movimentado, e está atendido logo abaixo, na conferência de
     * saldo. O que segue é decisão de produto, tomada com o usuário em
     * 2026-08-13, sem parágrafo que a exija.
     *
     * Duas versões anteriores erraram aqui, em direções opostas. A primeira
     * marcava `cancelled` TODO lançamento, inclusive os `paid`: uma compra de
     * R$ 60.000 quitada em janeiro, cancelada em março, sumia do DRE e do fluxo
     * de caixa como se o dinheiro nunca tivesse saído da conta. A segunda
     * recusou o cancelamento inteiro quando havia qualquer pago, e isso foi
     * pior: o formulário nasce em "à vista", então o caminho MAIS COMUM do
     * módulo passava a gerar um registro que ninguém consegue mais desfazer, e
     * a mensagem mandava o produtor "desfazer o pagamento no Financeiro", que é
     * uma ação que a tela do Financeiro não oferece para lançamento pago.
     *
     * A resposta certa é contábil, não de permissão: cancelar um negócio não
     * des-gasta o dinheiro. Os animais voltam, as contas em ABERTO somem, e o
     * que já saiu da conta segue o que `dinheiroPago` disser (ver
     * `DestinoDoPagamento`), resolvido na mesma tela, sem desvio para o
     * Financeiro.
     *
     * O resultado devolve quanto ficou e quanto foi estornado, para a resposta
     * ao produtor dizer o que aconteceu com o dinheiro dele.
     */
    const pagos = await tx.financialEntry.findMany({
      where: { negotiation_id: id, status: "paid" },
      select: { id: true, amount: true, entry_type: true },
    });

    /**
     * SAÍDA E ENTRADA NÃO SE SOMAM. Cada lado é estornado com o sinal
     * contrário AO SEU, nunca ao da negociação.
     *
     * Uma versão anterior somava tudo num `totalPago` e criava um único
     * lançamento contrário ao tipo do negócio. Na COMPRA dava certo por
     * coincidência, porque principal e custos são os dois despesa. Na VENDA
     * não: o principal é receita e o frete é despesa, e somar os dois com o
     * mesmo sinal errava o estorno em exatamente 2x os custos. Com o exemplo
     * do §15 (venda de R$ 80.000, comissão 4.000, frete 1.500), o estorno saía
     * como despesa de R$ 85.500 e o resultado ficava em -11.000 onde deveria
     * ser 0.
     */
    const recebido = pagos
      .filter((l) => l.entry_type === "income")
      .reduce((s, l) => s + Number(l.amount), 0);
    const desembolsado = pagos
      .filter((l) => l.entry_type === "expense")
      .reduce((s, l) => s + Number(l.amount), 0);

    // Separados, não somados: numa venda o principal ENTROU e os custos
    // saíram, e juntá-los num número só sob o rótulo "pago" é a mesma mistura
    // que o estorno abaixo existe para não fazer. A tela de cancelamento já
    // mostra os dois em frases diferentes.
    let valorRecebidoMantido = recebido;
    let valorPagoMantido = desembolsado;
    let valorEstornado = 0;

    if (pagos.length > 0 && dinheiroPago === "devolvido") {
      /**
       * O dinheiro voltou: lançamento NOVO, com a data de hoje. Apagar o
       * original faria o mês em que o dinheiro saiu fechar como se nada tivesse
       * saído, e o mês em que voltou como se nada tivesse entrado: dois
       * fechamentos errados em vez de zero.
       */
      if (desembolsado > 0) {
        await createLinkedEntry(tx, {
          entry_type: "income",
          category: "Devolução de valor pago",
          amount: desembolsado,
          related_module: moduloDoEstorno(negociacao.type),
          related_id: id,
          occurred_at: new Date(),
          status: "paid",
          negotiation_id: id,
          negotiation_role: "estorno",
        });
      }
      if (recebido > 0) {
        await createLinkedEntry(tx, {
          entry_type: "expense",
          category: "Devolução de valor recebido",
          amount: recebido,
          related_module: moduloDoEstorno(negociacao.type),
          related_id: id,
          occurred_at: new Date(),
          status: "paid",
          negotiation_id: id,
          negotiation_role: "estorno",
        });
      }
      valorEstornado = recebido + desembolsado;
      valorRecebidoMantido = 0;
      valorPagoMantido = 0;
    }

    if (pagos.length > 0 && dinheiroPago === "engano") {
      // O pagamento nunca existiu: não há nada no mundo que a linha represente.
      await tx.financialEntry.updateMany({
        where: { id: { in: pagos.map((l) => l.id) } },
        data: { status: "cancelled" },
      });
      valorRecebidoMantido = 0;
      valorPagoMantido = 0;
    }

    for (const movimento of negociacao.movements) {
      if (movimento.canceled_at) continue;

      /**
       * Só o DESTINO pode ficar negativo ao desfazer: cancelar devolve à
       * origem e tira do destino.
       *
       * Usa `getPositions` com a chave COMPLETA da posição, a mesma que
       * `cancelMovement` usa. A versão anterior reimplementava a soma aqui e
       * comparava só 3 dos 5 eixos (faltavam `situation` e `owner`), sob um
       * comentário que afirmava ser "a mesma regra": não era. Um movimento que
       * só muda a situação (presente -> evento, boitel, desaparecido) casava
       * dos dois lados e se anulava, então animais que saíram para leilão
       * seguiam contando como disponíveis e o cancelamento passava, empurrando
       * o destino para negativo. A fase 2 do Módulo 30 e a missão 3 deste
       * módulo acionam exatamente esses valores.
       *
       * A justificativa da cópia ("precisa rodar dentro DESTA transação")
       * também não procedia: `getPositions` aceita qualquer `HerdLedgerClient`,
       * e o próprio `herd-ledger.ts` já a chama com `tx`. De quebra, a cópia
       * lia a tabela INTEIRA de movimentações do tenant, sem filtro, dentro de
       * uma transação serializável, uma vez por movimento.
       */
      if (movimento.to_category_id && movimento.to_property_id) {
        const [posicao] = await getPositions(tx, {
          category_id: movimento.to_category_id,
          property_id: movimento.to_property_id,
          pasture_id: movimento.to_pasture_id,
          situation: movimento.to_situation ?? undefined,
          owner: movimento.to_owner ?? undefined,
        });
        const disponivel = posicao?.quantity ?? 0;

        if (disponivel < movimento.quantity) {
          // throw: sem isso, um movimento ja cancelado no laco anterior ficaria
          // cancelado mesmo com a operacao recusada.
          throw new AbortarNegociacao({
            ok: false,
            code: "INSUFFICIENT_BALANCE",
            message: `Não dá para cancelar: esta negociação trouxe ${movimento.quantity} animais e restam apenas ${disponivel} na fazenda. Parte deles já foi vendida ou movimentada.`,
            status: 422,
          });
        }
      }

      await tx.herdMovement.update({
        where: { id: movimento.id },
        data: { canceled_at: new Date(), canceled_reason: reason },
      });
    }

    /**
     * O estoque, pela MESMA regra do rebanho (§17.9).
     *
     * Cancelar uma compra de produto tira do estoque o que ela colocou, e por
     * isso é recusada quando parte do produto já foi usada: 20 sacas compradas
     * e 18 já dadas ao gado deixariam o saldo em -16, e o §10.7 existe
     * justamente para o saldo nunca ficar negativo. Uma VENDA cancelada devolve
     * ao estoque e nunca precisa dessa conferência, porque devolver só soma.
     */
    for (const movimento of negociacao.stock_movements) {
      if (movimento.canceled_at) continue;

      const entrouNoEstoque = deltaDoMovimento({
        movement_type: movimento.movement_type,
        quantity: decToNum(movimento.quantity) ?? 0,
        previous_balance: decToNum(movimento.previous_balance),
        corrected_balance: decToNum(movimento.corrected_balance),
      });

      if (entrouNoEstoque > 0) {
        const [posicao] = await getStockBalance(tx, {
          product_id: movimento.product_id,
          property_id: movimento.property_id,
        });
        const disponivel = posicao?.quantity ?? 0;
        if (disponivel < entrouNoEstoque) {
          throw new AbortarNegociacao({
            ok: false,
            code: "INSUFFICIENT_STOCK",
            message:
              `Não dá para cancelar: esta negociação trouxe ` +
              `${descreverQuantidade(entrouNoEstoque, movimento.product.unit)} de ` +
              `${movimento.product.name} e restam apenas ` +
              `${descreverQuantidade(disponivel, movimento.product.unit)}. ` +
              `Parte já foi usada ou vendida.`,
            status: 422,
          });
        }
      }

      await tx.stockMovement.update({
        where: { id: movimento.id },
        data: { canceled_at: new Date(), canceled_reason: reason },
      });
    }

    // Só as contas em ABERTO. O que já foi pago foi tratado acima, conforme
    // `dinheiroPago`. Cancelado, não apagado: o §17.10 exige o histórico.
    //
    // O DRE passou a ignorar `cancelled` em 2026-08-13 (`financial-reports.ts`):
    // até então filtrava só por data, e um negócio desfeito continuava pesando
    // no "Resultado do mês". O fluxo de caixa nunca teve o problema, porque
    // filtra `status: "paid"`.
    await tx.financialEntry.updateMany({
      where: { negotiation_id: id, status: { in: EM_ABERTO } },
      data: { status: "cancelled" },
    });

    await tx.negotiation.update({
      where: { id },
      data: {
        canceled_at: new Date(),
        canceled_reason: reason,
        canceled_by_user_id: canceledByUserId ?? null,
      },
    });

    return ok({
      id,
      valor_recebido_mantido: valorRecebidoMantido,
      valor_pago_mantido: valorPagoMantido,
      valor_estornado: valorEstornado,
    });
    }),
  );
}

/**
 * Os dois números do topo da tela (§2: "Quanto ainda tenho para pagar?" e
 * "Quanto tenho para receber?").
 *
 * Query própria, e não soma da lista já carregada, porque a lista é PAGINADA:
 * somar o que veio na página dava um total certo só até a 30ª negociação e
 * errado dali em diante, sem nada na tela avisando. Um número que o banco não
 * sustenta é exatamente o que o cabeçalho da tela promete não fazer.
 *
 * A comissão pendente de uma VENDA é despesa (§15) e entra em "a pagar", não
 * abatida do "a receber": ela vira uma conta a pagar de verdade, e escondê-la
 * dentro do líquido faria sumir do painel um compromisso real.
 */
/**
 * O rótulo da situação como o produtor lê, que depende do TIPO: §16 separa as
 * situações de compra e de venda ("Parcialmente recebida", "Recebida").
 *
 * Fica aqui, e não na página, porque já houve uma inversão de sinal real neste
 * ponto (uma venda em aberto aparecia como "A pagar", na única coluna que se lê
 * de relance) e função pura é o que permite provar que não voltou.
 */
export function situacaoLabel(situacao: SituacaoNegociacao | string, venda: boolean): string {
  switch (situacao) {
    case "confirmada":
      return venda ? "A receber" : "A pagar";
    case "vencida":
      return "Vencida";
    case "parcialmente_paga":
      return venda ? "Parcialmente recebida" : "Parcialmente paga";
    case "paga":
      return venda ? "Recebida" : "Quitada";
    case "cancelada":
      return "Cancelada";
    default:
      // Situação nova sem rótulo: melhor uma palavra genérica do que vazar o
      // nome do enum ("parcialmente_paga") na tela do produtor. O `tsc` já
      // obriga a tratar todo valor de `SituacaoNegociacao`, então este ramo só
      // é alcançável por dado vindo de fora do tipo.
      return "Em andamento";
  }
}

export async function getOpenTotals(
  db: TenantPrismaClient,
  filtro: { property_id?: string } = {},
): Promise<{ aPagar: number; aReceber: number }> {
  const lancamentos = await db.financialEntry.findMany({
    where: {
      status: { in: EM_ABERTO },
      negotiation: {
        canceled_at: null,
        ...(filtro.property_id ? { property_id: filtro.property_id } : {}),
      },
    },
    select: { amount: true, entry_type: true },
  });

  let aPagar = 0;
  let aReceber = 0;
  for (const l of lancamentos) {
    const valor = decToNum(l.amount) ?? 0;
    if (l.entry_type === "income") aReceber += valor;
    else aPagar += valor;
  }
  return { aPagar, aReceber };
}

/**
 * Contrato HTTP: `Date` vira ISO8601, `Decimal` vira number. Fica aqui, e não
 * em serializers.ts, porque o tipo de origem é de action: mesmo motivo de
 * `serializeBatch` viver em `animal-batches.ts`.
 */
export function serializeNegotiation(n: NegotiationDetail) {
  return {
    id: n.id,
    type: n.type,
    occurred_at: n.occurred_at.toISOString(),
    property_id: n.property_id,
    contact_id: n.contact_id,
    contact_name: n.contact_name,
    amount: n.amount,
    notes: n.notes,
    canceled_at: isoOrNull(n.canceled_at),
    canceled_reason: n.canceled_reason,
    created_at: n.created_at.toISOString(),
    situacao: n.situacao,
    totais: n.totais,
    movimentos: n.movimentos.map((m) => ({
      id: m.id,
      movement_type: m.movement_type,
      quantity: m.quantity,
      category_id: m.category_id,
      canceled_at: isoOrNull(m.canceled_at),
    })),
    produtos: n.produtos.map((p) => ({
      id: p.id,
      product_id: p.product_id,
      product_name: p.product_name,
      unit: p.unit,
      quantity: p.quantity,
      canceled_at: isoOrNull(p.canceled_at),
    })),
    lancamentos: n.lancamentos.map((l) => ({
      id: l.id,
      entry_type: l.entry_type,
      amount: l.amount,
      status: l.status,
      due_date: isoOrNull(l.due_date),
      category: l.category,
      negotiation_role: l.negotiation_role,
    })),
  };
}
