import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { listUpcomingVaccinations } from "@/lib/actions/animal-vaccinations";
import { isoOrNull } from "@/lib/serialize";

/**
 * GET /api/v1/vaccinations/upcoming   (contrato spec 1.4)
 * Vacinações vencendo nos próximos 15 dias (usado pelo Módulo 4: Alertas).
 */
export async function GET() {
  const g = await guard("rebanho", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const rows = await listUpcomingVaccinations(g.db, 15);
  const data = rows.map((r) => ({
    batch_id: r.batch_id,
    ear_tag: r.ear_tag,
    vaccine_name: r.vaccine_name,
    last_applied_at: isoOrNull(r.last_applied_at),
    next_due_at: isoOrNull(r.next_due_at),
    days_remaining: r.days_remaining,
  }));

  return apiOk(data, { total: data.length });
}
