import { apiOk, apiError } from "@/lib/api";
import { AREA_INVALIDA, lerArea } from "@/lib/financial-area";
import { guard } from "@/lib/api-guard";
import { getDre, resolvePeriod } from "@/lib/actions/financial-reports";
import { withApi } from "@/lib/route";

/** GET /api/v1/financial/dre?start=&end=&area=fazenda|emporio|tudo (contrato spec 4.5) */
async function GETHandler(request: Request) {
  const g = await guard("financeiro", "read");
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const { start, end } = resolvePeriod(sp.get("start"), sp.get("end"));

  const area = lerArea(sp.get("area"));
  if (!area) return apiError("VALIDATION_ERROR", AREA_INVALIDA, 422, "area");

  const dre = await getDre(g.db, { start, end, area });
  return apiOk(dre);
}

export const GET = withApi(GETHandler);
