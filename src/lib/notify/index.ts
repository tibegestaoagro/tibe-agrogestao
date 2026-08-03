import { sendPushToTenant, type PushPayload } from "./push";
import { sendWhatsappChannel } from "./whatsapp-channel";
import { sendEmailChannel } from "./email-channel";
import type { NotifyUrgency, NotifyRecipient, NotifyContent, NotifyResult, NotifyChannelResult } from "./types";

export type {
  NotifyUrgency,
  NotifyRecipient,
  NotifyContent,
  NotifyResult,
  NotifyChannelResult,
  NotifyPushResult,
} from "./types";
export { saveSubscription, removeSubscription, type SaveSubscriptionInput } from "./push-subscriptions";
export { getVapidPublicKey } from "./push";

const NOT_ATTEMPTED: NotifyChannelResult = { attempted: false, ok: false };

/**
 * Seam único de entrega de notificação (Onda 2, plano de arquitetura seção
 * 2.4). Quem chama não escolhe canal: descreve o conteúdo e a urgência, e a
 * política de QUAIS canais tentar mora aqui dentro.
 *
 * - "critical" (os 5 AlertType existentes): tenta push, WhatsApp e email em
 *   PARALELO. `delivered` fica true assim que qualquer um dos três responder
 *   ok: exatamente a garantia que alert-delivery.ts já tinha para
 *   WhatsApp+email antes desta refatoração, com push como um terceiro canal
 *   aditivo (não substitui os outros dois; eles continuam obrigatórios).
 * - "digest" (resumo diário, novo): tenta push primeiro. Só tenta WhatsApp
 *   se o tenant não tiver NENHUMA inscrição de push ativa: é a EXISTÊNCIA de
 *   inscrição que decide o fallback, não o sucesso da entrega (uma
 *   inscrição presente cuja entrega falhou não cai para WhatsApp). Nunca
 *   tenta email: resumo diário todo dia por email é ruído, diferente de um
 *   alerta pontual que precisa de comprovação.
 */
export async function notify(
  recipient: NotifyRecipient,
  content: NotifyContent,
  urgency: NotifyUrgency,
): Promise<NotifyResult> {
  const pushPayload: PushPayload = {
    title: content.pushTitle,
    body: content.pushBody,
    url: content.pushUrl ?? "/dashboard",
  };
  const push = await sendPushToTenant(recipient.tenant_id, pushPayload);

  if (urgency === "critical") {
    const [whatsapp, email] = await Promise.all([
      sendWhatsappChannel(recipient.phone, content.whatsappText),
      content.email
        ? sendEmailChannel({
            tenant_id: recipient.tenant_id,
            to: recipient.email,
            subject: content.email.subject,
            html: content.email.html,
            type: content.email.type,
          })
        : Promise.resolve(NOT_ATTEMPTED),
    ]);
    return { delivered: push.ok || whatsapp.ok || email.ok, push, whatsapp, email };
  }

  // digest: ver comentário acima sobre existência vs. sucesso de entrega.
  const whatsapp =
    push.subscriptions === 0
      ? await sendWhatsappChannel(recipient.phone, content.whatsappText)
      : NOT_ATTEMPTED;

  return { delivered: push.ok || whatsapp.ok, push, whatsapp, email: NOT_ATTEMPTED };
}
