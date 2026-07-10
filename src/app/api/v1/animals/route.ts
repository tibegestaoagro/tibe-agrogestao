import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeAnimal } from "@/lib/serializers";
import { isoOrNull } from "@/lib/serialize";
import { createAnimalAction } from "@/lib/actions/animals";

/**
 * GET  /api/v1/animals    lista animais (filtros: property_id, status, breed, q=brinco)
 * POST /api/v1/animals     cadastra animal (contrato da spec 1.2)
 */

const createSchema = z.object({
  ear_tag: z.string().trim().min(1, "Brinco é obrigatório"),
  breed: z.string().trim().min(1, "Raça é obrigatória"),
  sex: z.enum(["male", "female"]),
  property_id: z.string().min(1, "Propriedade é obrigatória"),
  birth_date: z.string().datetime().nullish(),
  initial_weight: z.number().positive().nullish(),
});

export async function GET(request: Request) {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const property_id = sp.get("property_id") || undefined;
  const status = sp.get("status") || undefined;
  const breed = sp.get("breed") || undefined;
  const q = sp.get("q")?.trim() || undefined;

  const animals = await g.db.animal.findMany({
    where: {
      ...(property_id ? { property_id } : {}),
      ...(status ? { status: status as "active" | "sold" | "deceased" } : {}),
      ...(breed ? { breed: { contains: breed, mode: "insensitive" } } : {}),
      ...(q ? { ear_tag: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { created_at: "desc" },
    include: {
      property: { select: { name: true } },
      vaccinations: {
        orderBy: { applied_at: "desc" },
        take: 1,
        select: { applied_at: true },
      },
    },
  });

  const data = animals.map((a) => ({
    ...serializeAnimal(a),
    property_name: a.property?.name ?? null,
    last_vaccination_at: a.vaccinations[0]
      ? isoOrNull(a.vaccinations[0].applied_at)
      : null,
  }));

  return apiOk(data, { total: data.length });
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
  const { ear_tag, breed, sex, property_id, birth_date, initial_weight } =
    parsed.data;

  const result = await createAnimalAction(g.db, {
    ear_tag,
    breed,
    sex,
    property_id,
    birth_date: birth_date ? new Date(birth_date) : null,
    initial_weight,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const animal = await g.db.animal.findFirst({ where: { id: result.data.id } });
  return apiOk(serializeAnimal(animal!), {}, { status: 201 });
}
