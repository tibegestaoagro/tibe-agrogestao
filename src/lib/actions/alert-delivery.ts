import { prisma, prismaForTenant, type TenantPrismaClient } from "@/lib/prisma";
import { buildAlertEmailHtml } from "@/lib/email-templates";
import { notify } from "@/lib/notify";

/**
 * Envio de alertas pendentes pelo seam de notificação (src/lib/notify,
 * Onda 2): push, WhatsApp e email, urgency "critical". Um alerta vira `sent`
 * assim que QUALQUER UM dos 3 canais entregar: sem isso, um alerta que só
 * falha no WhatsApp e no push ficaria `pending` pra sempre e reenviaria o
 * mesmo email todo dia no cron. Essa garantia já existia para WhatsApp+email
 * (spec 4.11 + arquitetura 2026-07-29); push entrou como terceiro canal
 * aditivo, sem enfraquecer os outros dois (continuam obrigatórios).
 *
 * ⚠️ Histórico: até 2026-07-30 o WhatsApp saía por um webhook do N8N
 * (`N8N_ALERT_WEBHOOK_URL`), herança da regra original "o Tibé nunca fala
 * direto com a Meta". Essa regra já tinha sido quebrada de propósito no
 * Módulo 7 (envio pelo próprio Tibé, provider ATIVO em
 * WhatsAppProviderConfig). O N8N segue indispensável só para ENTRADA
 * (receber mensagem e classificar intenção), onde não tem substituto.
 *
 * Toda a política de QUAL canal tentar (e quando) mora dentro de notify():
 * este arquivo só resolve o destinatário e monta o conteúdo.
 */

export async function findAlertRecipient(db: TenantPrismaClient) {
  const owner = await db.user.findFirst({ where: { role: "OWNER", active: true } });
  if (owner) return owner;
  return db.user.findFirst({ where: { role: "ADMIN", active: true } });
}

export async function deliverPendingAlertsForTenant(tenantId: string): Promise<{ sent: number }> {
  const db = prismaForTenant(tenantId);
  const pending = await db.alert.findMany({ where: { status: "pending" } });
  if (pending.length === 0) return { sent: 0 };

  const recipient = await findAlertRecipient(db);
  if (!recipient) return { sent: 0 };

  let sent = 0;
  for (const alert of pending) {
    const result = await notify(
      {
        tenant_id: tenantId,
        user_id: recipient.id,
        phone: recipient.phone,
        email: recipient.email,
      },
      {
        pushTitle: "Novo aviso no Tibé",
        pushBody: alert.message,
        pushUrl: "/alertas",
        whatsappText: alert.message,
        email: {
          subject: "Novo aviso no Tibé",
          html: buildAlertEmailHtml({ message: alert.message }),
          type: "alert",
        },
      },
      "critical",
    );

    if (result.delivered) {
      await db.alert.update({
        where: { id: alert.id },
        data: { status: "sent", sent_at: new Date() },
      });
      sent++;
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
