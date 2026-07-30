import { prisma, prismaForTenant, type TenantPrismaClient } from "@/lib/prisma";
import { sendEmail } from "@/lib/email-send";
import { buildAlertEmailHtml } from "@/lib/email-templates";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";

/**
 * Envio de alertas pendentes por 2 canais independentes (spec 4.11 + arquitetura
 * 2026-07-29): WhatsApp e email (Gmail SMTP/Resend, nunca lança, sempre grava
 * EmailLog). Um alerta vira `sent` assim que QUALQUER UM dos 2 canais entregar:
 * sem isso, um alerta que só falha no WhatsApp ficaria `pending` pra sempre e
 * reenviaria o mesmo email todo dia no cron.
 *
 * ⚠️ Mudança de 2026-07-30: o WhatsApp do alerta saía por um webhook do N8N
 * (`N8N_ALERT_WEBHOOK_URL`), herança da regra original "o Tibé nunca fala
 * direto com a Meta". Essa regra já tinha sido quebrada de propósito no
 * Módulo 7, quando o envio passou a ser do próprio Tibé pelo provider ATIVO
 * (`sendWhatsAppMessage`). Manter o salto pelo N8N só para alertas era um
 * ponto de falha extra, um segundo workflow para manter e uma variável de
 * ambiente que nunca chegou a ser configurada (o alerta simplesmente não saía
 * por WhatsApp). O N8N segue indispensável no sentido de ENTRADA (receber a
 * mensagem e classificar a intenção), que é onde ele não tem substituto.
 *
 * Se o destinatário não tiver telefone, ou nenhum provider estiver ativo, só o
 * email é tentado: melhor esforço por canal, nunca bloqueia o job.
 */

async function findAlertRecipient(db: TenantPrismaClient) {
  const owner = await db.user.findFirst({ where: { role: "OWNER", active: true } });
  if (owner) return owner;
  return db.user.findFirst({ where: { role: "ADMIN", active: true } });
}

async function sendAlertWhatsApp(phone: string, message: string): Promise<boolean> {
  try {
    const res = await sendWhatsAppMessage(phone, message);
    return res.ok;
  } catch {
    // Provider indisponível/erro de rede: tenta de novo na próxima execução.
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
      ? await sendAlertWhatsApp(recipient.phone, alert.message)
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
