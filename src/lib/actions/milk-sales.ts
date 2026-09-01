import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import {
  createLinkedEntry,
  runSerializableTenantTransaction,
  type FinancialEntryCreateClient,
} from "@/lib/financial";
import { decToNum } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { delegates } from "@/lib/prisma-delegates";
import { conferirLocal } from "@/lib/actions/milk-sites";
import { getMilkBalance, recordMilkMovementInTx } from "@/lib/actions/milk-ledger";

/**
 * A venda de leite (Área Leite, fase 3, §23 a §29). Ver
 * docs/specs/module-32-area-leite.md, seção 13.
 *
 * A venda é uma `Negotiation` de tipo `venda_leite`, e herda a maquinaria
 * inteira: parcelas (§27, recebimento futuro), custos adicionais (o desconto
 * do laticínio) e cancelamento com estorno. Não é reuso por economia: o §26 e
 * o §27 SÃO pago e a prazo, e o §33 manda a venda aparecer em Negociações.
 *
 * ⚠️ O CANCELAMENTO NÃO MORA AQUI. Ele é `cancelNegotiation`, que passou a
 * desfazer o leite junto, porque a tela de Negociações já tem um botão que
 * chama aquela função direto. Uma segunda porta deixaria o leite para trás
 * justamente por onde o produtor mais cancela.
 */

/** §25: o produtor informa um dos dois, e o TIBÉ calcula o outro. */
export type PrecoInput = {
  /** Valor total da venda. */
  amount?: number | null;
  /** Preço por litro. */
  price_per_liter?: number | null;
};

/**
 * Resolve o §25: com o total, devolve o total; com o preço por litro,
 * multiplica.
 *
 * O que se GRAVA é sempre o total, e o preço por litro é derivado na leitura.
 * Gravar os dois criaria duas fontes que divergem assim que uma for editada,
 * que é a mesma razão de o saldo nunca ser gravado (invariante 2).
 *
 * Isto NÃO contradiz a decisão de não calcular a receita do §22: lá faltava o
 * período (o §22 não diz sobre quais litros somar os R$ 0,05), e aqui os dois
 * operandos vêm do mesmo gesto do produtor. Calcular o que está à vista é
 * ajuda; calcular o que depende de um período que ninguém definiu é invenção.
 */
export function resolverValor(
  litros: number,
  preco: PrecoInput,
): ActionResult<number> {
  const total = preco.amount ?? null;
  const porLitro = preco.price_per_liter ?? null;

  if (total == null && porLitro == null) {
    return fail(
      "VALOR_OBRIGATORIO",
      "Informe o valor total ou o valor por litro.",
      422,
      "amount",
    );
  }
  if (total != null && porLitro != null) {
    // Aceitar os dois obrigaria a escolher qual vence quando eles não batem, e
    // qualquer escolha seria silenciosa. O §25 apresenta os dois como
    // alternativas, não como conferência.
    return fail(
      "VALOR_DUPLICADO",
      "Informe o valor total OU o valor por litro, não os dois.",
      422,
      "amount",
    );
  }

  const valor = total != null ? total : litros * (porLitro as number);
  const arredondado = Math.round(valor * 100) / 100;
  if (!Number.isFinite(arredondado) || arredondado <= 0) {
    return fail(
      "VALOR_INVALIDO",
      "O valor da venda deve ser maior que zero.",
      422,
      total != null ? "amount" : "price_per_liter",
    );
  }
  return ok(arredondado);
}

export type ParcelaInput = { due_date: Date; amount: number };
export type CustoInput = { descricao: string; amount: number };

export type MilkSaleInput = {
  site_id: string;
  property_id: string;
  liters: number;
  buyer_id?: string | null;
  occurred_at?: Date | null;
  /** §26 e §27: pago na hora, ou a receber. */
  pago?: boolean;
  due_date?: Date | null;
  parcelas?: ParcelaInput[];
  custos?: CustoInput[];
  notes?: string | null;
  recorded_by_user_id?: string | null;
} & PrecoInput;

export type MilkSaleResult = {
  negotiation_id: string;
  liters: number;
  amount: number;
  price_per_liter: number;
};

