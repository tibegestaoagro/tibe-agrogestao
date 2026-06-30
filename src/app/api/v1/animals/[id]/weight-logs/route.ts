import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializeWeightLog } from "@/lib/serializers";
import { decToNum } from "@/lib/serialize";
import { computeGmd } from "@/lib/livestock";

/**
 * GET  /api/v1/animals/:id/weight-logs   histórico (ordenado por data) + GMD
 * POST /api/v1/animals/:id/weight-logs   registra pesagem, atualiza current_weight e GMD
 */

const createSchema = z.object({
  weight: z.number().positive("Peso deve ser positivo"),
  measured_at: z.string().datetime().nullish(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const animal = await g.db.animal.findFirst({ where: { id: params.id } });
  if (!animal) return apiError(...ApiErrors.NOT_FOUND);

  const logs = await g.db.animalWeightLog.findMany({
    where: { animal_id: params.id },
    orderBy: { measured_at: "asc" },
  });

  return apiOk(logs.map(serializeWeightLog), {
    count: logs.length,
    gmd: computeGmd(logs),
    current_weight: decToNum(animal.current_weight),
  });
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  // Garante que o animal pertence ao tenant (isolamento do filho via pai).
  const animal = await g.db.animal.findFirst({ where: { id: params.id } });
  if (!animal) return apiError(...ApiErrors.NOT_FOUND);

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { weight, measured_at } = parsed.data;

  const log = await g.db.animalWeightLog.create({
    data: scoped({
      animal_id: params.id,
      weight,
      measured_at: measured_at ? new Date(measured_at) : new Date(),
    }),
  });

  // Recalcula: current_weight = pesagem mais recente; GMD entre as 2 últimas.
  const logs = await g.db.animalWeightLog.findMany({
    where: { animal_id: params.id },
    orderBy: { measured_at: "desc" },
  });
  const latestWeight = decToNum(logs[0]?.weight);

  await g.db.animal.update({
    where: { id: params.id },
    data: { current_weight: latestWeight ?? weight },
  });

  return apiOk(serializeWeightLog(log), {
    current_weight: latestWeight ?? weight,
    gmd: computeGmd(logs),
  }, { status: 201 });
}
