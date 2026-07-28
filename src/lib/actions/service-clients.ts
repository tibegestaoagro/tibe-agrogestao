import type { TenantPrismaClient } from "@/lib/prisma";
import { decToNum, isoOrNull } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Resumo financeiro do cliente (spec 2.5): extraído para ser reusado pela rota
 * HTTP e pelo agente WhatsApp ("quanto o cliente X me deve").
 */
export async function getClientSummaryAction(
  db: TenantPrismaClient,
  clientId: string,
): Promise<
  ActionResult<{
    client_id: string;
    client_name: string;
    total_invoiced: number;
    total_pending: number;
    orders_count: number;
    last_order_at: string | null;
  }>
> {
  const client = await db.serviceClient.findFirst({ where: { id: clientId } });
  if (!client) return fail("NOT_FOUND", "Cliente não encontrado", 404);

  const orders = await db.serviceOrder.findMany({
    where: { service_client_id: clientId },
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

  return ok({
    client_id: client.id,
    client_name: client.name,
    total_invoiced: Number(totalInvoiced.toFixed(2)),
    total_pending: Number(totalPending.toFixed(2)),
    orders_count: orders.length,
    last_order_at: isoOrNull(lastOrderAt),
  });
}
