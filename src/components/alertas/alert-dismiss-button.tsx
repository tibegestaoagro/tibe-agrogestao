"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

export default function AlertDismissButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState(false);

  async function dismiss() {
    setLoading(true);
    const res = await apiPatch(`/api/v1/alerts/${alertId}/dismiss`);
    setLoading(false);
    // Sem o `else`, a recusa do servidor deixava o botão voltar ao normal e o
    // alerta continuar na lista, sem dizer nada. Mesmo defeito que o
    // `pay-button` teve até 2026-08-20.
    if (res.ok) router.refresh();
    else aviso.erro(res.message);
  }

  return (
    <Button variant="outline" size="sm" onClick={dismiss} disabled={loading}>
      {loading ? "..." : "Marcar como resolvido"}
    </Button>
  );
}
