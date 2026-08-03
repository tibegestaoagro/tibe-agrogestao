import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { serializeFinancialEntry } from "@/lib/serializers";
import { cancelEntryAction } from "@/lib/actions/financial-entries";

/** PATCH /api/v1/financial-entries/:id/cancel: cancela um lançamento (Módulo 28). */

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  const g = await guard("financeiro", "write");
  if ("error" in g) return g.error;

  const result = await cancelEntryAction(g.db, params.id);
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const entry = await g.db.financialEntry.findFirst({ where: { id: params.id } });
  return apiOk(serializeFinancialEntry(entry!));
}
