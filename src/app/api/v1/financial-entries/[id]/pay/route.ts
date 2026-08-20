import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeFinancialEntry } from "@/lib/serializers";
import { markEntryPaidAction } from "@/lib/actions/financial-entries";

/** PATCH /api/v1/financial-entries/:id/pay: marca como pago (spec 4.2). */

const schema = z.object({ paid_at: z.string().datetime().nullish() });

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("financeiro", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json ?? {});
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await markEntryPaidAction(
    g.db,
    params.id,
    parsed.data.paid_at ? new Date(parsed.data.paid_at) : null,
  );
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const entry = await g.db.financialEntry.findFirst({ where: { id: params.id } });
  return apiOk(serializeFinancialEntry(entry!));
}
