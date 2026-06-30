import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializeCycle } from "@/lib/serializers";

/**
 * GET  /api/v1/plots/:id/cycles    lista ciclos do talhão
 * POST /api/v1/plots/:id/cycles    inicia novo ciclo (spec 1.9)
 *
 * Regra: um talhão só pode ter UM ciclo planted/growing ativo por vez.
 */

const createSchema = z.object({
  crop_name: z.string().trim().min(1, "Nome da cultura é obrigatório"),
  planted_at: z.string().datetime().nullish(),
  expected_harvest_at: z.string().datetime().nullish(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("lavoura", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const plot = await g.db.plot.findFirst({ where: { id: params.id } });
  if (!plot) return apiError(...ApiErrors.NOT_FOUND);

  const cycles = await g.db.cropCycle.findMany({
    where: { plot_id: params.id },
    orderBy: { created_at: "desc" },
  });

  return apiOk(cycles.map(serializeCycle), { total: cycles.length });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("lavoura", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const plot = await g.db.plot.findFirst({ where: { id: params.id } });
  if (!plot) return apiError(...ApiErrors.NOT_FOUND);

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { crop_name, planted_at, expected_harvest_at } = parsed.data;

  // Garante apenas um ciclo ativo por talhão.
  const active = await g.db.cropCycle.findFirst({
    where: { plot_id: params.id, status: { in: ["planted", "growing"] } },
  });
  if (active) {
    return apiError(
      "ACTIVE_CYCLE_EXISTS",
      "Este talhão já tem um ciclo ativo (plantado/em crescimento)",
      409,
    );
  }

  const cycle = await g.db.cropCycle.create({
    data: scoped({
      plot_id: params.id,
      crop_name,
      planted_at: planted_at ? new Date(planted_at) : new Date(),
      expected_harvest_at: expected_harvest_at
        ? new Date(expected_harvest_at)
        : null,
      status: "planted" as const,
    }),
  });

  // Reflete a cultura atual no talhão.
  await g.db.plot.update({
    where: { id: params.id },
    data: { current_crop: crop_name },
  });

  return apiOk(serializeCycle(cycle), {}, { status: 201 });
}
