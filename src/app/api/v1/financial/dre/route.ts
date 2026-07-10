import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getDre, resolvePeriod } from "@/lib/actions/financial-reports";

/** GET /api/v1/financial/dre?start=&end= (contrato spec 4.5) */
export async function GET(request: Request) {
  const g = await guard("financeiro", "read");
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const { start, end } = resolvePeriod(sp.get("start"), sp.get("end"));

  const dre = await getDre(g.db, { start, end });
  return apiOk(dre);
}
