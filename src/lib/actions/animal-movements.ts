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
    animal_id: string;
    movement_type: "purchase" | "sale" | "transfer" | "death";
    from_property_id?: string | null;
    to_property_id?: string | null;
    value?: number | null;
    notes?: string | null;
    occurred_at?: Date | null;
  },
): Promise<ActionResult<{ movement_type: string; value: number | null }>> {
  const animal = await db.animal.findFirst({ where: { id: input.animal_id } });
  if (!animal) return fail("NOT_FOUND", "Animal não encontrado", 404);

  const occurred = input.occurred_at ?? new Date();
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
    from_property_id = from_property_id ?? animal.property_id;
  }

  await db.animalMovement.create({
    data: scoped({
      animal_id: input.animal_id,
      movement_type: input.movement_type,
      from_property_id,
      to_property_id,
      value: input.value ?? null,
      notes: input.notes ?? null,
      occurred_at: occurred,
    }),
  });

  const animalUpdate: Record<string, unknown> = {};
  if (input.movement_type === "sale") animalUpdate.status = "sold";
  if (input.movement_type === "death") animalUpdate.status = "deceased";
  if (input.movement_type === "transfer") animalUpdate.property_id = to_property_id;
  if (Object.keys(animalUpdate).length > 0) {
    await db.animal.update({ where: { id: input.animal_id }, data: animalUpdate });
  }

  if (input.value != null && input.value > 0) {
    if (input.movement_type === "sale") {
      await createLinkedEntry(db, {
        entry_type: "income",
        category: "Venda de animal",
        amount: input.value,
        related_module: "rebanho",
        related_id: input.animal_id,
        occurred_at: occurred,
      });
    } else if (input.movement_type === "purchase") {
      await createLinkedEntry(db, {
        entry_type: "expense",
        category: "Compra de animal",
        amount: input.value,
        related_module: "rebanho",
        related_id: input.animal_id,
        occurred_at: occurred,
      });
    }
  }

  return ok({ movement_type: input.movement_type, value: input.value ?? null });
}
