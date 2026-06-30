import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializePlot } from "@/lib/serializers";
import { decToNum, isoOrNull } from "@/lib/serialize";

/**
 * GET  /api/v1/plots    lista talhões (com propriedade e ciclo ativo)
 * POST /api/v1/plots    cria talhão (spec 1.8)
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  area_hectares: z.number().positive("Área deve ser positiva"),
  property_id: z.string().min(1, "Propriedade é obrigatória"),
});

export async function GET() {
  const g = await guard("lavoura", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const plots = await g.db.plot.findMany({
    orderBy: { created_at: "desc" },
    include: {
      property: { select: { name: true } },
      cycles: {
        where: { status: { in: ["planted", "growing"] } },
        orderBy: { created_at: "desc" },
        take: 1,
      },
    },
  });

  const data = plots.map((p) => {
    const active = p.cycles[0];
    return {
      ...serializePlot(p),
      property_name: p.property?.name ?? null,
      active_cycle: active
        ? {
            id: active.id,
            crop_name: active.crop_name,
            status: active.status,
            expected_harvest_at: isoOrNull(active.expected_harvest_at),
          }
        : null,
    };
  });

  return apiOk(data, { total: data.length });
}

export async function POST(request: Request) {
  const g = await guard("lavoura", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { name, area_hectares, property_id } = parsed.data;

  const property = await g.db.property.findFirst({ where: { id: property_id } });
  if (!property) return apiError("INVALID_PROPERTY", "Propriedade inválida", 422);
  if (property.archived_at) {
    return apiError(
      "PROPERTY_ARCHIVED",
      "Não é possível cadastrar talhão em propriedade arquivada",
      422,
    );
  }

  const plot = await g.db.plot.create({
    data: scoped({ name, area_hectares, property_id }),
  });

  return apiOk(
    { ...serializePlot(plot), area_hectares: decToNum(plot.area_hectares) },
    {},
    { status: 201 },
  );
}
