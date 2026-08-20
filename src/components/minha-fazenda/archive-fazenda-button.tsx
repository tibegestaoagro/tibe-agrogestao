"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

/**
 * Arquivar uma fazenda.
 *
 * Pedia confirmação pelo `confirm()` do sistema e depois engolia o erro: se a
 * chamada falhasse, a fazenda continuava ativa e nada era dito.
 */
export default function ArchiveFazendaButton({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const aviso = useAviso();

  async function archive() {
    const res = await apiPost(`/api/v1/properties/${propertyId}/archive`);
    if (res.ok) {
      aviso.sucesso("Fazenda arquivada.");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  return (
    <ConfirmDialog
      gatilho={
        <Button variant="ghost" size="sm">
          Arquivar fazenda
        </Button>
      }
      titulo="Arquivar esta fazenda?"
      descricao="Ela sai das listas ativas e deixa de aparecer nos formulários. Nada é apagado: rebanho, lançamentos e histórico continuam guardados."
      rotuloConfirmar="Arquivar fazenda"
      aoConfirmar={archive}
    />
  );
}
