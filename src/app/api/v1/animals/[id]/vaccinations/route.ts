import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeVaccination } from "@/lib/serializers";
import { addVaccinationAction } from "@/lib/actions/animal-vaccinations";

/**
 * GET  /api/v1/animals/:id/vaccinations   histórico de vacinação do animal
 * POST /api/v1/animals/:id/vaccinations   registra aplicação (calcula next_due_at;
 *                                          custo opcional gera FinancialEntry)
 */

const createSchema = z.object({
  vaccine_id: z.string().min(1, "Vacina é obrigatória"),
  applied_at: z.string().datetime().nullish(),
  interval_days: z.number().int().positive().nullish(), // intervalo customizado
  cost: z.number().nonnegative().nullish(),
});

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const animal = await g.db.animal.findFirst({ where: { id: params.id } });
  if (!animal) return apiError(...ApiErrors.NOT_FOUND);

  const vaccinations = await g.db.animalVaccination.findMany({
    where: { animal_id: params.id },
    orderBy: { applied_at: "desc" },
    include: { vaccine: { select: { name: true } } },
  });

  return apiOk(vaccinations.map(serializeVaccination), {
    count: vaccinations.length,
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
  const { vaccine_id, applied_at, interval_days, cost } = parsed.data;

  const result = await addVaccinationAction(g.db, {
    animal_id: params.id,
    vaccine_id,
    applied_at: applied_at ? new Date(applied_at) : null,
    interval_days,
    cost,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const vaccination = await g.db.animalVaccination.findFirst({
    where: { animal_id: params.id },
    orderBy: { created_at: "desc" },
    include: { vaccine: { select: { name: true } } },
  });

  return apiOk(serializeVaccination(vaccination!), {}, { status: 201 });
}
