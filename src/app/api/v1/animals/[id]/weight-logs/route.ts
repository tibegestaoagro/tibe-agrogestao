import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeWeightLog } from "@/lib/serializers";
import { decToNum } from "@/lib/serialize";
import { computeGmd } from "@/lib/livestock";
import { addWeightLogAction } from "@/lib/actions/animal-weights";

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

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { weight, measured_at } = parsed.data;

  const result = await addWeightLogAction(g.db, {
    animal_id: params.id,
    weight,
    measured_at: measured_at ? new Date(measured_at) : null,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const log = await g.db.animalWeightLog.findFirst({
    where: { animal_id: params.id },
    orderBy: { created_at: "desc" },
  });

  return apiOk(serializeWeightLog(log!), {
    current_weight: result.data.current_weight,
    gmd: result.data.gmd,
  }, { status: 201 });
}
