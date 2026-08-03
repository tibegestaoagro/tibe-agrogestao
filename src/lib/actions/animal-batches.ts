import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry, runSerializableTenantTransaction } from "@/lib/financial";
import { decToNum } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lógica de negócio de AnimalBatch (Módulo 25, spec seção 2). Cada aquisição
 * (compra ou nascimento) gera um lote novo, nunca acumula numa linha
 * existente da mesma categoria: preserva o custo de cada compra
 * separadamente. Venda decrementa FIFO entre lotes da mesma categoria (mais
 * antigo primeiro), sem escolha do usuário sobre qual lote consumir.
 */

// ── Criação de lote (compra / entrada) ──────────────────────────────

export async function createBatchAction(
  db: TenantPrismaClient,
  input: {
    category_id: string;
    property_id: string;
    quantity: number;
    average_weight?: number | null;
    acquisition_cost?: number | null;
    acquired_at?: Date | null;
  },
): Promise<ActionResult<{ id: string; category_id: string; category_name: string; quantity: number }>> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return fail("VALIDATION_ERROR", "A quantidade deve ser um número inteiro positivo", 422);
  }
  if (input.acquisition_cost != null && input.acquisition_cost < 0) {
    return fail("VALIDATION_ERROR", "O custo de aquisição não pode ser negativo", 422);
  }
  if (input.average_weight != null && input.average_weight <= 0) {
    return fail("VALIDATION_ERROR", "O peso médio deve ser positivo", 422);
  }

  const property = await db.property.findFirst({ where: { id: input.property_id } });
  if (!property) return fail("INVALID_PROPERTY", "Propriedade inválida", 422);
  if (property.archived_at) {
    return fail(
      "PROPERTY_ARCHIVED",
      "Não é possível registrar lote em propriedade arquivada",
      422,
    );
  }

  const category = await db.animalCategory.findFirst({ where: { id: input.category_id } });
  if (!category) return fail("INVALID_CATEGORY", "Categoria inválida", 422);
  if (!category.active) return fail("CATEGORY_INACTIVE", "Categoria desativada", 422);

  const acquiredAt = input.acquired_at ?? new Date();

  const batch = await db.animalBatch.create({
    data: scoped({
      property_id: input.property_id,
      category_id: input.category_id,
      quantity: input.quantity,
      average_weight: input.average_weight ?? null,
      acquisition_cost: input.acquisition_cost ?? null,
      acquired_at: acquiredAt,
    }),
  });

  // Sem valor: lote sem custo e sem lançamento financeiro (nem todo lote vem
  // de compra, pode ser nascimento na propriedade: spec 4).
  if (input.acquisition_cost != null && input.acquisition_cost > 0) {
    await createLinkedEntry(db, {
      entry_type: "expense",
      category: `Compra de lote - ${category.name}`,
      amount: input.acquisition_cost,
      related_module: "rebanho",
      related_id: batch.id,
      occurred_at: acquiredAt,
    });
  }

  return ok({
    id: batch.id,
    category_id: category.id,
    category_name: category.name,
    quantity: batch.quantity,
  });
}

// ── Venda com FIFO entre lotes da mesma categoria ───────────────────

export async function sellFromCategoryAction(
  db: TenantPrismaClient,
  input: {
    category_id: string;
    quantity: number;
    value?: number | null;
    occurred_at?: Date | null;
  },
): Promise<
  ActionResult<{
    category_name: string;
    quantity: number;
    consumed: { batch_id: string; quantity: number; value: number | null }[];
  }>
> {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return fail("VALIDATION_ERROR", "A quantidade deve ser um número inteiro positivo", 422);
  }
  if (input.value != null && input.value < 0) {
    return fail("VALIDATION_ERROR", "O valor da venda não pode ser negativo", 422);
  }

  const category = await db.animalCategory.findFirst({ where: { id: input.category_id } });
  if (!category) return fail("INVALID_CATEGORY", "Categoria inválida", 422);

  const occurredAt = input.occurred_at ?? new Date();

  return runSerializableTenantTransaction(db, async (tx) => {
    // Lotes zerados ficam fora da busca de "categoria disponível para vender"
    // (spec 3, nota sobre quantity = 0), mas continuam existindo para histórico.
    const batches = await tx.animalBatch.findMany({
      where: { category_id: input.category_id, quantity: { gt: 0 } },
      orderBy: [{ acquired_at: "asc" }, { created_at: "asc" }],
    });

    const available = batches.reduce((sum, b) => sum + b.quantity, 0);
    if (available < input.quantity) {
      return fail(
        "INSUFFICIENT_QUANTITY",
        `Disponível apenas ${available} na categoria '${category.name}': não é possível vender ${input.quantity}`,
        422,
      );
    }

    // Plano de consumo FIFO (mais antigo primeiro), sem perguntar ao usuário.
    const plan: { batch_id: string; currentQuantity: number; take: number }[] = [];
    let remaining = input.quantity;
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      plan.push({ batch_id: batch.id, currentQuantity: batch.quantity, take });
      remaining -= take;
    }

    // Divide o valor total da venda proporcionalmente entre os lotes
    // consumidos (quantidade), ajustando o último lote pelo resto para o
    // total bater exatamente com o valor informado (evita drift de arredondamento).
    // A spec não define o método de rateio quando a venda consome mais de um
    // lote: decisão registrada no relatório final do Módulo 25.
    let assignedValue = 0;
    const consumed: { batch_id: string; quantity: number; value: number | null }[] = [];

    for (let i = 0; i < plan.length; i++) {
      const item = plan[i]!;
      await tx.animalBatch.update({
        where: { id: item.batch_id },
        data: { quantity: item.currentQuantity - item.take },
      });

      let entryValue: number | null = null;
      if (input.value != null) {
        entryValue =
          i === plan.length - 1
            ? Math.round((input.value - assignedValue) * 100) / 100
            : Math.round(((input.value * item.take) / input.quantity) * 100) / 100;
        assignedValue += entryValue;
      }

      if (entryValue != null && entryValue > 0) {
        await createLinkedEntry(tx, {
          entry_type: "income",
          category: `Venda de lote - ${category.name}`,
          amount: entryValue,
          related_module: "rebanho",
          related_id: item.batch_id,
          occurred_at: occurredAt,
        });
      }

      consumed.push({ batch_id: item.batch_id, quantity: item.take, value: entryValue });
    }

    return ok({ category_name: category.name, quantity: input.quantity, consumed });
  });
}

// ── Consulta (usado pela listagem unificada de /rebanho) ────────────

export function serializeBatch(b: {
  id: string;
  category_id: string;
  property_id: string;
  quantity: number;
  average_weight: unknown;
  acquisition_cost: unknown;
  acquired_at: Date;
  created_at: Date;
}) {
  return {
    id: b.id,
    category_id: b.category_id,
    property_id: b.property_id,
    quantity: b.quantity,
    average_weight: decToNum(b.average_weight),
    acquisition_cost: decToNum(b.acquisition_cost),
    acquired_at: b.acquired_at.toISOString(),
    created_at: b.created_at.toISOString(),
  };
}
