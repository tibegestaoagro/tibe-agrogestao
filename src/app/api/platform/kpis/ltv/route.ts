import { apiOk } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { calculateLTV } from "@/lib/platform/kpis";

/** GET /api/platform/kpis/ltv (spec 6.6): só master_admin. */
export async function GET() {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const data = await calculateLTV();
  return apiOk(data);
}
