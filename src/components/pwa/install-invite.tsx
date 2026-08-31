"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";

/**
 * Convite discreto para instalar o Tibé na tela inicial.
 *
 * Três regras vêm do briefing da Onda 1 e não são negociáveis: o convite é
 * discreto, é dispensável e não volta depois de recusado. A recusa fica em
 * localStorage; é só um booleano, sem nada de pessoal, o que importa porque o
 * público deste produto compartilha aparelho.
 *
 * Dois caminhos, porque os navegadores não concordam entre si:
 *
 * - Chrome/Edge/Android disparam `beforeinstallprompt`. Quem captura esse
 *   evento é o script embutido de `capture-install-prompt.tsx`, porque ele
 *   dispara ANTES da hidratação (ver o comentário longo lá). Aqui só lemos o
 *   que ficou guardado e chamamos `prompt()` no clique: o instalador nativo só
 *   pode ser aberto a partir de um gesto do usuário.
 * - Safari no iOS não tem esse evento nem API de instalação. Lá o único caminho
 *   é o menu Compartilhar, então o convite vira instrução em vez de botão.
 *
 * Nada aqui pede permissão de notificação: push é assunto da Onda 2.
 */

const DISMISSED_KEY = "tibe.pwa.convite-dispensado";

/** Atraso antes do convite no iOS, para não competir com o primeiro render. */
const IOS_DELAY_MS = 5000;

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Onde `capture-install-prompt.tsx` deixa o evento capturado cedo. */
declare global {
  interface Window {
    __tibeInstallPrompt?: InstallPromptEvent | null;
  }
}

function isDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    // Navegação privada com storage bloqueado: sem memória da recusa, o convite
    // reaparece na próxima visita. Melhor isso do que quebrar a página.
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Ver acima.
  }
}

/** Já instalado: em pé nenhum convite faz sentido. */
function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari no iOS não implementa display-mode; expõe esta propriedade.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ se apresenta como Mac; o toque é o que o denuncia.
  const iPadOs = /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOs;
}

export default function InstallInvite() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isRunningStandalone() || isDismissed()) return;

    // Caso normal: o evento já foi capturado antes da hidratação.
    //
    // O plugin do React 19 sinaliza este `setState` no corpo do efeito, e a
    // resposta canônica seria `useSyncExternalStore`: `window.__tibeInstallPrompt`
    // é exatamente um sistema externo com evento de assinatura. Não fica aqui
    // porque inicializar pelo `useState` daria descompasso de hidratação (o
    // servidor não tem o evento) e porque a refatoração pertence à rodada que
    // vai rever os componentes de PWA, não a uma subida de framework.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.__tibeInstallPrompt) setPromptEvent(window.__tibeInstallPrompt);

    const onCaptured = () => {
      if (window.__tibeInstallPrompt) setPromptEvent(window.__tibeInstallPrompt);
    };

    const onInstalled = () => {
      rememberDismissal();
      window.__tibeInstallPrompt = null;
      setPromptEvent(null);
      setShowIosHint(false);
    };

    // Rede de segurança para o evento chegar depois deste `mount`.
    window.addEventListener("tibe:installprompt", onCaptured);
    window.addEventListener("appinstalled", onInstalled);

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (isIos()) {
      timer = setTimeout(() => setShowIosHint(true), IOS_DELAY_MS);
    }

    return () => {
      window.removeEventListener("tibe:installprompt", onCaptured);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = useCallback(() => {
    rememberDismissal();
    window.__tibeInstallPrompt = null;
    setPromptEvent(null);
    setShowIosHint(false);
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    // Recusar no instalador nativo também conta como recusa: reabrir o convite
    // depois disso é exatamente o comportamento que o briefing proíbe.
    rememberDismissal();
    window.__tibeInstallPrompt = null;
    setPromptEvent(null);
    try {
      await promptEvent.prompt();
      await promptEvent.userChoice;
    } catch {
      // O evento só pode ser usado uma vez; erro aqui não tem o que tratar.
    }
  }, [promptEvent]);

  const visible = promptEvent !== null || showIosHint;
  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Instalar o Tibé"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] print:hidden"
    >
      <div className="animate-in fade-in slide-in-from-bottom-4 flex w-full max-w-md items-start gap-3 rounded-xl border border-borda bg-superficie p-4 shadow-lg duration-300">
        <Image
          src="/icons/icon-192.png"
          alt=""
          width={40}
          height={40}
          className="mt-0.5 h-10 w-10 shrink-0 rounded-lg"
          unoptimized
        />

        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight text-tibe-dark">
            Instalar o Tibé
          </p>

          {promptEvent ? (
            <>
              <p className="mt-1 text-xs leading-relaxed text-texto-secundario">
                Deixe o Tibé na tela inicial do celular e abra direto, sem
                navegador.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={install}
                  className="min-h-11 rounded-lg bg-primaria px-4 py-2 text-sm font-semibold text-sobre-primaria transition-colors hover:bg-primaria-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tibe-primary disabled:opacity-60"
                >
                  Instalar
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-texto-secundario transition-colors hover:bg-superficie-afundada"
                >
                  Agora não
                </button>
              </div>
            </>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-texto-secundario">
              No iPhone, toque em <span className="font-semibold">Compartilhar</span>{" "}
              e depois em{" "}
              <span className="font-semibold">Adicionar à Tela de Início</span>.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dispensar o convite de instalação"
          className="-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-texto-discreto transition-colors hover:bg-superficie-afundada hover:text-texto-secundario"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
