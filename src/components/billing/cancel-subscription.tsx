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
 * dois passos, e o texto diz a consequência real antes de o botão vermelho
 * aparecer, não depois.
 *
 * Recebe `paidUntil` para dizer a DATA em que o acesso muda, em vez de
 * "até o fim do período pago": quem está decidindo se cancela precisa saber
 * o dia, não a regra.
 *
 * `archiveWindowDays` chega por prop, e não por import de
 * `ARCHIVE_WINDOW_DAYS`, porque `billing-access.ts` importa Prisma: trazê-lo
 * para um client component arrastaria módulos de Node para o bundle do
 * browser e quebraria o build (mesma armadilha já documentada no CLAUDE.md
 * para `@/lib/permissions` dentro do dashboard).
 */
export default function CancelSubscription({
  paidUntil,
  archiveWindowDays,
}: {
  paidUntil?: Date | null;
  archiveWindowDays: number;
}) {
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
    <div className="rounded-lg border border-borda bg-superficie p-5">
      <p className="text-sm font-medium text-texto-secundario">Cancelar assinatura</p>

      {!confirming ? (
        <>
          <p className="mt-2 text-sm text-texto-discreto">
            Encerra a cobrança recorrente. Você continua usando normalmente até o fim do
            período já pago. Pode assinar de novo quando quiser.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 text-perigo-tinta hover:bg-perigo-suave"
            onClick={() => setConfirming(true)}
          >
            Quero cancelar
          </Button>
        </>
      ) : (
        <div className="mt-3 rounded-md border border-perigo bg-perigo-suave p-4">
          <p className="text-sm font-medium text-perigo-tinta">
            {paidUntil
              ? `Você usa o sistema normalmente até ${paidUntil.toLocaleDateString("pt-BR")}.`
              : "Você usa o sistema normalmente até o fim do período já pago."}
          </p>
          <p className="mt-1 text-sm text-perigo-tinta">
            Depois dessa data, a conta fica em modo leitura por {archiveWindowDays} dias: dá
            para consultar e exportar tudo, mas não para lançar nada novo. Passado esse prazo, o
            acesso é bloqueado. Seus dados continuam guardados e voltam ao normal se você
            assinar de novo.
          </p>
          {error && <p className="mt-3 text-sm text-perigo-tinta">{error}</p>}
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
