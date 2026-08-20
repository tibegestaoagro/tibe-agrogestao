import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getUpcoming } from "@/lib/actions/financial-reports";
import { withApi } from "@/lib/route";

/** GET /api/v1/financial/upcoming (contrato spec 4.6): próximos 7 dias, status pending. */
async function GETHandler() {
  const g = await guard("financeiro", "read");
  if ("error" in g) return g.error;

  const data = await getUpcoming(g.db, 7);
  return apiOk(data, { total: data.length });
}

export const GET = withApi(GETHandler);
