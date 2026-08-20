import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeMovement } from "@/lib/serializers";
import { addMovementAction } from "@/lib/actions/animal-movements";

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

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const animal = await g.db.animalBatch.findFirst({ where: { id: params.id } });
  if (!animal) return apiError(...ApiErrors.NOT_FOUND);

  const movements = await g.db.animalMovement.findMany({
    where: { batch_id: params.id },
    orderBy: { occurred_at: "desc" },
  });

  return apiOk(movements.map(serializeMovement), { count: movements.length });
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { movement_type, value, notes, occurred_at, to_property_id, from_property_id } =
    parsed.data;

  const result = await addMovementAction(g.db, {
    batch_id: params.id,
    movement_type,
    from_property_id,
    to_property_id,
    value,
    notes,
    occurred_at: occurred_at ? new Date(occurred_at) : null,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const movement = await g.db.animalMovement.findFirst({
    where: { batch_id: params.id },
    orderBy: { created_at: "desc" },
  });

  return apiOk(serializeMovement(movement!), {}, { status: 201 });
}
