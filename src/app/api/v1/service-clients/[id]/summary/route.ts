import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { decToNum, isoOrNull } from "@/lib/serialize";

/**
 * GET /api/v1/service-clients/:id/summary   (contrato spec 2.5)
 * total_invoiced = ordens 'invoiced'; total_pending = ordens 'completed' não faturadas.
 * Usado pelo painel e pelo agente WhatsApp ("quanto o cliente X me deve").
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("prestador", "read", { profile: "prestador" });
  if ("error" in g) return g.error;

  const client = await g.db.serviceClient.findFirst({ where: { id: params.id } });
  if (!client) return apiError(...ApiErrors.NOT_FOUND);

  const orders = await g.db.serviceOrder.findMany({
    where: { service_client_id: params.id },
    select: { total_value: true, status: true, performed_at: true },
  });

  let totalInvoiced = 0;
  let totalPending = 0;
  let lastOrderAt: Date | null = null;

  for (const o of orders) {
    const v = decToNum(o.total_value) ?? 0;
    if (o.status === "invoiced") totalInvoiced += v;
    else if (o.status === "completed") totalPending += v;
    if (o.performed_at && (!lastOrderAt || o.performed_at > lastOrderAt)) {
      lastOrderAt = o.performed_at;
    }
  }

  return apiOk({
    client_id: client.id,
    client_name: client.name,
    total_invoiced: Number(totalInvoiced.toFixed(2)),
    total_pending: Number(totalPending.toFixed(2)),
    orders_count: orders.length,
    last_order_at: isoOrNull(lastOrderAt),
  });
}
