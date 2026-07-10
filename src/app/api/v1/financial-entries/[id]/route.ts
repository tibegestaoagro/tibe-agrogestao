import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeFinancialEntry } from "@/lib/serializers";
import { updateManualEntryAction } from "@/lib/actions/financial-entries";

/** PATCH /api/v1/financial-entries/:id — edita lançamento manual (spec 4.2). */

const updateSchema = z.object({
  category: z.string().trim().min(1).optional(),
  amount: z.number().positive().optional(),
  due_date: z.string().datetime().optional(),
  notes: z.string().trim().nullish(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("financeiro", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = updateSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { category, amount, due_date, notes } = parsed.data;

  const result = await updateManualEntryAction(g.db, params.id, {
    category,
    amount,
    due_date: due_date ? new Date(due_date) : undefined,
    notes,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const entry = await g.db.financialEntry.findFirst({ where: { id: params.id } });
  return apiOk(serializeFinancialEntry(entry!));
}
