import { apiOk } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { calculateMRR } from "@/lib/platform/kpis";

/** GET /api/platform/kpis/mrr (spec 6.4) — só master_admin (equipe não vê KPIs financeiros). */
export async function GET() {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const data = await calculateMRR();
  return apiOk(data);
}
