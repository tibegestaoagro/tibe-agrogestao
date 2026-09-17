"use client";

/**
 * Funções client-only de push, compartilhadas pelo cartão de convite
 * (`notification-opt-in.tsx`) e pelo controle de Configurações > Alertas
 * (`push-toggle.tsx`). Extraído na Fase 6 / Task 2b (2026-09-17) para as duas
 * telas nascerem da mesma lógica de inscrever e desinscrever, em vez de duas
 * cópias divergindo com o tempo.
 *
 * A fonte de verdade de "este navegador está inscrito" é o próprio
 * `PushManager`, nunca o banco: é o navegador que sabe se guarda uma
 * inscrição viva para esta origem.
 */

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * VAPID exige a chave pública como bytes; o servidor devolve base64url.
 * Laço clássico (não spread de string) de propósito: o tsconfig deste
 * projeto não tem `target` ES2015+/`downlevelIteration`, e um índice
 * numérico funciona sob qualquer target.
 */
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64Safe);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

/**
 * `null` tanto para "servidor sem VAPID configurada" quanto para falha de
 * rede: as duas telas tratam do mesmo jeito (sem botão que levaria a lugar
 * nenhum), então não há motivo para distinguir aqui.
 */
export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/v1/notifications/public-key");
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { vapid_public_key: string | null } };
    return body.data?.vapid_public_key ?? null;
  } catch {
    return null;
  }
}

/** Inscrição já ativa NESTE navegador, se houver. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "negado" }
  | { ok: false; reason: "indeciso" }
  | { ok: false; reason: "erro"; message: string };

/** Pede permissão (se ainda não decidida), inscreve e registra no servidor. */
export async function subscribeToPush(vapidPublicKey: string): Promise<SubscribeResult> {
  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    // Definitivo: nenhum navegador deixa pedir de novo depois de um bloqueio
    // explícito. Só sai daqui pelo cadeado da barra de endereço.
    return { ok: false, reason: "negado" };
  }
  if (permission !== "granted") {
    // `requestPermission()` resolve com "default" quando a pessoa fecha a
    // bolha sem decidir (X, swipe, clique fora). A permissão não mudou: o
    // navegador pergunta de novo na próxima tentativa, então isto não é
    // bloqueio e não deve ser tratado como "negado".
    return { ok: false, reason: "indeciso" };
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast explícito: o lib.dom.d.ts instalado tipa Uint8Array como
      // genérico sobre o buffer (ArrayBufferLike vs. ArrayBuffer) e recusa a
      // atribuição direta, embora um Uint8Array seja um BufferSource válido
      // em runtime independente desse detalhe de tipo.
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
    });
    const json = subscription.toJSON();
    const res = await fetch("/api/v1/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      await subscription.unsubscribe().catch(() => {});
      return {
        ok: false,
        reason: "erro",
        message: body?.error?.message ?? "Não foi possível salvar a inscrição no servidor.",
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      reason: "erro",
      message: "Não foi possível ativar as notificações neste navegador.",
    };
  }
}

export type UnsubscribeResult = { ok: true } | { ok: false; message: string };

/**
 * Cancela no servidor primeiro; só desinscreve o navegador se o servidor
 * confirmar. Nessa ordem, uma falha de rede deixa os dois lados coerentes
 * (ainda inscrito) em vez de o navegador esquecer e o banco continuar com um
 * registro que ninguém mais vai cancelar.
 */
export async function unsubscribeFromPush(subscription: PushSubscription): Promise<UnsubscribeResult> {
  try {
    const res = await fetch("/api/v1/notifications/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, message: body?.error?.message ?? "Não foi possível desligar as notificações." };
    }
    await subscription.unsubscribe();
    return { ok: true };
  } catch {
    return { ok: false, message: "Não foi possível desligar as notificações." };
  }
}
