import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { createBatchAction, serializeBatch } from "@/lib/actions/animal-batches";

/**
 * GET  /api/v1/animal-batches    lista lotes do tenant (filtros: property_id, category_id)
 * POST /api/v1/animal-batches    registra um lote novo (compra/entrada, spec 25 §2)
 */

const createSchema = z.object({
  category_id: z.string().min(1, "Categoria é obrigatória"),
  property_id: z.string().min(1, "Propriedade é obrigatória"),
  quantity: z.number().int().positive("Quantidade deve ser um inteiro positivo"),
  average_weight: z.number().positive().nullish(),
  acquisition_cost: z.number().nonnegative().nullish(),
  acquired_at: z.string().datetime().nullish(),
});

export async function GET(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const property_id = sp.get("property_id") || undefined;
  const category_id = sp.get("category_id") || undefined;

  const batches = await g.db.animalBatch.findMany({
    where: {
      ...(property_id ? { property_id } : {}),
      ...(category_id ? { category_id } : {}),
    },
    orderBy: { acquired_at: "desc" },
    include: {
      category: { select: { name: true } },
      property: { select: { name: true } },
    },
  });

  const data = batches.map((b) => ({
    ...serializeBatch(b),
    category_name: b.category?.name ?? null,
    property_name: b.property?.name ?? null,
  }));
  return apiOk(data, { total: data.length });
}

export async function POST(request: Request) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { category_id, property_id, quantity, average_weight, acquisition_cost, acquired_at } =
    parsed.data;

  const result = await createBatchAction(g.db, {
    category_id,
    property_id,
    quantity,
    average_weight: average_weight ?? null,
    acquisition_cost: acquisition_cost ?? null,
    acquired_at: acquired_at ? new Date(acquired_at) : null,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data, {}, { status: 201 });
}