/**
 * "Vendi 500 litros por R$ 2,40" (§23 a §27).
 *
 * Vender JÁ RETIRA o leite (decisão 13.2): os 500 saem do local e a venda
 * nasce na mesma transação. É como o produtor fala, e o §23 lista a quantidade
 * vendida como informação obrigatória.
 *
 * O leite vendido é sempre o PRÓPRIO: vender leite de terceiro que está no seu
 * tanque seria vender o que não é seu, e o §19 é explícito em que ele continua
 * pertencendo ao produtor de origem. Quem intermedeia registra a retirada
 * (fase 2) e cobra pelo serviço (§22).
 */
export async function recordMilkSale(
  db: TenantPrismaClient,
  input: MilkSaleInput,
): Promise<ActionResult<MilkSaleResult>> {
  const litros = Math.round(input.liters * 100) / 100;
  if (!Number.isFinite(litros) || litros <= 0) {
    return fail("QUANTIDADE_INVALIDA", "Informe quantos litros foram vendidos.", 422, "liters");
  }

  const valor = resolverValor(litros, input);
  if (!valor.ok) return valor;

  const local = await conferirLocal(db, input.site_id, "site_id");
  if (!local.ok) return local;

  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Fazenda inválida.", 422, "property_id");

  if (input.buyer_id) {
    const comprador = await db.contact.findFirst({ where: { id: input.buyer_id } });
    if (!comprador) return fail("INVALID_BUYER", "Comprador inválido.", 422, "buyer_id");
  }

  const saldo = await getMilkBalance(db, { site_id: input.site_id, owner_id: null });
  if (litros > saldo) {
    return fail(
      "SALDO_INSUFICIENTE",
      `Você tem ${saldo.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} litros seus em "${local.data.name}".`,
      422,
      "liters",
    );
  }

  const occurred_at = input.occurred_at ?? new Date();
  const total = valor.data;

  const criada = await runSerializableTenantTransaction(db, async (tx) => {
    const negociacao = await tx.negotiation.create({
      data: scoped({
        type: "venda_leite",
        occurred_at,
        property_id: input.property_id,
        contact_id: input.buyer_id ?? null,
        amount: total,
        notes: input.notes ?? null,
        recorded_by_user_id: input.recorded_by_user_id ?? null,
      }),
    });

    const movimento = await recordMilkMovementInTx(tx, {
      movement_type: "saida",
      liters: litros,
      occurred_at,
      from: { site_id: input.site_id, owner_id: null },
      destination: "venda",
      recorded_by_user_id: input.recorded_by_user_id,
    });
    if (!movimento.ok) throw new VendaRecusada(movimento);

    await tx.milkMovement.update({
      where: { id: movimento.data.id },
      data: {
        negotiation_id: negociacao.id,
        buyer_id: input.buyer_id ?? null,
        // A marca que diz ao cancelamento para CANCELAR esta linha, e não só
        // soltar a cobrança: este leite só saiu porque a venda aconteceu.
        created_by_sale: true,
      },
    });

    await lancarDinheiro(tx, {
      negotiation_id: negociacao.id,
      amount: total,
      occurred_at,
      pago: input.pago ?? false,
      due_date: input.due_date ?? null,
      parcelas: input.parcelas ?? [],
      custos: input.custos ?? [],
      descricao: "Venda de leite",
    });

    return negociacao.id;
  }).catch((erro) => {
    if (erro instanceof VendaRecusada) return erro.resultado;
    throw erro;
  });

  if (typeof criada !== "string") return criada;

  return ok({
    negotiation_id: criada,
    liters: litros,
    amount: total,
    price_per_liter: Math.round((total / litros) * 10000) / 10000,
  });
}

/** Carrega a recusa do livro-razão para fora da transação, desfazendo o resto. */
class VendaRecusada extends Error {
  constructor(readonly resultado: Extract<ActionResult<never>, { ok: false }>) {
    super(resultado.message);
  }
}

/**
 * O dinheiro da venda, nas três formas que o §26 e o §27 descrevem.
 *
 * Tudo por `createLinkedEntry`, nunca `FinancialEntry` à mão: é o que o
 * CLAUDE.md exige, e é o que garante que o cancelamento e o DRE encontrem o
 * lançamento pelo `negotiation_id`.
 */
