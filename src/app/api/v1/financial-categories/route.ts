import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { createFinancialCategoryAction, listFinancialCategoriesAction } from "@/lib/actions/financial-categories";

/**
 * GET  /api/v1/financial-categories    lista categorias do tenant (Módulo 28)
 * POST /api/v1/financial-categories    cria uma categoria nova
 */

const createSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  entry_type: z.enum(["income", "expense"]),
});

export async function GET(request: Request) {
  const g = await guard("financeiro", "read");
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const entryType = sp.get("entry_type");

  const categories = await listFinancialCategoriesAction(g.db, {
    entry_type: entryType === "income" || entryType === "expense" ? entryType : undefined,
  });
  return apiOk(categories, { total: categories.length });
}

export async function POST(request: Request) {
  const g = await guard("financeiro", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await createFinancialCategoryAction(g.db, parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data, {}, { status: 201 });
}
