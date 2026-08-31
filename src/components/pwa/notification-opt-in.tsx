"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

/**
 * Convite discreto para ativar notificações push (Onda 2, seam de
 * notificação: src/lib/notify). Mesmo espírito do convite de instalação do
 * PWA (install-invite.tsx): dispensável, não insiste se recusado, guardado
 * em localStorage (só um booleano, sem dado pessoal: aparelho compartilhado
 * no campo).
 *
 * Só aparece quando faz sentido: Push API + Service Worker suportados,
 * permissão do navegador ainda não decidida (nenhum navegador deixa pedir de
 * novo depois de um "bloquear" explícito, então insistir aqui seria um botão
 * morto) e o servidor tem uma chave VAPID configurada (senão pedir permissão
 * não levaria a inscrição nenhuma: produção ainda não tem as 3 variáveis
 * VAPID definidas neste momento, ver relatório da Onda 2 / handoff).
 */

const DISMISSED_KEY = "tibe.push.convite-dispensado";
/** Chave só de LEITURA de install-invite.tsx: nunca escrita por este componente. Evita os dois convites disputando o mesmo canto da tela ao mesmo tempo. */
const INSTALL_DISMISSED_KEY = "tibe.pwa.convite-dispensado";

function isDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Navegação privada com storage bloqueado: sem memória da recusa, o
    // convite reaparece na próxima visita. Melhor isso do que quebrar a página.
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Ver isDismissed acima.
  }
}

function isPushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * O convite de instalação do PWA (install-invite.tsx) ocupa o mesmo canto
 * inferior da tela. Sem acoplar os dois componentes, esta é uma checagem
 * heurística: se aquele convite ainda não foi dispensado E o navegador tem um
 * prompt de instalação capturado, ele provavelmente está visível agora, então
 * este convite espera a próxima montagem em vez de sobrepor o outro.
 */
function installInviteMightBeShowing(): boolean {
  try {
    const dismissed = window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
    return !dismissed && Boolean(window.__tibeInstallPrompt);
  } catch {
    return false;
  }
}

/**
 * VAPID exige a chave pública como bytes; o servidor devolve base64url.
 * Laço clássico (não spread de string) de propósito: o tsconfig deste
 * projeto não tem `target` ES2015+/`downlevelIteration`, e um índice
 * numérico funciona sob qualquer target.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64Safe);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

export default function NotificationOptIn() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported() || isDismissed() || installInviteMightBeShowing()) return;
    if (Notification.permission !== "default") return; // já decidido (concedido ou negado): nada a perguntar

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/notifications/public-key");
        if (!res.ok) return;
        const body = (await res.json()) as { data?: { vapid_public_key: string | null } };
        const key = body.data?.vapid_public_key ?? null;
        if (!cancelled && key) {
          setVapidPublicKey(key);
          setVisible(true);
        }
      } catch {
        // Sem rede/servidor fora do ar: sem convite, sem erro visível.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = useCallback(() => {
    rememberDismissal();
    setVisible(false);
  }, []);

  const enable = useCallback(async () => {
    if (!vapidPublicKey || busy) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        rememberDismissal();
        setVisible(false);
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast explícito: o lib.dom.d.ts instalado tipa Uint8Array como
        // genérico sobre o buffer (ArrayBufferLike vs. ArrayBuffer) e recusa
        // a atribuição direta, embora um Uint8Array seja um BufferSource
        // válido em runtime independente desse detalhe de tipo.
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      await fetch("/api/v1/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      rememberDismissal();
      setVisible(false);
    } catch {
      // Falha em qualquer etapa (permissão negada pelo SO, inscrição ou
      // rede): melhor esforço, o painel continua funcionando sem push.
      setVisible(false);
    } finally {
      setBusy(false);
    }
  }, [vapidPublicKey, busy]);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Ativar notificações"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] print:hidden"
    >
      <div className="animate-in fade-in slide-in-from-bottom-4 flex w-full max-w-md items-start gap-3 rounded-xl border border-borda bg-superficie p-4 shadow-lg duration-300">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-tibe-light">
          <Bell className="h-5 w-5 text-primaria-tinta" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight text-tibe-dark">
            Ativar notificações
          </p>
          <p className="mt-1 text-xs leading-relaxed text-texto-secundario">
            Receba avisos de vencimento e o resumo do dia direto no aparelho,
            sem depender do WhatsApp.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className="min-h-11 rounded-lg bg-primaria px-4 py-2 text-sm font-semibold text-sobre-primaria transition-colors hover:bg-primaria-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tibe-primary disabled:opacity-60"
            >
              {busy ? "Ativando" : "Ativar"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-texto-secundario transition-colors hover:bg-superficie-afundada"
            >
              Agora não
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar o convite de notificações"
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-texto-discreto transition-colors hover:bg-superficie-afundada hover:text-texto-secundario"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
