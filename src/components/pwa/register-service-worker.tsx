"use client";

import { useEffect } from "react";

/**
 * Registra o service worker (public/sw.js). Não desenha nada.
 *
 * Só em produção de propósito: em `next dev` o bundle é reconstruído a cada
 * alteração, e um service worker guardando chunk antigo em cache produz erro de
 * "chunk não encontrado" que parece bug do código e não é. Para testar o
 * comportamento offline, use `npm run build && npm start`.
 *
 * Falha de registro é engolida: o service worker é melhoria progressiva. Se ele
 * não subir (navegador sem suporte, HTTP sem TLS, resposta redirecionada), o
 * painel tem que continuar funcionando exatamente como antes.
 */
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
          // O navegador busca o próprio sw.js sempre na rede, sem passar pelo
          // cache HTTP: sem isso uma versão velha pode ficar presa por até 24h.
          updateViaCache: "none",
        })
        .catch(() => undefined);
    };

    // Espera o `load` para não disputar banda com o primeiro render.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
