import type { AlertType, AlertStatus } from "@/generated/prisma/client";
import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { isoOrNull } from "@/lib/serialize";
import { withApi } from "@/lib/route";

/**
 * GET /api/v1/alerts?type=&status=: lista de alertas (spec 4.12).
 *
 * O filtro é conferido contra a lista de verdade, e não afirmado por um cast.
 * A versão anterior fazia `as "vaccine_due" | ...` com 4 dos 8 tipos: o cast
 * mentia para o TypeScript e não checava nada em runtime, então `?type=xyz`
 * chegava cru no Prisma e derrubava a rota com 500 em vez de simplesmente não
 * filtrar.
 */
const TIPOS: readonly string[] = [
  "vaccine_due",
  "harvest_near",
  "bill_due",
  "low_balance",
  "trial_ending",
  "maintenance_due",
  "task_reminder",
  "low_stock",
];
const STATUS: readonly string[] = ["pending", "sent", "dismissed"];

async function GETHandler(request: Request) {
  const g = await guard("alertas", "read");
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const tipo = sp.get("type");
  const situacao = sp.get("status");
  const alert_type = tipo && TIPOS.includes(tipo) ? (tipo as AlertType) : undefined;
  const status = situacao && STATUS.includes(situacao) ? (situacao as AlertStatus) : undefined;

  const alerts = await g.db.alert.findMany({
    where: {
      ...(alert_type ? { alert_type } : {}),
      ...(status ? { status } : {}),
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

export const GET = withApi(GETHandler);
