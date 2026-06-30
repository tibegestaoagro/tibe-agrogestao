import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializeMovement } from "@/lib/serializers";
import { createLinkedEntry } from "@/lib/financial";

/**
 * GET  /api/v1/animals/:id/movements    histórico de movimentações
 * POST /api/v1/animals/:id/movements    registra compra, venda, transferência ou morte
 *
 * Efeitos:
 * - venda  → status=sold; se value, gera FinancialEntry (receita)
 * - compra → se value, gera FinancialEntry (despesa)
 * - morte  → status=deceased
 * - transferência → atualiza property_id do animal para o destino
 */

const createSchema = z.object({
  movement_type: z.enum(["purchase", "sale", "transfer", "death"]),
  from_property_id: z.string().nullish(),
  to_property_id: z.string().nullish(),
  value: z.number().nonnegative().nullish(),
  notes: z.string().trim().nullish(),
  occurred_at: z.string().datetime().nullish(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const animal = await g.db.animal.findFirst({ where: { id: params.id } });
  if (!animal) return apiError(...ApiErrors.NOT_FOUND);

  const movements = await g.db.animalMovement.findMany({
    where: { animal_id: params.id },
    orderBy: { occurred_at: "desc" },
  });

  return apiOk(movements.map(serializeMovement), { count: movements.length });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const animal = await g.db.animal.findFirst({ where: { id: params.id } });
  if (!animal) return apiError(...ApiErrors.NOT_FOUND);

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { movement_type, value, notes, occurred_at, to_property_id } = parsed.data;
  let from_property_id = parsed.data.from_property_id;

  const occurred = occurred_at ? new Date(occurred_at) : new Date();

  // Transferência: destino obrigatório e válido; origem = propriedade atual.
  if (movement_type === "transfer") {
    if (!to_property_id) {
      return apiError(
        "VALIDATION_ERROR",
        "Transferência exige a propriedade de destino (to_property_id)",
        422,
      );
    }
    const dest = await g.db.property.findFirst({ where: { id: to_property_id } });
    if (!dest) return apiError("INVALID_PROPERTY", "Propriedade de destino inválida", 422);
    from_property_id = from_property_id ?? animal.property_id;
  }

  const movement = await g.db.animalMovement.create({
    data: scoped({
      animal_id: params.id,
      movement_type,
      from_property_id: from_property_id ?? null,
      to_property_id: to_property_id ?? null,
      value: value ?? null,
      notes: notes ?? null,
      occurred_at: occurred,
    }),
  });

  // Efeitos colaterais no animal.
  const animalUpdate: Record<string, unknown> = {};
  if (movement_type === "sale") animalUpdate.status = "sold";
  if (movement_type === "death") animalUpdate.status = "deceased";
  if (movement_type === "transfer") animalUpdate.property_id = to_property_id;
  if (Object.keys(animalUpdate).length > 0) {
    await g.db.animal.update({ where: { id: params.id }, data: animalUpdate });
  }

  // Lançamento financeiro automático: só venda (receita) e compra (despesa).
  if (value != null && value > 0) {
    if (movement_type === "sale") {
      await createLinkedEntry(g.db, {
        entry_type: "income",
        category: "Venda de animal",
        amount: value,
        related_module: "rebanho",
        related_id: params.id,
        occurred_at: occurred,
      });
    } else if (movement_type === "purchase") {
      await createLinkedEntry(g.db, {
        entry_type: "expense",
        category: "Compra de animal",
        amount: value,
        related_module: "rebanho",
        related_id: params.id,
        occurred_at: occurred,
      });
    }
  }

  return apiOk(serializeMovement(movement), {}, { status: 201 });
}
