"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

/**
 * Cancelar um lançamento.
 *
 * Duas correções de 2026-08-20: a falha era silenciosa (`if (res.ok)` sem
 * `else`), e a confirmação era o `window.confirm()` do sistema, que perguntava
 * "Cancelar este lançamento?" sem dizer o que isso faz com o total do mês.
 */
export default function CancelButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState(false);

  async function cancel() {
    setLoading(true);
    const res = await apiPatch(`/api/v1/financial-entries/${entryId}/cancel`, {});
    setLoading(false);
    if (res.ok) {
      aviso.sucesso("Lançamento cancelado.");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  return (
    <ConfirmDialog
      gatilho={
        <Button variant="ghost" size="sm" disabled={loading}>
          {loading ? "Cancelando..." : "Cancelar"}
        </Button>
      }
      titulo="Cancelar este lançamento?"
      descricao="Ele deixa de contar no resultado do mês e nos relatórios. O registro continua no histórico, marcado como cancelado."
      rotuloConfirmar="Cancelar lançamento"
      aoConfirmar={cancel}
    />
  );
}
