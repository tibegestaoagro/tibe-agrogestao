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

/**
 * Chave pública VAPID, servida ao cliente para `pushManager.subscribe()`. Não
 * é segredo: é a metade "pública" do par. Só devolve a chave quando as TRÊS
 * variáveis existem (mesma condição de `configureVapid`): convidar e enviar
 * precisam concordar, senão o convite aparece para um canal que não consegue
 * entregar nada.
 */
export function getVapidPublicKey(): string | null {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
    return null;
  }
  return process.env.VAPID_PUBLIC_KEY;
}

/** Falhas seguidas (fora 404/410) que apagam uma inscrição. Ver `failures` no schema. */
export const FALHAS_PARA_PODAR = 3;

/**
 * Envia `payload` para as inscrições de push de UMA pessoa.
 *
 * Dívida 5.0f: até 07/10 o envio ia para todas as inscrições do TENANT, e o
 * resultado decidia o canal de quem recebia o alerta. A secretária com push no
 * notebook fazia o WhatsApp do produtor não ser tentado: `push.ok` era dela.
 * O canal é decisão sobre uma pessoa, e o envio agora também é.
 *
 * Poda (dívida 5.0g): 404/410 (RFC 8030: o navegador cancelou ou o endpoint
 * expirou) apaga na hora. Qualquer outra falha conta: `FALHAS_PARA_PODAR`
 * seguidas apagam, e uma entrega zera. O 403 de chave VAPID trocada entra
 * aqui, e não na poda imediata, de propósito: um deploy com a chave errada
 * devolveria 403 para TODAS as inscrições, e apagar na hora derrubaria o push
 * de todo mundo por um engano de configuração.
 */
export async function sendPushToUser(
  recipient: { tenant_id: string; user_id: string },
  payload: PushPayload,
): Promise<NotifyPushResult> {
  try {
    const db = prismaForTenant(recipient.tenant_id);
    const subscriptions = await db.pushSubscription.findMany({ where: { user_id: recipient.user_id } });

    if (!configureVapid()) {
      return { attempted: false, ok: false, subscriptions: subscriptions.length, sent: 0, failed: 0, configurado: false };
    }
    if (subscriptions.length === 0) {
      return { attempted: false, ok: false, subscriptions: 0, sent: 0, failed: 0, configurado: true };
    }

    const body = JSON.stringify(payload);
    let sent = 0;
    let failed = 0;
    const mortas: string[] = [];
    const falharam: string[] = [];
    const voltaram: string[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            body,
          );
          sent++;
          if (sub.failures > 0) voltaram.push(sub.id);
        } catch (e) {
          failed++;
          if (e instanceof webpush.WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
            mortas.push(sub.id);
          } else {
            falharam.push(sub.id);
          }
        }
      }),
    );

    // Melhor esforço, como o resto deste canal: a contabilidade da poda nunca
    // derruba o envio que já aconteceu.
    await Promise.all([
      mortas.length > 0 ? db.pushSubscription.deleteMany({ where: { id: { in: mortas } } }) : null,
      voltaram.length > 0
        ? db.pushSubscription.updateMany({ where: { id: { in: voltaram } }, data: { failures: 0 } })
        : null,
      falharam.length > 0
        ? db.pushSubscription
            .updateMany({ where: { id: { in: falharam } }, data: { failures: { increment: 1 } } })
            .then(() =>
              db.pushSubscription.deleteMany({
                where: { id: { in: falharam }, failures: { gte: FALHAS_PARA_PODAR } },
              }),
            )
        : null,
    ]).catch(() => {});

    return { attempted: true, ok: sent > 0, subscriptions: subscriptions.length, sent, failed, configurado: true };
  } catch {
    // Melhor esforço: erro inesperado (ex: banco indisponível) não pode
    // derrubar o job de alerta/resumo por causa do canal de push.
    return { attempted: false, ok: false, subscriptions: 0, sent: 0, failed: 0, configurado: false };
  }
}
