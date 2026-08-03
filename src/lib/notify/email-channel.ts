import { sendEmail } from "@/lib/email-send";
import type { EmailLogType } from "@/generated/prisma/enums";
import type { NotifyChannelResult } from "./types";

/**
 * Canal de email do seam de notificação: reusa sendEmail (src/lib/email-send.ts,
 * nunca lança, sempre grava EmailLog), só traduzindo o resultado para o
 * formato comum do notify(). Usado apenas em urgency "critical" (a política
 * de quando chamar este módulo mora em notify(), não aqui).
 */
export async function sendEmailChannel(params: {
  tenant_id: string;
  to: string;
  subject: string;
  html: string;
  type?: EmailLogType;
  related_id?: string | null;
}): Promise<NotifyChannelResult> {
  const result = await sendEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    tenant_id: params.tenant_id,
    type: params.type ?? "alert",
    related_id: params.related_id ?? null,
  });
  return { attempted: true, ok: result.ok };
}
