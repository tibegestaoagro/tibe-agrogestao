import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { serializePasture } from "@/lib/serializers";
import { archivePastureAction, getPastureAreaSummary } from "@/lib/actions/properties";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/pastures/:id/archive   desativa o pasto (não deleta: doc §5 "excluir ou desativar").
 * Idempotente: re-desativar mantém o archived_at original. Pasto com gado: 409 `PASTO_OCUPADO`.
 */
async function POSTHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const result = await archivePastureAction(g.db, params.id);
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const area_summary = await getPastureAreaSummary(g.db, result.data.property_id);

  return apiOk(serializePasture(result.data), { area_summary });
}

export const POST = withApi(POSTHandler);
