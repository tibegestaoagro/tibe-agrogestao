import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getConfinementLotSummary } from "@/lib/actions/confinement";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/confinement/stays/:id   resumo do lote (§8, §13, §14, §24):
 * dias confinados, saldo atual, alimentação por produto e custo financeiro
 * acumulado.
 */
async function GETHandler(_request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const result = await getConfinementLotSummary(g.db, id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk({
    ...result.data,
    started_at: isoOrNull(result.data.started_at),
    canceled_at: isoOrNull(result.data.canceled_at),
  });
}

export const GET = withApi(GETHandler);
