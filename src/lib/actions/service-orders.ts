import { scoped, type TenantPrismaClient } from "@/lib/prisma";
import { decToNum } from "@/lib/serialize";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Lógica de negócio de Ordens de Serviço, extraída da rota HTTP (M2) para ser
 * reusada também pelo agente WhatsApp (M3 execute-action).
 */

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Ordens concluídas aguardando fatura (auditoria de arquitetura,
 * 2026-08-04): extraído porque o dashboard web e o `resumo` do WhatsApp
 * calculavam a mesma contagem com duas queries Prisma independentes.
 */
export async function countCompletedUnbilledOrders(db: TenantPrismaClient) {
  return db.serviceOrder.count({ where: { status: "completed" } });
}

export async function createServiceOrderAction(
  db: TenantPrismaClient,
  input: {
    service_client_id: string;
    service_id: string;
    quantity: number;
    description?: string | null;
    performed_at: Date;
  },
): Promise<ActionResult<{ id: string; total_value: number; status: string }>> {
  const client = await db.serviceClient.findFirst({
    where: { id: input.service_client_id },
  });
  if (!client) return fail("INVALID_CLIENT", "Cliente inválido", 422);

  const service = await db.service.findFirst({ where: { id: input.service_id } });
  if (!service) return fail("INVALID_SERVICE", "Serviço inválido", 422);

  const quantity = service.pricing_type === "fixed" ? 1 : input.quantity;
  const unitPrice = decToNum(service.unit_price) ?? 0;
  const total_value = Number((quantity * unitPrice).toFixed(2));

  const initialStatus =
    startOfDay(input.performed_at) > startOfDay(new Date())
      ? ("scheduled" as const)
      : ("completed" as const);

  const order = await db.serviceOrder.create({
    data: scoped({
      service_client_id: input.service_client_id,
      service_id: input.service_id,
      description: input.description ?? null,
      quantity,
      total_value,
      performed_at: input.performed_at,
      status: initialStatus,
    }),
  });

  return ok({ id: order.id, total_value, status: order.status });
}

/** Busca clientes por nome (contém, case-insensitive). */
export async function findClientsByName(db: TenantPrismaClient, name: string) {
  return db.serviceClient.findMany({
    where: { name: { contains: name, mode: "insensitive" } },
    orderBy: { name: "asc" },
  });
}

/** Busca serviço por nome (exato, senão contém), case-insensitive. */
export async function findServiceByName(db: TenantPrismaClient, name: string) {
  const exact = await db.service.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (exact) return exact;
  return db.service.findFirst({ where: { name: { contains: name, mode: "insensitive" } } });
}
