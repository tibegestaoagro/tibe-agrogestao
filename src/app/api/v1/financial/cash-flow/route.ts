import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { getCashFlow, resolvePeriod } from "@/lib/actions/financial-reports";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/financial/cash-flow?start=&end=&group_by=day|month&related_module=
 * (spec 4.4): regime de caixa, agrupado por dia ou mês.
 */
async function GETHandler(request: Request) {
  const g = await guard("financeiro", "read");
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const { start, end } = resolvePeriod(sp.get("start"), sp.get("end"));
  const groupBy = sp.get("group_by") === "month" ? "month" : "day";
  const related_module = sp.get("related_module");
  if (related_module && !["rebanho", "lavoura", "servico", "geral"].includes(related_module)) {
    return apiError("VALIDATION_ERROR", "related_module inválido", 422);
  }

  const series = await getCashFlow(g.db, {
    start,
    end,
    groupBy,
    related_module: related_module as "rebanho" | "lavoura" | "servico" | "maquinas" | "geral" | undefined,
  });

  return apiOk(series, {
    period: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
    group_by: groupBy,
  });
}

export const GET = withApi(GETHandler);
