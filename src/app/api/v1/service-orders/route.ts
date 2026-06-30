import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializeServiceOrder } from "@/lib/serializers";
import { decToNum } from "@/lib/serialize";

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

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export async function GET(request: Request) {
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

export async function POST(request: Request) {
  const g = await guard("prestador", "write", { profile: "prestador" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { service_client_id, service_id, description, performed_at } = parsed.data;

  const client = await g.db.serviceClient.findFirst({
    where: { id: service_client_id },
  });
  if (!client) return apiError("INVALID_CLIENT", "Cliente inválido", 422);

  const service = await g.db.service.findFirst({ where: { id: service_id } });
  if (!service) return apiError("INVALID_SERVICE", "Serviço inválido", 422);

  // Preço fixo: quantidade sempre 1.
  const quantity = service.pricing_type === "fixed" ? 1 : parsed.data.quantity;
  const unitPrice = decToNum(service.unit_price) ?? 0;
  const total_value = Number((quantity * unitPrice).toFixed(2));

  const performed = new Date(performed_at);
  const initialStatus =
    startOfDay(performed) > startOfDay(new Date())
      ? ("scheduled" as const)
      : ("completed" as const);

  const order = await g.db.serviceOrder.create({
    data: scoped({
      service_client_id,
      service_id,
      description: description ?? null,
      quantity,
      total_value,
      performed_at: performed,
      status: initialStatus,
    }),
  });

  return apiOk(serializeServiceOrder(order), {}, { status: 201 });
}
