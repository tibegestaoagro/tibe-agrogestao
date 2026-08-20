import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeProperty } from "@/lib/serializers";
import { withApi } from "@/lib/route";

/**
 * GET   /api/v1/properties/:id    detalhe da propriedade
 * PATCH /api/v1/properties/:id    edita propriedade
 */

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  address: z.string().trim().nullish(),
  city: z.string().trim().min(1).optional(),
  district: z.string().trim().nullish(),
  area_hectares: z.number().positive("Tamanho deve ser maior que zero").optional(),
});

async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const property = await g.db.property.findFirst({ where: { id: params.id } });
  if (!property) return apiError(...ApiErrors.NOT_FOUND);

  return apiOk(serializeProperty(property));
}

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = updateSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const existing = await g.db.property.findFirst({ where: { id: params.id } });
  if (!existing) return apiError(...ApiErrors.NOT_FOUND);

  const data = parsed.data;
  const property = await g.db.property.update({
    where: { id: params.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.district !== undefined ? { district: data.district } : {}),
      ...(data.area_hectares !== undefined
        ? { area_hectares: data.area_hectares }
        : {}),
    },
  });

  return apiOk(serializeProperty(property));
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
