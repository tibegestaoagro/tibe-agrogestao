"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";
import type { ServiceJobStatus } from "@/generated/prisma/client";

/**
 * Começar e encerrar o serviço (§42).
 *
 * Só o status muda. NENHUM dinheiro é anunciado aqui: encerrar não quita
 * nada, e quem registra recebimento continua sendo só o `ServicePaymentForm`.
 * Um aviso de sucesso que dissesse "recebido" inventaria um pagamento que não
 * aconteceu.
 */
export default function ServiceStatusButtons({
  serviceJobId,
  status,
}: {
  serviceJobId: string;
  status: ServiceJobStatus;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState(false);

  const proximo =
    status === "agendado"
      ? { valor: "em_andamento" as const, rotulo: "Começar serviço" }
      : status === "em_andamento"
        ? { valor: "concluido" as const, rotulo: "Encerrar serviço" }
        : null;

  if (!proximo) return null;

  async function avancar() {
    setLoading(true);
    const res = await apiPatch(`/api/v1/service-jobs/${serviceJobId}/status`, {
      status: proximo!.valor,
    });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  return (
    <Button variant="outline" onClick={avancar} disabled={loading}>
      {loading ? "..." : proximo.rotulo}
    </Button>
  );
}
