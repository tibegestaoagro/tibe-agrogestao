import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializeVaccination } from "@/lib/serializers";
import { createLinkedEntry } from "@/lib/financial";

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

  const animal = await g.db.animal.findFirst({ where: { id: params.id } });
  if (!animal) return apiError(...ApiErrors.NOT_FOUND);

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { vaccine_id, applied_at, interval_days, cost } = parsed.data;

  const vaccine = await g.db.vaccine.findFirst({ where: { id: vaccine_id } });
  if (!vaccine) return apiError("INVALID_VACCINE", "Vacina inválida", 422);

  const appliedDate = applied_at ? new Date(applied_at) : new Date();

  // next_due_at = applied_at + (intervalo customizado ou padrão da vacina).
  const interval = interval_days ?? vaccine.default_interval_days ?? null;
  const nextDue =
    interval != null
      ? new Date(appliedDate.getTime() + interval * 86_400_000)
      : null;

  const vaccination = await g.db.animalVaccination.create({
    data: scoped({
      animal_id: params.id,
      vaccine_id,
      applied_at: appliedDate,
      next_due_at: nextDue,
      cost: cost ?? null,
    }),
    include: { vaccine: { select: { name: true } } },
  });

  // Custo registrado → gera lançamento financeiro (despesa) vinculado ao animal.
  if (cost != null && cost > 0) {
    await createLinkedEntry(g.db, {
      entry_type: "expense",
      category: `Vacinação - ${vaccine.name}`,
      amount: cost,
      related_module: "rebanho",
      related_id: params.id,
      occurred_at: appliedDate,
    });
  }

  return apiOk(serializeVaccination(vaccination), {}, { status: 201 });
}
