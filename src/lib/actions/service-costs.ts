import type { ServiceCostKind } from "@/generated/prisma/client";
import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { recordStockMovementInTx, getStockBalance } from "@/lib/actions/stock-ledger";
import { decToNum, isoOrNull } from "@/lib/serialize";

/**
 * O custo de um serviço (§21 a §25 do documento de Máquinas).
 *
 * ⚠️ ESTE MÓDULO NÃO É O DINHEIRO DO SERVIÇO. O §25 diz que o cálculo é
 * "gerencial, não contábil": o combustível que saiu do estoque já virou
 * despesa quando foi comprado, e lançá-lo de novo faria o diesel aparecer duas
 * vezes no DRE do mês.
 *
 * Quando o produtor diz que o dinheiro saiu agora (o pedágio, o operador pago
 * por fora), o `FinancialEntry` nasce apontando para o CUSTO, com
 * `related_id` do `ServiceJobCost`. NUNCA para o serviço: `serializar` em
 * `service-jobs.ts` soma por `related_id` do job para descobrir quanto já foi
 * pago, e uma despesa ali faria a ficha dizer "recebido R$ 600" num serviço em
 * que ninguém pagou nada. É a mesma razão de o lote de confinamento somar por
 * junção (decisão 12).
 */

const CATEGORIA: Record<ServiceCostKind, string> = {
  combustivel: "Combustível",
  mao_de_obra: "Mão de obra do serviço",
  pedagio: "Pedágio",
  alimentacao: "Alimentação",
  transporte: "Transporte",
  manutencao: "Manutenção",
  pecas: "Peças",
  lubrificantes: "Lubrificantes",
  comissao: "Comissão",
  outro: "Outros custos do serviço",
};

export type ServiceCostView = {
  id: string;
  kind: ServiceCostKind;
  description: string;
  amount: number | null;
  quantity: number | null;
  unit: string | null;
  occurred_at: string;
  gerou_lancamento: boolean;
  baixou_estoque: boolean;
  canceled_at: string | null;
};

type LinhaDeCusto = {
  id: string;
  kind: ServiceCostKind;
  description: string;
  amount: unknown;
  quantity: unknown;
  unit: string | null;
  occurred_at: Date;
  financial_entry_id: string | null;
  stock_movement_id: string | null;
  canceled_at: Date | null;
};

function serializar(c: LinhaDeCusto): ServiceCostView {
  return {
    id: c.id,
    kind: c.kind,
    description: c.description,
    amount: decToNum(c.amount as never),
    quantity: decToNum(c.quantity as never),
    unit: c.unit,
    occurred_at: c.occurred_at.toISOString(),
    gerou_lancamento: c.financial_entry_id !== null,
    baixou_estoque: c.stock_movement_id !== null,
    canceled_at: isoOrNull(c.canceled_at),
  };
}

