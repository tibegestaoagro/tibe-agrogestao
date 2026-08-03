import webpush from "web-push";
import { prismaForTenant } from "@/lib/prisma";
import type { NotifyPushResult } from "./types";

/**
 * Canal de push web (RFC 8030/8291), Onda 2. A biblioteca `web-push` cuida da
 * criptografia da mensagem e da assinatura VAPID; este módulo só decide
 * QUANDO falar com ela e o que fazer com o resultado por inscrição.
 *
 * Sem as 3 variáveis VAPID configuradas (produção ainda não tem, ver
 * relatório do agente B1 na Onda 2), o canal fica indisponível: melhor
 * esforço, nunca lança. O mesmo princípio já usado pelo WhatsApp/email em
 * alert-delivery.ts: um canal fora do ar não pode derrubar o job.
 */

export type PushPayload = {
  title: string;
  body: string;
  url: string;
};

function configureVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  // Idempotente e barato (só guarda os valores em memória): chamar de novo a
  // cada envio evita cache de módulo que ficaria desatualizado se as
  // variáveis mudarem entre invocações (serverless).
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/** Chave pública VAPID, servida ao cliente para `pushManager.subscribe()`. Não é segredo: é a metade "pública" do par. */
export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

/**
 * Envia `payload` para todas as inscrições de push ativas do tenant.
 * Inscrições que o próprio push service reporta como mortas (404/410, RFC
 * 8030: o navegador cancelou ou o endpoint expirou) são removidas na hora:
 * reenviar para elas para sempre não tem utilidade e só custa uma chamada de
 * rede a cada alerta/resumo.
 */
export async function sendPushToTenant(
  tenantId: string,
  payload: PushPayload,
): Promise<NotifyPushResult> {
  try {
    const db = prismaForTenant(tenantId);
    const subscriptions = await db.pushSubscription.findMany();

    if (!configureVapid()) {
      return { attempted: false, ok: false, subscriptions: subscriptions.length, sent: 0, failed: 0 };
    }
    if (subscriptions.length === 0) {
      return { attempted: false, ok: false, subscriptions: 0, sent: 0, failed: 0 };
    }

    const body = JSON.stringify(payload);
    let sent = 0;
    let failed = 0;
    const deadEndpoints: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
          sent++;
        } catch (e) {
          failed++;
          if (e instanceof webpush.WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
            deadEndpoints.push(sub.endpoint);
          }
        }
      }),
    );

    if (deadEndpoints.length > 0) {
      await db.pushSubscription
        .deleteMany({ where: { endpoint: { in: deadEndpoints } } })
        .catch(() => {});
    }

    return { attempted: true, ok: sent > 0, subscriptions: subscriptions.length, sent, failed };
  } catch {
    // Melhor esforço: erro inesperado (ex: banco indisponível) não pode
    // derrubar o job de alerta/resumo por causa do canal de push.
    return { attempted: false, ok: false, subscriptions: 0, sent: 0, failed: 0 };
  }
}
