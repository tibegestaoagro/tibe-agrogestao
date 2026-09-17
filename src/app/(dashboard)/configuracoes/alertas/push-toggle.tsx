"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { useAviso } from "@/components/ui/toast";
import { Carregando } from "@/components/ui/carregando";
import {
  fetchVapidPublicKey,
  getExistingSubscription,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/components/pwa/push-client";

/**
 * Controle de verdade para ligar e desligar notificação push, neste
 * navegador (Fase 6 / Task 2b, 2026-09-17).
 *
 * Até aqui o único caminho era o cartão de convite (`notification-opt-in.tsx`),
 * que desaparecia para sempre depois de um "Agora não". Este controle não
 * depende de convite: mostra o estado real (ativo, não ativo, bloqueado pelo
 * navegador, sem suporte) e sempre oferece a ação que faz sentido para ele.
 */

type Estado =
  | { tipo: "carregando" }
  | { tipo: "sem-suporte" }
  | { tipo: "negado" }
  | { tipo: "ativo"; subscription: PushSubscription }
  | { tipo: "inativo" };

/**
 * Função pura (sem setState): calcula o estado a partir do navegador. Fica
 * fora do componente para o efeito de montagem poder chamá-la dentro de um
 * `.then()`, em vez de invocar direto um `useCallback` que faz `setState`,
 * padrão que o `react-hooks/set-state-in-effect` reprova.
 */
async function determinarEstado(): Promise<Estado> {
  if (!isPushSupported()) return { tipo: "sem-suporte" };
  if (Notification.permission === "denied") return { tipo: "negado" };
  const subscription = await getExistingSubscription();
  return subscription ? { tipo: "ativo", subscription } : { tipo: "inativo" };
}

export default function PushToggle() {
  const aviso = useAviso();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [vapidPublicKey, setVapidPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const avaliar = useCallback(async () => {
    setEstado(await determinarEstado());
  }, []);

  useEffect(() => {
    let cancelled = false;
    determinarEstado().then((e) => {
      if (!cancelled) setEstado(e);
    });
    fetchVapidPublicKey().then((key) => {
      if (!cancelled) setVapidPublicKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ligar = useCallback(async () => {
    if (busy) return;
    if (!vapidPublicKey) {
      aviso.erro("Notificação push não está configurada no servidor no momento.");
      return;
    }
    setBusy(true);
    const resultado = await subscribeToPush(vapidPublicKey);
    setBusy(false);
    if (!resultado.ok) {
      if (resultado.reason === "negado") {
        setEstado({ tipo: "negado" });
        return;
      }
      aviso.erro(resultado.message);
      return;
    }
    aviso.sucesso("Notificações ativadas neste navegador.");
    await avaliar();
  }, [busy, vapidPublicKey, aviso, avaliar]);

  const desligar = useCallback(async () => {
    if (busy || estado.tipo !== "ativo") return;
    setBusy(true);
    const resultado = await unsubscribeFromPush(estado.subscription);
    setBusy(false);
    if (!resultado.ok) {
      aviso.erro(resultado.message);
      return;
    }
    aviso.sucesso("Notificações desligadas neste navegador.");
    await avaliar();
  }, [busy, estado, aviso, avaliar]);

  return (
    <div className="rounded-lg border border-borda bg-superficie p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primaria-suave">
          <Bell className="h-5 w-5 text-primaria-tinta" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-texto">Notificações push neste navegador</p>
          <p className="mt-1 text-xs text-texto-discreto">
            Recebe avisos e o resumo do dia direto no aparelho, sem depender do WhatsApp.
          </p>

          <div className="mt-3">
            {estado.tipo === "carregando" && <Carregando linhas={1} className="max-w-xs" />}

            {estado.tipo === "sem-suporte" && (
              <p className="rounded-md bg-atencao-suave px-3 py-2 text-xs text-atencao-tinta">
                Este navegador não suporta notificação push. Tente pelo Chrome, Edge ou
                Firefox atualizados.
              </p>
            )}

            {estado.tipo === "negado" && (
              <p className="rounded-md bg-atencao-suave px-3 py-2 text-xs text-atencao-tinta">
                As notificações foram bloqueadas para este site. Não é possível pedir de
                novo por aqui: abra o cadeado (ou o ícone de informações) ao lado do
                endereço na barra do navegador e libere &quot;Notificações&quot; manualmente.
              </p>
            )}

            {estado.tipo === "inativo" && (
              <button
                type="button"
                onClick={ligar}
                disabled={busy}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primaria px-4 py-2 text-sm font-semibold text-sobre-primaria transition-colors hover:bg-primaria-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tibe-primary disabled:opacity-60"
              >
                <BellRing className="h-4 w-4" aria-hidden="true" />
                {busy ? "Ativando" : "Ativar notificações"}
              </button>
            )}

            {estado.tipo === "ativo" && (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sucesso-suave px-3 py-1 text-xs font-medium text-sucesso-tinta">
                  <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                  Ativas neste navegador
                </span>
                <button
                  type="button"
                  onClick={desligar}
                  disabled={busy}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-borda px-4 py-2 text-sm font-medium text-texto-secundario transition-colors hover:bg-superficie-afundada disabled:opacity-60"
                >
                  <BellOff className="h-4 w-4" aria-hidden="true" />
                  {busy ? "Desligando" : "Desligar"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