export async function recordServiceCost(
  db: TenantPrismaClient,
  input: {
    service_job_id: string;
    kind: ServiceCostKind;
    description: string;
    amount?: number | null;
    occurred_at?: Date | null;
    notes?: string | null;
    /** §17: marcar isto gera a despesa no Financeiro. */
    saiu_do_caixa?: boolean;
    user_id?: string | null;
  },
): Promise<ActionResult<ServiceCostView>> {
  const job = await db.serviceJob.findUnique({ where: { id: input.service_job_id } });
  if (!job) return fail("NOT_FOUND", "Serviço não encontrado.", 404);
  if (job.canceled_at) {
    return fail("CONFLICT", "Este serviço foi cancelado, então não há custo a lançar.", 409);
  }
  if (!(input.description ?? "").trim()) {
    return fail("VALIDATION_ERROR", "Diga qual foi o custo.", 422, "description");
  }
  const valor = input.amount ?? null;
  if (valor !== null && (!Number.isFinite(valor) || valor <= 0)) {
    return fail("VALIDATION_ERROR", "O valor precisa ser maior que zero.", 422, "amount");
  }
  /**
   * Marcar "saiu do caixa" sem dizer quanto é contradição: o lançamento
   * financeiro precisa de um valor, e criar um de R$ 0,00 encheria o
   * Financeiro de linhas que não significam nada.
   */
  if (input.saiu_do_caixa && valor === null) {
    return fail(
      "VALIDATION_ERROR",
      "Para lançar no Financeiro, informe o valor que saiu.",
      422,
      "amount",
    );
  }

  const quando = input.occurred_at ?? new Date();

  const criado = await runSerializableTenantTransaction(db, async (tx) => {
    const custo = await tx.serviceJobCost.create({
      data: scoped({
        service_job_id: job.id,
        kind: input.kind,
        description: input.description.trim(),
        amount: valor,
        occurred_at: quando,
        notes: input.notes?.trim() || null,
        recorded_by_user_id: input.user_id ?? null,
      }),
    });

    if (input.saiu_do_caixa && valor !== null) {
      const lancamento = await createLinkedEntry(tx as never, {
        entry_type: "expense",
        category: CATEGORIA[input.kind],
        amount: valor,
        related_module: "servico",
        related_id: custo.id,
        occurred_at: quando,
        status: "paid",
      });
      await tx.serviceJobCost.update({
        where: { id: custo.id },
        data: { financial_entry_id: lancamento.id },
      });
      return { ...custo, financial_entry_id: lancamento.id };
    }
    return custo;
  });

  return ok(serializar(criado as never));
}

export async function getServiceCosts(
  db: TenantPrismaClient,
  serviceJobId: string,
): Promise<{
  linhas: ServiceCostView[];
  total: number;
  por_natureza: Partial<Record<ServiceCostKind, number>>;
}> {
  const linhas = await db.serviceJobCost.findMany({
    where: { service_job_id: serviceJobId },
    orderBy: { occurred_at: "desc" },
  });

  const por_natureza: Partial<Record<ServiceCostKind, number>> = {};
  let total = 0;
  for (const l of linhas) {
    // Cancelado continua no histórico e sai da soma, como o log de quantidade.
    if (l.canceled_at !== null) continue;
    const valor = decToNum(l.amount) ?? 0;
    total += valor;
    por_natureza[l.kind] = (por_natureza[l.kind] ?? 0) + valor;
  }

  return {
    linhas: linhas.map((l) => serializar(l as never)),
    total: Math.round(total * 100) / 100,
    por_natureza,
  };
}

/**
 * Cancela um custo.
 *
 * ⚠️ O lançamento financeiro, se houver, é CANCELADO e não apagado, e a baixa
 * de estoque NÃO volta. São duas escolhas diferentes de propósito: o dinheiro
 * que saiu do caixa saiu mesmo (o padrão do Módulo 31), enquanto o diesel que
 * o trator queimou não volta para o tanque. Estornar a quantidade faria o saldo
 * do estoque mentir para mais.
 */
