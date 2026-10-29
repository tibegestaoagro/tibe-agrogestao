import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getUpcoming } from "@/lib/actions/financial-reports";
import { AREA_INVALIDA, lerArea } from "@/lib/financial-area";
import { withApi } from "@/lib/route";

/** GET /api/v1/financial/upcoming?area=fazenda|emporio|tudo (contrato spec 4.6): próximos 7 dias, status pending. */
async function GETHandler(request: Request) {
  const g = await guard("financeiro", "read");
  if ("error" in g) return g.error;

  const area = lerArea(new URL(request.url).searchParams.get("area"));
  if (!area) return apiError("VALIDATION_ERROR", AREA_INVALIDA, 422, "area");

  const data = await getUpcoming(g.db, 7, undefined, area);
  return apiOk(data, { total: data.length });
}

export const GET = withApi(GETHandler);
