import { sendPushToTenant, type PushPayload } from "./push";
import { sendWhatsappChannel } from "./whatsapp-channel";
import { sendEmailChannel } from "./email-channel";
import type {
  NotifyUrgency,
  NotifyRecipient,
  NotifyContent,
  NotifyResult,
  NotifyChannelResult,
  NotifyPushResult,
} from "./types";

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
const PUSH_NOT_ATTEMPTED: NotifyPushResult = {
  attempted: false,
  ok: false,
  subscriptions: 0,
  sent: 0,
  failed: 0,
  configurado: false,
};

/**
 * Seam único de entrega de notificação (Onda 2, plano de arquitetura seção
 * 2.4). Quem chama não escolhe canal: descreve o conteúdo e a urgência, e a
 * política de QUAIS canais tentar mora aqui dentro.
 *
 * - "critical" (os 5 AlertType existentes): push e email SEMPRE. WhatsApp é
 *   tentado sempre que o push NÃO ENTREGOU (Fase 6 Task 3, 2026-09-17,
 *   revisado no mesmo dia): `!push.ok`, seja porque não está configurado,
 *   porque não há inscrição, ou porque a inscrição existe mas a entrega
 *   FALHOU de verdade (`push.attempted && !push.ok`, ex.: `sent: 0`). Só pula
 *   o WhatsApp quando o push comprovadamente chegou a pelo menos um aparelho.
 *   `delivered` fica true assim que qualquer canal TENTADO responder ok.
 * - "digest" (resumo diário, novo): tenta push primeiro. Só tenta WhatsApp
 *   se o tenant não tiver NENHUMA inscrição de push ativa: é a EXISTÊNCIA de
 *   inscrição que decide o fallback, não o sucesso da entrega (uma
 *   inscrição presente cuja entrega falhou não cai para WhatsApp). Nunca
 *   tenta email: resumo diário todo dia por email é ruído, diferente de um
 *   alerta pontual que precisa de comprovação.
 *
 *   **Por que "critical" e "digest" usam critérios diferentes** (existência
 *   vs. entrega) para a MESMA decisão de fallback, e por que isso não deve
 *   ser "uniformizado" depois: no digest, o que decide é a EXISTÊNCIA do
 *   canal (falhou hoje, amanhã tem outro resumo, e duplicar todo dia por dois
 *   canais é o ruído que a política existe para cortar). No crítico, o que
 *   decide é a ENTREGA: é uma tentativa só, sobre prazo e dinheiro, e
 *   duplicar o aviso é mais barato que silenciar um vencimento por causa de
 *   uma inscrição de push morta que ninguém ainda reportou.
 * - "conversa": WhatsApp sempre, push nunca, email nunca. O critério que
 *   separa esta urgência das outras (2026-09-16, achado de auditoria: a rota
 *   de lembrete de cadastro tinha ido para "digest" antes de alguém reler o
 *   texto da mensagem): **`conversa` é mensagem que espera resposta e
 *   pertence a um fio já aberto no WhatsApp** (ex.: "responda cancelar" de um
 *   cadastro assistido pela metade). Notificação do sistema não tem como
 *   responder, então push não é sequer tentado aqui, diferente do "digest"
 *   (onde push é o canal preferido e WhatsApp é o fallback). Antes de trocar
 *   uma chamada `conversa` por `digest` de novo, confira se o texto enviado
 *   pede uma resposta: se pedir, o push desta urgência entregaria a mensagem
 *   num lugar sem como responder.
 */
export async function notify(
  recipient: NotifyRecipient,
  content: NotifyContent,
  urgency: NotifyUrgency,
): Promise<NotifyResult> {
  if (urgency === "conversa") {
    const whatsapp = await sendWhatsappChannel(recipient.phone, content.whatsappText);
    return { delivered: whatsapp.ok, push: PUSH_NOT_ATTEMPTED, whatsapp, email: NOT_ATTEMPTED };
  }

  const pushPayload: PushPayload = {
    title: content.pushTitle,
    body: content.pushBody,
    url: content.pushUrl ?? "/meu-dia",
  };
  const push = await sendPushToTenant(recipient.tenant_id, pushPayload);

  if (urgency === "critical") {
    // Diferente do "digest": aqui o que decide é a ENTREGA (`push.ok`), não a
    // existência da inscrição. Ver o porquê no comentário do topo da função.
    const [whatsapp, email] = await Promise.all([
      !push.ok
        ? sendWhatsappChannel(recipient.phone, content.whatsappText)
        : Promise.resolve(NOT_ATTEMPTED),
      content.email
        ? sendEmailChannel({
            tenant_id: recipient.tenant_id,
            to: recipient.email,
            subject: content.email.subject,
            html: content.email.html,
            type: content.email.type,
            related_id: content.email.related_id,
          })
        : Promise.resolve(NOT_ATTEMPTED),
    ]);
    return { delivered: push.ok || whatsapp.ok || email.ok, push, whatsapp, email };
  }

  // digest: ver comentário acima sobre existência vs. sucesso de entrega.
  // Canal que não pode entregar (VAPID incompleto) conta como INEXISTENTE,
  // nunca como "tentado e falhou": por isso `!push.configurado` cai para
  // WhatsApp do mesmo jeito que "sem inscrição" cai. Regra válida para
  // qualquer canal novo que este seam ganhar no futuro.
  const whatsapp =
    !push.configurado || push.subscriptions === 0
      ? await sendWhatsappChannel(recipient.phone, content.whatsappText)
      : NOT_ATTEMPTED;

  return { delivered: push.ok || whatsapp.ok, push, whatsapp, email: NOT_ATTEMPTED };
}
