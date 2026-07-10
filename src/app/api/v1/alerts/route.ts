import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { isoOrNull } from "@/lib/serialize";

/** GET /api/v1/alerts?type=&status= — lista de alertas (spec 4.12). */
export async function GET(request: Request) {
  const g = await guard("alertas", "read");
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const alert_type = sp.get("type") || undefined;
  const status = sp.get("status") || undefined;

  const alerts = await g.db.alert.findMany({
    where: {
      ...(alert_type
        ? { alert_type: alert_type as "vaccine_due" | "harvest_near" | "bill_due" | "low_balance" }
        : {}),
      ...(status ? { status: status as "pending" | "sent" | "dismissed" } : {}),
    },
    orderBy: { created_at: "desc" },
  });

  const data = alerts.map((a) => ({
    id: a.id,
    alert_type: a.alert_type,
    related_module: a.related_module,
    related_id: a.related_id,
    message: a.message,
    status: a.status,
    scheduled_for: isoOrNull(a.scheduled_for),
    sent_at: isoOrNull(a.sent_at),
    created_at: a.created_at.toISOString(),
  }));

  return apiOk(data, { total: data.length });
}
