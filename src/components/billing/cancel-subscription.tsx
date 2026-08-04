"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/client-api";

/**
 * Cancelamento da assinatura.
 *
 * Fica no FIM da página, num bloco separado e discreto, longe do botão de
 * assinar: é a única ação terminal desta tela, e encostá-la na ação
 * principal convida ao clique errado. Pelo mesmo motivo tem confirmação em
 * dois passos, e o texto diz a consequência real (bloqueio imediato) antes
 * de o botão vermelho aparecer, não depois.
 */
export default function CancelSubscription() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/billing/cancel");
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-sm font-medium text-gray-700">Cancelar assinatura</p>

      {!confirming ? (
        <>
          <p className="mt-2 text-sm text-gray-500">
            Encerra a cobrança recorrente. Você pode assinar de novo quando quiser.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 text-red-700 hover:bg-red-50"
            onClick={() => setConfirming(true)}
          >
            Quero cancelar
          </Button>
        </>
      ) : (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            O acesso é bloqueado assim que o cancelamento for confirmado.
          </p>
          <p className="mt-1 text-sm text-red-700">
            Não há uso até o fim do período já pago: a conta fica limitada à
            própria tela de assinatura na mesma hora. Seus dados continuam
            guardados, e voltam a ficar acessíveis se você assinar de novo.
          </p>
          {error && <p className="mt-3 text-sm text-red-800">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="destructive" size="sm" onClick={cancel} disabled={loading}>
              {loading ? "Cancelando..." : "Confirmar cancelamento"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setConfirming(false);
                setError(null);
              }}
              disabled={loading}
            >
              Manter assinatura
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
