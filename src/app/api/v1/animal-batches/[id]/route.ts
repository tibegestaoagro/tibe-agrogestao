import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeBatch } from "@/lib/actions/animal-batches";

/**
 * GET   /api/v1/animal-batches/:id    detalhe do lote (tela /rebanho/lote/:id)
 * PATCH /api/v1/animal-batches/:id    edita peso médio (spec 25 §2.4: campo
 *                                      simples e editável, sem virar GMD)
 */

const patchSchema = z.object({
  average_weight: z.number().positive().nullish(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const batch = await g.db.animalBatch.findFirst({
    where: { id: params.id },
    include: {
      category: { select: { name: true } },
      property: { select: { name: true } },
    },
  });
  if (!batch) return apiError(...ApiErrors.NOT_FOUND);

  return apiOk({
    ...serializeBatch(batch),
    category_name: batch.category?.name ?? null,
    property_name: batch.property?.name ?? null,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = patchSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const existing = await g.db.animalBatch.findFirst({ where: { id: params.id } });
  if (!existing) return apiError(...ApiErrors.NOT_FOUND);

  // average_weight ausente no corpo = campo não tocado; presente (mesmo null)
  // = atualiza (null limpa o peso médio).
  if (!("average_weight" in (body.json as Record<string, unknown>))) {
    return apiOk(serializeBatch(existing));
  }
  const batch = await g.db.animalBatch.update({
    where: { id: params.id },
    data: { average_weight: parsed.data.average_weight ?? null },
  });
  return apiOk(serializeBatch(batch));
}
