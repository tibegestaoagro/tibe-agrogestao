import { prisma, prismaForTenant, type TenantPrismaClient } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-send";
import { buildAlertEmailHtml } from "@/lib/email-templates";

/**
 * Envio de alertas pendentes por 2 canais independentes (spec 4.11 + arquitetura
 * 2026-07-29): WhatsApp via N8N → Meta (mesma arquitetura do Módulo 3: Tibé
 * nunca fala direto com a Meta Cloud API) e email (Gmail SMTP/Resend, nunca
 * lança, sempre grava EmailLog). Um alerta vira `sent` assim que QUALQUER UM
 * dos 2 canais entregar com sucesso: sem isso, um alerta que só falha no
 * WhatsApp (ex: N8N_ALERT_WEBHOOK_URL não configurada, gap conhecido) ficaria
 * `pending` pra sempre e reenviaria o mesmo email todo dia no cron.
 *
 * Se `N8N_ALERT_WEBHOOK_URL` não estiver configurada ou o destinatário não
 * tiver telefone, só o email é tentado (nada quebra: mesmo espírito do resto
 * do projeto, "melhor esforço" por canal, nunca bloqueia o job).
 */

async function findAlertRecipient(db: TenantPrismaClient) {
  const owner = await db.user.findFirst({ where: { role: "OWNER", active: true } });
  if (owner) return owner;
  return db.user.findFirst({ where: { role: "ADMIN", active: true } });
}

async function sendAlertWhatsApp(tenantId: string, phone: string, message: string): Promise<boolean> {
  const webhookUrl = process.env.N8N_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return false;
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, phone, message }),
    });
    return res.ok;
  } catch {
    // N8N indisponível/erro de rede: tenta de novo na próxima execução do job.
    return false;
  }
}

export async function deliverPendingAlertsForTenant(tenantId: string): Promise<{ sent: number }> {
  const db = prismaForTenant(tenantId);
  const pending = await db.alert.findMany({ where: { status: "pending" } });
  if (pending.length === 0) return { sent: 0 };

  const recipient = await findAlertRecipient(db);
  if (!recipient) return { sent: 0 };

  let sent = 0;
  for (const alert of pending) {
    const whatsappOk = recipient.phone
      ? await sendAlertWhatsApp(tenantId, recipient.phone, alert.message)
      : false;

    const emailResult = await sendEmail({
      to: recipient.email,
      subject: "Novo aviso no Tibé",
      html: buildAlertEmailHtml({ message: alert.message }),
      tenant_id: tenantId,
      type: "alert",
      related_id: alert.id,
    });

    if (whatsappOk || emailResult.ok) {
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
