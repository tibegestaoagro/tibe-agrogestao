import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeService } from "@/lib/serializers";
import { withApi } from "@/lib/route";

/**
 * PATCH /api/v1/services/:id   edita serviço (nome, tipo, valor).
 * Não afeta total_value de ordens já registradas: esse valor é gravado na criação.
 */

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  pricing_type: z.enum(["hour", "day", "fixed"]).optional(),
  unit_price: z.number().nonnegative().optional(),
});

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("prestador", "write", { profile: "prestador" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = updateSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const existing = await g.db.service.findFirst({ where: { id: params.id } });
  if (!existing) return apiError(...ApiErrors.NOT_FOUND);

  const data = parsed.data;
  const service = await g.db.service.update({
    where: { id: params.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.pricing_type !== undefined ? { pricing_type: data.pricing_type } : {}),
      ...(data.unit_price !== undefined ? { unit_price: data.unit_price } : {}),
    },
  });

  return apiOk(serializeService(service));
}

export const PATCH = withApi(PATCHHandler);
