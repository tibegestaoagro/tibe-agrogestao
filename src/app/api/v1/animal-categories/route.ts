import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { listCategoriesAction, createCategoryAction } from "@/lib/actions/animal-categories";

/**
 * GET  /api/v1/animal-categories    lista categorias do tenant (semeia a
 *                                    lista padrão na primeira leitura)
 * POST /api/v1/animal-categories    cria categoria customizada (spec 25 §2.3)
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
});

export async function GET() {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const categories = await listCategoriesAction(g.db);
  const data = categories.map((c) => ({
    id: c.id,
    name: c.name,
    active: c.active,
    created_at: c.created_at.toISOString(),
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

  const result = await createCategoryAction(g.db, parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data, {}, { status: 201 });
}
