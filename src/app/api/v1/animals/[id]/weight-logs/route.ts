import { z } from "zod";
import { apiOk, apiError, ApiErrors, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeWeightLog } from "@/lib/serializers";
import { decToNum } from "@/lib/serialize";
import { computeGmd } from "@/lib/livestock";
import { addWeightLogAction } from "@/lib/actions/animal-weights";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/animals/:id/weight-logs   histórico (ordenado por data) + GMD
 * POST /api/v1/animals/:id/weight-logs   registra pesagem, atualiza o peso médio do lote e o GMD
 */

const createSchema = z.object({
  weight: z.number().positive("Peso deve ser positivo"),
  measured_at: z.string().datetime().nullish(),
});

async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const animal = await g.db.animalBatch.findFirst({ where: { id: params.id } });
  if (!animal) return apiError(...ApiErrors.NOT_FOUND);

  const logs = await g.db.animalWeightLog.findMany({
    where: { batch_id: params.id },
    orderBy: { measured_at: "asc" },
  });

  return apiOk(logs.map(serializeWeightLog), {
    count: logs.length,
    gmd: computeGmd(logs),
    current_weight: decToNum(animal.average_weight),
  });
}

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const { weight, measured_at } = parsed.data;

  const result = await addWeightLogAction(g.db, {
    batch_id: params.id,
    weight,
    measured_at: measured_at ? new Date(measured_at) : null,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const log = await g.db.animalWeightLog.findFirst({
    where: { batch_id: params.id },
    orderBy: { created_at: "desc" },
  });

  return apiOk(serializeWeightLog(log!), {
    current_weight: result.data.current_weight,
    gmd: result.data.gmd,
  }, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
