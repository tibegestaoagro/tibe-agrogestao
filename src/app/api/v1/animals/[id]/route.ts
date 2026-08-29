import { z } from "zod";
import { apiOk, apiError, ApiErrors, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeAnimal } from "@/lib/serializers";
import { withApi } from "@/lib/route";

/**
 * GET   /api/v1/animals/:id    detalhe do animal
 * PATCH /api/v1/animals/:id    edita dados cadastrais
 */

const updateSchema = z.object({
  ear_tag: z.string().trim().min(1).optional(),
  breed: z.string().trim().min(1).optional(),
  sex: z.enum(["male", "female"]).optional(),
  property_id: z.string().min(1).optional(),
  birth_date: z.string().datetime().nullish(),
});

async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const animal = await g.db.animalBatch.findFirst({
    where: { id: params.id },
    include: { property: { select: { name: true } } },
  });
  if (!animal) return apiError(...ApiErrors.NOT_FOUND);

  return apiOk({
    ...serializeAnimal(animal),
    property_name: animal.property?.name ?? null,
  });
}

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = updateSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const data = parsed.data;

  const existing = await g.db.animalBatch.findFirst({ where: { id: params.id } });
  if (!existing) return apiError(...ApiErrors.NOT_FOUND);

  // Valida nova propriedade, se informada.
  if (data.property_id && data.property_id !== existing.property_id) {
    const prop = await g.db.property.findFirst({ where: { id: data.property_id } });
    if (!prop) return apiError("INVALID_PROPERTY", "Propriedade inválida", 422);
  }

  // Valida unicidade de brinco, se alterado.
  if (data.ear_tag && data.ear_tag !== existing.ear_tag) {
    const dup = await g.db.animalBatch.findFirst({ where: { ear_tag: data.ear_tag } });
    if (dup) {
      return apiError(
        "DUPLICATE_EAR_TAG",
        `Já existe um animal com o brinco '${data.ear_tag}' neste tenant`,
        409,
      );
    }
  }

  const animal = await g.db.animalBatch.update({
    where: { id: params.id },
    data: {
      ...(data.ear_tag !== undefined ? { ear_tag: data.ear_tag } : {}),
      ...(data.breed !== undefined ? { breed: data.breed } : {}),
      ...(data.sex !== undefined ? { sex: data.sex } : {}),
      ...(data.property_id !== undefined ? { property_id: data.property_id } : {}),
      ...(data.birth_date !== undefined
        ? { birth_date: data.birth_date ? new Date(data.birth_date) : null }
        : {}),
    },
  });

  return apiOk(serializeAnimal(animal));
}

export const GET = withApi(GETHandler);
export const PATCH = withApi(PATCHHandler);
