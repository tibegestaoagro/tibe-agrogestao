import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { updateFinancialCategoryAction } from "@/lib/actions/financial-categories";
import { withApi } from "@/lib/route";

/** PATCH /api/v1/financial-categories/:id: renomeia ou ativa/desativa. */

const schema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("financeiro", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await updateFinancialCategoryAction(g.db, params.id, parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const PATCH = withApi(PATCHHandler);