async function lancarDinheiro(
  tx: FinancialEntryCreateClient,
  p: {
    negotiation_id: string;
    amount: number;
    occurred_at: Date;
    pago: boolean;
    due_date: Date | null;
    parcelas: ParcelaInput[];
    custos: CustoInput[];
    descricao: string;
  },
): Promise<void> {
  const comum = {
    entry_type: "income" as const,
    related_module: "leite" as const,
    related_id: p.negotiation_id,
    negotiation_id: p.negotiation_id,
    negotiation_role: "principal" as const,
    occurred_at: p.occurred_at,
  };

  if (p.parcelas.length > 0) {
    // §27: cada parcela é uma conta a receber com a própria data.
    for (const parcela of p.parcelas) {
      await createLinkedEntry(tx, {
        ...comum,
        category: `${p.descricao} (parcela)`,
        amount: Math.round(parcela.amount * 100) / 100,
        status: "pending",
        due_date: parcela.due_date,
      });
    }
  } else if (p.pago) {
    // §26: recebimento imediato.
    await createLinkedEntry(tx, {
      ...comum,
      category: p.descricao,
      amount: p.amount,
      status: "paid",
    });
  } else {
    // §27 sem parcelamento: uma conta a receber só.
    await createLinkedEntry(tx, {
      ...comum,
      category: p.descricao,
      amount: p.amount,
      status: "pending",
      due_date: p.due_date ?? p.occurred_at,
    });
  }

  // §15 do Módulo 31, que o leite herda: frete e desconto do laticínio saem
  // como custo, e não abatidos do valor, para o bruto continuar legível.
  for (const custo of p.custos) {
    await createLinkedEntry(tx, {
      entry_type: "expense",
      category: custo.descricao,
      amount: Math.round(custo.amount * 100) / 100,
      related_module: "leite",
      related_id: p.negotiation_id,
      negotiation_id: p.negotiation_id,
      negotiation_role: "custo_adicional",
      occurred_at: p.occurred_at,
      status: "paid",
    });
  }
}

// ── §28 e §29: o fechamento por período ──────────────────────────────────

export type EntregaEmAberto = {
  buyer_id: string;
  liters: number;
  entregas: number;
  primeira: Date;
  ultima: Date;
};

/**
 * As entregas que já saíram para um comprador e ainda NÃO foram cobradas
 * (§28).
 *
 * "Ainda não cobradas" é `negotiation_id: null`: a marca é posta no
 * fechamento, e é ela que impede cobrar o mesmo leite duas vezes.
 */
export async function listPendingDeliveries(
  db: TenantPrismaClient,
  filtros: { buyer_id?: string; de?: Date; ate?: Date } = {},
): Promise<EntregaEmAberto[]> {
  const linhas = await delegates(db).milkMovement.findMany({
    where: {
      canceled_at: null,
      negotiation_id: null,
      buyer_id: filtros.buyer_id ? filtros.buyer_id : { not: null },
      ...(filtros.de || filtros.ate
        ? {
            occurred_at: {
              ...(filtros.de ? { gte: filtros.de } : {}),
              ...(filtros.ate ? { lte: filtros.ate } : {}),
            },
          }
        : {}),
    },
    select: { buyer_id: true, liters: true, occurred_at: true },
    orderBy: { occurred_at: "asc" },
  });

  const porComprador = new Map<string, EntregaEmAberto>();
  for (const l of linhas) {
    if (!l.buyer_id) continue;
    const atual = porComprador.get(l.buyer_id);
    const litros = decToNum(l.liters) ?? 0;
    if (!atual) {
      porComprador.set(l.buyer_id, {
        buyer_id: l.buyer_id,
        liters: litros,
        entregas: 1,
        primeira: l.occurred_at,
        ultima: l.occurred_at,
      });
    } else {
      atual.liters = Math.round((atual.liters + litros) * 100) / 100;
      atual.entregas += 1;
      atual.ultima = l.occurred_at;
    }
  }

  return Array.from(porComprador.values()).sort((a, b) => b.liters - a.liters);
}

export type CloseMilkPeriodInput = {
  buyer_id: string;
  property_id: string;
  de: Date;
  ate: Date;
  pago?: boolean;
  due_date?: Date | null;
  parcelas?: ParcelaInput[];
  custos?: CustoInput[];
  period_label?: string | null;
  notes?: string | null;
  recorded_by_user_id?: string | null;
} & PrecoInput;

