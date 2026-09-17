"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useAviso } from "@/components/ui/toast";
import { fetchVapidPublicKey, isPushSupported, subscribeToPush } from "./push-client";

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
 * não levaria a inscrição nenhuma).
 *
 * Desde a Fase 6 / Task 2b (2026-09-17), este cartão **não é mais o único
 * caminho** para ligar notificação: Configurações > Alertas tem o controle
 * de verdade (liga, desliga, mostra o estado, e explica quando o navegador
 * bloqueou). Quem dispensa este cartão continua achando o recurso lá. É por
 * isso que "Agora não" pode seguir definitivo (ver `rememberDismissal`):
 * antes, dispensar aqui perdia o recurso para sempre; agora só troca de
 * caminho.
 */

const DISMISSED_KEY = "tibe.push.convite-dispensado";
/** Chave só de LEITURA de install-invite.tsx: nunca escrita por este componente. */
const INSTALL_DISMISSED_KEY = "tibe.pwa.convite-dispensado";

/**
 * Tempo máximo que este convite cede o canto da tela ao de instalar o PWA,
 * antes de aparecer mesmo assim.
 *
 * Antes: a condição era "espera o convite de instalar sumir", mas o
 * navegador recaptura `beforeinstallprompt` A CADA carregamento, então
 * `window.__tibeInstallPrompt` nunca fica vazio sozinho e a espera nunca
 * terminava, para toda visita futura. Dois cartões empilhados por alguns
 * segundos é bem mais barato do que este convite nunca aparecer para quem
 * não decidiu nada sobre o de instalar.
 */
const INSTALL_INVITE_GRACE_MS = 4000;

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

/**
 * Heurística: só vale durante o prazo de `INSTALL_INVITE_GRACE_MS`. Depois
 * disso o convite de notificação aparece de qualquer jeito, mesmo que o de
 * instalar ainda esteja de pé.
 */
function installInviteMightBeShowing(): boolean {
  try {
    const dismissed = window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
    return !dismissed && Boolean(window.__tibeInstallPrompt);
  } catch {
    return false;
  }
}

export default function NotificationOptIn() {
  const aviso = useAviso();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushSupported() || isDismissed()) return;
    if (Notification.permission !== "default") return; // já decidido (concedido ou negado): nada a perguntar

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tentarMostrar = async () => {
      const key = await fetchVapidPublicKey();
      if (!cancelled && key) {
        setVapidPublicKey(key);
        setVisible(true);
      }
    };

    if (installInviteMightBeShowing()) {
      timer = setTimeout(() => {
        if (!cancelled) tentarMostrar();
      }, INSTALL_INVITE_GRACE_MS);
    } else {
      tentarMostrar();
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    rememberDismissal();
    setVisible(false);
  }, []);

  const enable = useCallback(async () => {
    if (!vapidPublicKey || busy) return;
    setBusy(true);
    const resultado = await subscribeToPush(vapidPublicKey);
    setBusy(false);
    if (!resultado.ok) {
      if (resultado.reason === "erro") {
        // Falha de rede ou do servidor: não engole e não dispensa para
        // sempre, porque é o tipo de falha que vale tentar de novo. O cartão
        // continua na tela.
        aviso.erro(resultado.message);
        return;
      }
      if (resultado.reason === "indeciso") {
        // Fechou a bolha sem decidir: a permissão segue "default", não foi
        // recusa nenhuma. Não grava dispensa, o cartão continua ali para
        // tentar de novo quando quiser.
        return;
      }
      // Permissão bloqueada (denied): definitivo, nenhum navegador deixa
      // pedir de novo por aqui. Configurações > Alertas explica como liberar
      // pelo cadeado da barra de endereço.
      rememberDismissal();
      setVisible(false);
      return;
    }
    aviso.sucesso("Notificações ativadas neste navegador.");
    rememberDismissal();
    setVisible(false);
  }, [vapidPublicKey, busy, aviso]);

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
