import { prisma, prismaForTenant, type TenantPrismaClient } from "@/lib/prisma";

/**
 * Envio de alertas pendentes via N8N → WhatsApp (spec 4.11). Mesma arquitetura
 * do Módulo 3 (Tibé nunca fala direto com a Meta Cloud API): aqui é o Tibé
 * quem inicia a chamada (outbound) para um webhook do N8N, que repassa a
 * mensagem via Meta. Se `N8N_ALERT_WEBHOOK_URL` não estiver configurada, os
 * alertas ficam com `status: pending` (nada quebra; fica pronto para quando o
 * workflow N8N desse envio existir: ver docs/n8n-whatsapp-workflow.md).
 */

async function findAlertRecipient(db: TenantPrismaClient) {
  const owner = await db.user.findFirst({
    where: { role: "OWNER", active: true, phone: { not: null } },
  });
  if (owner) return owner;
  return db.user.findFirst({
    where: { role: "ADMIN", active: true, phone: { not: null } },
  });
}

export async function deliverPendingAlertsForTenant(tenantId: string): Promise<{ sent: number }> {
  const webhookUrl = process.env.N8N_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return { sent: 0 };

  const db = prismaForTenant(tenantId);
  const pending = await db.alert.findMany({ where: { status: "pending" } });
  if (pending.length === 0) return { sent: 0 };

  const recipient = await findAlertRecipient(db);
  if (!recipient?.phone) return { sent: 0 };

  let sent = 0;
  for (const alert of pending) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          phone: recipient.phone,
          message: alert.message,
        }),
      });
      if (res.ok) {
        await db.alert.update({
          where: { id: alert.id },
          data: { status: "sent", sent_at: new Date() },
        });
        sent++;
      }
    } catch {
      // N8N indisponível/erro de rede: mantém pending, tenta de novo na próxima execução do job.
    }
  }
  return { sent };
}

export async function deliverAllPendingAlerts(): Promise<{ sent: number }> {
  const tenants = await prisma.tenant.findMany({
    where: { status: { in: ["trial", "active"] } },
    select: { id: true },
  });

  let sent = 0;
  for (const t of tenants) {
    const result = await deliverPendingAlertsForTenant(t.id);
    sent += result.sent;
  }
  return { sent };
}
