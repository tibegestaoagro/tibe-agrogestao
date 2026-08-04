import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializePasture } from "@/lib/serializers";
import { getPastureAreaSummary } from "@/lib/actions/properties";

/**
 * PATCH /api/v1/pastures/:id   edita nome/tamanho do pasto (Módulo 29)
 */

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  area_hectares: z.number().positive("Tamanho deve ser maior que zero").optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = updateSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const existing = await g.db.pasture.findFirst({ where: { id: params.id } });
  if (!existing) return apiError(...ApiErrors.NOT_FOUND);

  const data = parsed.data;
  const pasture = await g.db.pasture.update({
    where: { id: params.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.area_hectares !== undefined ? { area_hectares: data.area_hectares } : {}),
    },
  });

  const area_summary = await getPastureAreaSummary(g.db, pasture.property_id);

  return apiOk(serializePasture(pasture), { area_summary });
}
