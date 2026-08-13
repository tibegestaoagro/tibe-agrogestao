import type { NegotiationType, Prisma } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { runSerializableTenantTransaction } from "@/lib/financial";
import { recordMovementInTx, type HerdPositionKey } from "@/lib/actions/herd-ledger";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

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
  occurred_at?: Date | null;
  /** §6.3 e §7.3: "o pagamento já foi feito?" */
  pago?: boolean;
  /** §14: quando não foi pago. A soma tem que dar exatamente `amount`. */
  parcelas?: ParcelaInput[];
  custos?: CustoInput[];
  notes?: string | null;
  recorded_by_user_id?: string | null;
};

/** §16, derivada dos filhos: nunca gravada. Ver o comentário no schema. */
export type SituacaoNegociacao =
  | "confirmada"
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

const CATEGORIA_FINANCEIRA: Record<"compra_gado" | "venda_gado", string> = {
  compra_gado: "Compra de animal",
  venda_gado: "Venda de animal",
};

type Falha = { ok: false; code: string; message: string; status: number };

/**
 * Aborta a transação carregando o erro de negócio.
 *
 * POR QUE UM THROW, e não um `return fail(...)`: devolver um valor de dentro do
 * callback de `$transaction` **confirma** a transação. Só um throw faz rollback.
 * Como a negociação é criada ANTES dos movimentos, um `return fail` numa venda
 * sem saldo deixava o envelope gravado e órfão, apontando para nada. Quem pegou
 * foi o próprio teste de atomicidade do `test:m35`.
 */
class AbortarNegociacao extends Error {
  constructor(readonly falha: Falha) {
    super(falha.message);
    this.name = "AbortarNegociacao";
  }
}

/** Converte o abort de volta em resultado, depois do rollback já ter ocorrido. */
async function comRollback<T>(
  operacao: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await operacao();
  } catch (err) {
    if (err instanceof AbortarNegociacao) return err.falha;
    throw err;
  }
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
  if (!input.pago && parcelas.length > 0) {
    // §14: "a soma das parcelas deverá corresponder ao valor financeiro da
    // operação". Validado em centavos e RECUSADO, não ajustado: corrigir a
    // conta do produtor em silêncio esconderia um erro de digitação dele.
    const soma = parcelas.reduce((s, p) => s + centavos(p.amount), 0);
    if (soma !== centavos(input.amount)) {
      return {
        code: "PARCELAS_NAO_FECHAM",
        message: `A soma das parcelas (R$ ${(soma / 100).toLocaleString("pt-BR")}) não corresponde ao valor do negócio (R$ ${input.amount.toLocaleString("pt-BR")}). Revise os valores.`,
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
    const negociacao = await tx.negotiation.create({
      data: scoped({
        type: input.type,
        occurred_at,
        property_id: input.property_id,
        contact_id: input.contact_id ?? null,
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
        ? [{ due_date: occurred_at, amount: input.amount }]
        : input.parcelas;

    for (const parcela of parcelas) {
      await tx.financialEntry.create({
        data: scoped({
          entry_type: compra ? "expense" : "income",
          category: CATEGORIA_FINANCEIRA[input.type],
          amount: parcela.amount,
          related_module: "rebanho",
          related_id: negociacao.id,
          due_date: parcela.due_date,
          paid_at: input.pago ? occurred_at : null,
          status: input.pago ? "paid" : "pending",
          negotiation_id: negociacao.id,
          negotiation_role: "principal",
        }),
      });
    }

    // §15: frete, comissão e taxas são DESPESA sempre, mesmo numa venda, e
    // lançamento próprio para aparecerem no DRE e no fluxo de caixa. Em campos
    // da negociação eles sumiriam do financeiro, e o produtor veria a venda
    // render menos sem conseguir apontar onde.
    for (const custo of input.custos ?? []) {
      await tx.financialEntry.create({
        data: scoped({
          entry_type: "expense",
          category: custo.descricao,
          amount: custo.amount,
          related_module: "rebanho",
          related_id: negociacao.id,
          due_date: occurred_at,
          paid_at: input.pago ? occurred_at : null,
          status: input.pago ? "paid" : "pending",
          negotiation_id: negociacao.id,
          negotiation_role: "custo_adicional",
        }),
      });
    }

    return ok({ id: negociacao.id });
    }),
  );
}

function derivarSituacao(
  canceled_at: Date | null,
  lancamentosPrincipais: { status: string }[],
): SituacaoNegociacao {
  if (canceled_at) return "cancelada";
  const pagos = lancamentosPrincipais.filter((l) => l.status === "paid").length;
  if (pagos === 0) return "confirmada";
  if (pagos === lancamentosPrincipais.length) return "paga";
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
    situacao: derivarSituacao(n.canceled_at, principais),
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
export async function cancelNegotiation(
  db: TenantPrismaClient,
  id: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  const negociacao = await db.negotiation.findFirst({
    where: { id },
    include: { movements: true },
  });
  if (!negociacao) return fail("NOT_FOUND", "Negociação não encontrada", 404);
  if (negociacao.canceled_at) {
    return fail("ALREADY_CANCELED", "Esta negociação já foi cancelada", 422);
  }

  return comRollback(() =>
    runSerializableTenantTransaction(db, async (tx) => {
    for (const movimento of negociacao.movements) {
      if (movimento.canceled_at) continue;

      // Só o DESTINO pode ficar negativo ao desfazer: cancelar devolve à
      // origem e tira do destino. Mesma regra de `cancelMovement`, repetida
      // aqui porque precisa rodar dentro DESTA transação.
      if (movimento.to_category_id && movimento.to_property_id) {
        const posicoes = await tx.herdMovement.findMany({
          where: { canceled_at: null },
          select: {
            quantity: true,
            from_category_id: true,
            from_property_id: true,
            from_pasture_id: true,
            to_category_id: true,
            to_property_id: true,
            to_pasture_id: true,
          },
        });
        const mesmaPosicao = (c: string | null, p: string | null, past: string | null) =>
          c === movimento.to_category_id &&
          p === movimento.to_property_id &&
          past === movimento.to_pasture_id;

        const disponivel = posicoes.reduce((soma, linha) => {
          let s = soma;
          if (mesmaPosicao(linha.to_category_id, linha.to_property_id, linha.to_pasture_id)) {
            s += linha.quantity;
          }
          if (mesmaPosicao(linha.from_category_id, linha.from_property_id, linha.from_pasture_id)) {
            s -= linha.quantity;
          }
          return s;
        }, 0);

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

    // Lançamento financeiro cancelado, não apagado: o §17.10 exige o histórico,
    // e o status `cancelled` já existe e já é ignorado pelo DRE e pelo caixa.
    await tx.financialEntry.updateMany({
      where: { negotiation_id: id },
      data: { status: "cancelled" },
    });

    await tx.negotiation.update({
      where: { id },
      data: { canceled_at: new Date(), canceled_reason: reason },
    });

    return ok({ id });
    }),
  );
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
