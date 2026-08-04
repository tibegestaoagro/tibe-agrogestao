import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { createLinkedEntry } from "@/lib/financial";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Movimentação do animal: compra, venda, transferência e morte, com o
 * lançamento financeiro correspondente. Separado de `animals.ts` na
 * auditoria de 2026-08-04 (ver comentário lá).
 */

export async function addMovementAction(
  db: TenantPrismaClient,
  input: {
    batch_id: string;
    movement_type: "purchase" | "sale" | "transfer" | "death";
    from_property_id?: string | null;
    to_property_id?: string | null;
    value?: number | null;
    notes?: string | null;
    occurred_at?: Date | null;
    /** Quantas cabeças se moveram. Default 1 (uma cabeça identificada). */
    quantity?: number | null;
  },
): Promise<ActionResult<{ movement_type: string; value: number | null }>> {
  const batch = await db.animalBatch.findFirst({ where: { id: input.batch_id } });
  if (!batch) return fail("NOT_FOUND", "Rebanho não encontrado", 404);

  const occurred = input.occurred_at ?? new Date();
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return fail("VALIDATION_ERROR", "A quantidade deve ser um inteiro positivo", 422);
  }
  let from_property_id = input.from_property_id ?? null;
  const to_property_id = input.to_property_id ?? null;

  if (input.movement_type === "transfer") {
    if (!to_property_id) {
      return fail(
        "VALIDATION_ERROR",
        "Transferência exige a propriedade de destino",
        422,
      );
    }
    const dest = await db.property.findFirst({ where: { id: to_property_id } });
    if (!dest) return fail("INVALID_PROPERTY", "Propriedade de destino inválida", 422);
    from_property_id = from_property_id ?? batch.property_id;
  }

  await db.animalMovement.create({
    data: scoped({
      batch_id: input.batch_id,
      movement_type: input.movement_type,
      from_property_id,
      to_property_id,
      quantity,
      value: input.value ?? null,
      notes: input.notes ?? null,
      occurred_at: occurred,
    }),
  });

  // Sem `status` no modelo único (2026-08-04): saída BAIXA a quantidade.
  // `decrement` com piso em zero evita quantidade negativa se a mesma baixa
  // for registrada duas vezes.
  if (input.movement_type === "sale" || input.movement_type === "death") {
    const baixa = Math.min(quantity, batch.quantity);
    if (baixa > 0) {
      await db.animalBatch.update({
        where: { id: input.batch_id },
        data: { quantity: { decrement: baixa } },
      });
    }
  }
  // `to_property_id` já foi validado como presente no ramo de transferência
  // acima; o `if` aqui é só para o compilador saber disso.
  if (input.movement_type === "transfer" && to_property_id) {
    await db.animalBatch.update({
      where: { id: input.batch_id },
      data: { property_id: to_property_id },
    });
  }

  if (input.value != null && input.value > 0) {
    if (input.movement_type === "sale") {
      await createLinkedEntry(db, {
        entry_type: "income",
        category: "Venda de animal",
        amount: input.value,
        related_module: "rebanho",
        related_id: input.batch_id,
        occurred_at: occurred,
      });
    } else if (input.movement_type === "purchase") {
      await createLinkedEntry(db, {
        entry_type: "expense",
        category: "Compra de animal",
        amount: input.value,
        related_module: "rebanho",
        related_id: input.batch_id,
        occurred_at: occurred,
      });
    }
  }

  return ok({ movement_type: input.movement_type, value: input.value ?? null });
}
