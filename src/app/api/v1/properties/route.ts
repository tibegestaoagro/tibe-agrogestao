import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializeProperty } from "@/lib/serializers";

/**
 * GET  /api/v1/properties           lista propriedades (exclui arquivadas por padrão)
 * POST /api/v1/properties           cria propriedade
 *
 * Query (GET): ?include_archived=true  inclui as arquivadas.
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  address: z.string().trim().nullish(),
  area_hectares: z.number().nonnegative().nullish(),
});

export async function GET(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const includeArchived =
    new URL(request.url).searchParams.get("include_archived") === "true";

  const properties = await g.db.property.findMany({
    where: includeArchived ? {} : { archived_at: null },
    orderBy: { created_at: "desc" },
  });

  return apiOk(properties.map(serializeProperty), { total: properties.length });
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

  const { name, address, area_hectares } = parsed.data;
  const property = await g.db.property.create({
    data: scoped({
      name,
      address: address ?? null,
      area_hectares: area_hectares ?? null,
    }),
  });

  return apiOk(serializeProperty(property), {}, { status: 201 });
}
