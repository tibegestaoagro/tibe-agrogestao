import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { updateCategoryAction } from "@/lib/actions/animal-categories";

/**
 * PATCH /api/v1/animal-categories/:id    renomeia e/ou ativa/desativa
 *                                         categoria (spec 25 §2.3). Sem
 *                                         DELETE: mesmo espírito de
 *                                         Property.archived_at, não apaga
 *                                         categoria em uso por lote.
 */

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = patchSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await updateCategoryAction(g.db, params.id, parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
