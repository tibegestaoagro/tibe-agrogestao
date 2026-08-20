import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { calculateFunnel, type Period } from "@/lib/platform/kpis";
import { withApi } from "@/lib/route";

const VALID_PERIODS: Period[] = ["30d", "90d", "12m"];

/** GET /api/platform/kpis/funnel?period=30d (spec 6.7): só master_admin. */
async function GETHandler(request: Request) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const period = (new URL(request.url).searchParams.get("period") ?? "30d") as Period;
  if (!VALID_PERIODS.includes(period)) {
    return apiError("VALIDATION_ERROR", "period deve ser 30d, 90d ou 12m", 422);
  }

  const data = await calculateFunnel(period);
  return apiOk(data);
}

export const GET = withApi(GETHandler);
