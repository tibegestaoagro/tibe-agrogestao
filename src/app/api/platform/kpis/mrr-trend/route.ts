import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { calculateMrrTrend } from "@/lib/platform/kpis";
import { withApi } from "@/lib/route";

/**
 * GET /api/platform/kpis/mrr-trend?months=6 (spec 6.8: gráfico de evolução
 * de MRR). Extensão aditiva: a spec pede o gráfico mas não define um
 * endpoint de série temporal próprio nos "Contratos de API".
 */
async function GETHandler(request: Request) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const months = Number(new URL(request.url).searchParams.get("months")) || 6;
  if (months < 1 || months > 24) {
    return apiError("VALIDATION_ERROR", "months deve estar entre 1 e 24", 422);
  }

  const data = await calculateMrrTrend(months);
  return apiOk(data);
}

export const GET = withApi(GETHandler);
