import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { logSubscriptionStatusChange } from "@/lib/platform/subscription-log";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * Ação manual de master_admin (Módulo 6, task 6.9): força a mudança de
 * status de uma assinatura (ex: reativar um tenant suspenso por erro).
 * Grava em SubscriptionStatusLog com o PlatformUser responsável e o motivo —
 * é o próprio log de auditoria exigido pela spec.
 */
export async function forceSubscriptionStatusAction(params: {
  tenantId: string;
  newStatus: SubscriptionStatus;
  reason: string | null;
  platformUserId: string;
}): Promise<ActionResult<{ id: string; status: SubscriptionStatus }>> {
  const subscription = await prisma.subscription.findUnique({ where: { tenant_id: params.tenantId } });
  if (!subscription) {
    return fail("NOT_FOUND", "Este tenant ainda não tem assinatura para alterar", 404);
  }
  if (subscription.status === params.newStatus) {
    return fail("NO_CHANGE", `A assinatura já está em '${params.newStatus}'`, 422);
  }

  const updated = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: params.newStatus },
  });

  await logSubscriptionStatusChange({
    subscriptionId: subscription.id,
    fromStatus: subscription.status,
    toStatus: params.newStatus,
    changedByPlatformUserId: params.platformUserId,
    reason: params.reason,
  });

  // Mantém Tenant.status coerente com a assinatura forçada (mesmo padrão do webhook).
  if (params.newStatus === "active") {
    await prisma.tenant.update({ where: { id: params.tenantId }, data: { status: "active" } });
  }

  return ok({ id: updated.id, status: updated.status });
}
