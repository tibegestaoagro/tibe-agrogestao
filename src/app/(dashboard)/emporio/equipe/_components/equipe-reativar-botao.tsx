"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

/**
 * Reativar (Q190): devolve à equipe quem foi desativado, como estava. A recusa
 * do servidor (equipe cheia, por exemplo) aparece no aviso, nunca some.
 */
export function EquipeReativarBotao({ userId, nome }: { userId: string; nome: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState(false);

  async function reativar() {
    setLoading(true);
    const res = await apiPost(`/api/v1/emporio/team/${userId}/reactivate`);
    setLoading(false);
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    aviso.sucesso(`${nome} voltou para a equipe.`);
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={reativar} disabled={loading}>
      {loading ? "Reativando..." : "Reativar"}
    </Button>
  );
}
