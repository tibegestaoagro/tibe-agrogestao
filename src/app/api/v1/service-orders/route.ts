import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { serializeServiceOrder } from "@/lib/serializers";
import { createServiceOrderAction } from "@/lib/actions/service-orders";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/service-orders?status=&service_client_id=   lista ordens (filtros)
 * POST /api/v1/service-orders                              registra ordem (2.4)
 *
 * total_value = quantity * service.unit_price (quantity forçado a 1 se 'fixed').
 * Status inicial: 'scheduled' se performed_at é futuro; 'completed' se hoje/passado.
 */

const createSchema = z.object({
  service_client_id: z.string().min(1, "Cliente é obrigatório"),
  service_id: z.string().min(1, "Serviço é obrigatório"),
  quantity: z.number().positive("Quantidade inválida"),
  description: z.string().trim().nullish(),
  performed_at: z.string().datetime(),
});

async function GETHandler(request: Request) {
  const g = await guard("prestador", "read", { profile: "prestador" });
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const status = sp.get("status") || undefined;
  const clientId = sp.get("service_client_id") || undefined;

  const orders = await g.db.serviceOrder.findMany({
    where: {
      ...(status
        ? { status: status as "scheduled" | "completed" | "invoiced" }
        : {}),
      ...(clientId ? { service_client_id: clientId } : {}),
    },
    orderBy: { performed_at: "desc" },
    include: {
      service_client: { select: { name: true } },
      service: { select: { name: true } },
    },
  });

  const data = orders.map((o) => ({
    ...serializeServiceOrder(o),
    client_name: o.service_client?.name ?? null,
    service_name: o.service?.name ?? null,
  }));

  return apiOk(data, { total: data.length });
}

async function POSTHandler(request: Request) {
  const g = await guard("prestador", "write", { profile: "prestador" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }
  const { service_client_id, service_id, quantity, description, performed_at } =
    parsed.data;

  const result = await createServiceOrderAction(g.db, {
    service_client_id,
    service_id,
    quantity,
    description,
    performed_at: new Date(performed_at),
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  const order = await g.db.serviceOrder.findFirst({ where: { id: result.data.id } });
  return apiOk(serializeServiceOrder(order!), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