/**
 * "No fim do período, o produtor realiza o fechamento" (§28 e §29).
 *
 * O fechamento NÃO move leite: ele cobra o que já saiu. As entregas do período
 * recebem o `negotiation_id` da venda, e é isso que as tira da lista de
 * pendentes. Fechar duas vezes o mesmo período não cobra duas vezes, porque a
 * segunda não encontra nada em aberto.
 *
 * O exemplo do §29 sai daqui: 15 dias, 7.200 litros a R$ 2,35, R$ 16.920,00 em
 * Contas a Receber.
 */
export async function closeMilkPeriod(
  db: TenantPrismaClient,
  input: CloseMilkPeriodInput,
): Promise<ActionResult<MilkSaleResult & { entregas: number }>> {
  const comprador = await db.contact.findFirst({
    where: { id: input.buyer_id },
    select: { id: true, name: true },
  });
  if (!comprador) return fail("INVALID_BUYER", "Comprador inválido.", 422, "buyer_id");

  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Fazenda inválida.", 422, "property_id");

  if (input.de > input.ate) {
    return fail("PERIODO_INVERTIDO", "A data inicial é depois da final.", 422, "de");
  }

  const pendentes = await listPendingDeliveries(db, {
    buyer_id: input.buyer_id,
    de: input.de,
    ate: input.ate,
  });
  const resumo = pendentes[0];
  if (!resumo || resumo.liters <= 0) {
    return fail(
      "SEM_ENTREGAS",
      `Não há entrega em aberto para ${comprador.name} nesse período.`,
      422,
      "buyer_id",
    );
  }

  const valor = resolverValor(resumo.liters, input);
  if (!valor.ok) return valor;

  const occurred_at = input.ate;
  const total = valor.data;

  const negotiationId = await runSerializableTenantTransaction(db, async (tx) => {
    const negociacao = await tx.negotiation.create({
      data: scoped({
        type: "venda_leite",
        occurred_at,
        property_id: input.property_id,
        contact_id: input.buyer_id,
        amount: total,
        notes:
          input.notes ??
          (input.period_label ? `Fechamento do período: ${input.period_label}` : null),
        recorded_by_user_id: input.recorded_by_user_id ?? null,
      }),
    });

    /**
     * A marca vai por `updateMany` com as MESMAS condições da leitura, dentro
     * da transação serializável. Reler os ids e marcá-los um a um deixaria uma
     * janela em que uma entrega nova entra no período entre a leitura e a
     * escrita: ela seria cobrada por este fechamento sem ter sido somada.
     *
     * `created_by_sale` fica FALSE, e é isso que diz ao cancelamento para só
     * soltar a cobrança: estas entregas aconteceram de verdade.
     */
    const marcadas = await tx.milkMovement.updateMany({
      where: {
        canceled_at: null,
        negotiation_id: null,
        buyer_id: input.buyer_id,
        occurred_at: { gte: input.de, lte: input.ate },
      },
      data: { negotiation_id: negociacao.id },
    });

    if (marcadas.count === 0) {
      throw new VendaRecusada({
        ok: false,
        code: "SEM_ENTREGAS",
        message: `Não há entrega em aberto para ${comprador.name} nesse período.`,
        status: 422,
        field: "buyer_id",
      });
    }

    await lancarDinheiro(tx, {
      negotiation_id: negociacao.id,
      amount: total,
      occurred_at,
      pago: input.pago ?? false,
      due_date: input.due_date ?? null,
      parcelas: input.parcelas ?? [],
      custos: input.custos ?? [],
      descricao: `Fechamento de leite: ${comprador.name}`,
    });

    return negociacao.id;
  }).catch((erro) => {
    if (erro instanceof VendaRecusada) return erro.resultado;
    throw erro;
  });

  if (typeof negotiationId !== "string") return negotiationId;

  return ok({
    negotiation_id: negotiationId,
    liters: resumo.liters,
    amount: total,
    price_per_liter: Math.round((total / resumo.liters) * 10000) / 10000,
    entregas: resumo.entregas,
  });
}
