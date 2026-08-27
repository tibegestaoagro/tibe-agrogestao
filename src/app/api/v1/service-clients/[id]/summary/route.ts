import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getClientSummaryAction } from "@/lib/actions/service-clients";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/service-clients/:id/summary   (contrato spec 2.5)
 * total_invoiced = ordens 'invoiced'; total_pending = ordens 'completed' não faturadas.
 * Usado pelo painel e pelo agente WhatsApp ("quanto o cliente X me deve").
 */
async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("prestador", "read", { profile: "prestador" });
  if ("error" in g) return g.error;

  const result = await getClientSummaryAction(g.db, params.id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data);
}

export const GET = withApi(GETHandler);