export async function cancelServiceCost(
  db: TenantPrismaClient,
  input: { cost_id: string; reason?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const custo = await db.serviceJobCost.findUnique({ where: { id: input.cost_id } });
  if (!custo) return fail("NOT_FOUND", "Custo não encontrado.", 404);
  if (custo.canceled_at) return fail("CONFLICT", "Este custo já foi cancelado.", 409);

  await runSerializableTenantTransaction(db, async (tx) => {
    await tx.serviceJobCost.update({
      where: { id: custo.id },
      data: { canceled_at: new Date(), canceled_reason: input.reason?.trim() || null },
    });
    if (custo.financial_entry_id) {
      await tx.financialEntry.update({
        where: { id: custo.financial_entry_id },
        data: { status: "cancelled" },
      });
    }
  });

  return ok({ id: custo.id });
}

/**
 * O combustível do §21, que baixa do estoque quando o produto existe.
 *
 * ⚠️ O §21 diz "SE o diesel existir no estoque, o TIBÉ deverá reduzir". O SE é
 * literal e é a regra: comprar diesel no posto a caminho da fazenda do cliente
 * é o caso comum, e recusar o custo por falta de cadastro faria o produtor
 * desistir de registrar em vez de cadastrar o produto.
 *
 * ⚠️ E ele NÃO gera despesa (decisão 17): o diesel do estoque já foi pago na
 * compra. O combustível avulso do posto TAMBÉM não, aqui, porque quem quiser
 * a despesa usa `recordServiceCost` com `saiu_do_caixa`. Um caminho só para
 * criar dinheiro é o que impede a duplicata.
 */
export async function recordServiceFuel(
  db: TenantPrismaClient,
  input: {
    service_job_id: string;
    product_id?: string | null;
    description?: string | null;
    quantity: number;
    unit?: string | null;
    unit_price?: number | null;
    amount?: number | null;
    occurred_at?: Date | null;
    user_id?: string | null;
  },
): Promise<ActionResult<ServiceCostView & { saldo_do_produto: number | null }>> {
  const job = await db.serviceJob.findUnique({ where: { id: input.service_job_id } });
  if (!job) return fail("NOT_FOUND", "Serviço não encontrado.", 404);
  if (job.canceled_at) {
    return fail("CONFLICT", "Este serviço foi cancelado.", 409);
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return fail("VALIDATION_ERROR", "Informe quanto foi gasto.", 422, "quantity");
  }

  const produto = input.product_id
    ? await db.product.findUnique({ where: { id: input.product_id } })
    : null;
  if (input.product_id && !produto) {
    return fail("VALIDATION_ERROR", "Produto não encontrado.", 422, "product_id");
  }
  const descricao = (input.description ?? produto?.name ?? "").trim();
  if (!descricao) {
    return fail("VALIDATION_ERROR", "Diga qual foi o combustível.", 422, "description");
  }

  /**
   * O §22 aceita as duas formas de dizer o valor: o total ("gastei R$ 480") e
   * o unitário ("R$ 6,00 o litro"). O total informado VENCE, porque foi o que
   * o produtor viu na bomba.
   */
  let valor: number | null = null;
  if (input.amount !== null && input.amount !== undefined && Number.isFinite(input.amount)) {
    valor = input.amount;
  } else if (
    input.unit_price !== null &&
    input.unit_price !== undefined &&
    Number.isFinite(input.unit_price)
  ) {
    valor = Math.round(input.unit_price * input.quantity * 100) / 100;
  }
  if (valor !== null && valor <= 0) {
    return fail("VALIDATION_ERROR", "O valor precisa ser maior que zero.", 422, "amount");
  }

  const quando = input.occurred_at ?? new Date();

  const criado = await runSerializableTenantTransaction(db, async (tx) => {
    let movimentoId: string | null = null;
    if (produto) {
      const mov = await recordStockMovementInTx(db, tx, {
        product_id: produto.id,
        property_id: job.property_id,
        movement_type: "utilizacao",
        quantity: input.quantity,
        occurred_at: quando,
        service_job_id: job.id,
        purpose: `Serviço: ${job.description}`,
        recorded_by_user_id: input.user_id ?? null,
      });
      if (!mov.ok) throw new Error(mov.message);
      movimentoId = mov.data.id;
    }

    return tx.serviceJobCost.create({
      data: scoped({
        service_job_id: job.id,
        kind: "combustivel",
        description: descricao,
        amount: valor,
        quantity: input.quantity,
        unit: produto?.unit ?? input.unit ?? null,
        occurred_at: quando,
        stock_movement_id: movimentoId,
        recorded_by_user_id: input.user_id ?? null,
      }),
    });
  });

  const saldo = produto
    ? ((await getStockBalance(db, { product_id: produto.id }))[0]?.quantity ?? 0)
    : null;

  return ok({ ...serializar(criado as never), saldo_do_produto: saldo });
}
