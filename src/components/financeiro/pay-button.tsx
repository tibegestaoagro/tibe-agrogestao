"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

/**
 * Marcar uma conta como paga.
 *
 * Antes de 2026-08-20 este botão tinha `if (res.ok) router.refresh()` e nenhum
 * `else`: quando a chamada falhava, o botão voltava ao normal, a linha
 * continuava "Pendente", e nada era dito. No sinal ruim do curral isso vira
 * toque repetido, que é o pior comportamento possível num botão que mexe em
 * dinheiro.
 */
export default function PayButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState(false);

  async function markPaid() {
    setLoading(true);
    // Corpo explícito {}: a rota exige JSON válido mesmo sem campos obrigatórios.
    const res = await apiPatch(`/api/v1/financial-entries/${entryId}/pay`, {});
    setLoading(false);
    if (res.ok) {
      aviso.sucesso("Conta marcada como paga.");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={markPaid} disabled={loading}>
      {loading ? "Salvando..." : "Marcar como pago"}
    </Button>
  );
}
