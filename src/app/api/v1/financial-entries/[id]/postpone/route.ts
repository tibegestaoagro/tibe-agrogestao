import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeFinancialEntry } from "@/lib/serializers";
import { postponeEntryDueDateAction } from "@/lib/actions/financial-entries";
import { withApi } from "@/lib/route";

/** PATCH /api/v1/financial-entries/:id/postpone: adia o vencimento (Módulo 28). */

const schema = z.object({ due_date: z.string().datetime() });

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

  const result = await postponeEntryDueDateAction(g.db, params.id, new Date(parsed.data.due_date));
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const entry = await g.db.financialEntry.findFirst({ where: { id: params.id } });
  return apiOk(serializeFinancialEntry(entry!));
}

export const PATCH = withApi(PATCHHandler);
