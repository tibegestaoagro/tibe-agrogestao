import { prisma } from "@/lib/prisma";
import type { SubscriptionStatus } from "@/generated/prisma/enums";

/**
 * Histórico de transição de status de assinatura (Módulo 6, tasks 6.5/6.7/6.9).
 * Toda mudança de Subscription.status passa por aqui: automática (webhook do
 * Asaas, changedByPlatformUserId nulo) ou manual (força de master_admin, com
 * changedByPlatformUserId preenchido). Único mecanismo para as duas
 * necessidades: dar timing real a churn/funil E servir de log de auditoria.
 */
export async function logSubscriptionStatusChange(params: {
  subscriptionId: string;
  fromStatus: SubscriptionStatus | null;
  toStatus: SubscriptionStatus;
  changedByPlatformUserId?: string | null;
  reason?: string | null;
}): Promise<void> {
  await prisma.subscriptionStatusLog.create({
    data: {
      subscription_id: params.subscriptionId,
      from_status: params.fromStatus,
      to_status: params.toStatus,
      changed_by_platform_user_id: params.changedByPlatformUserId ?? null,
      reason: params.reason ?? null,
    },
  });
}
