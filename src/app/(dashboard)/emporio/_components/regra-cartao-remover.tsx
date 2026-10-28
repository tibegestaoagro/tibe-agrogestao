"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAviso } from "@/components/ui/toast";
import { apiDelete } from "@/lib/client-api";

/** Remove a taxa de cartão da loja. Sem formulário: a recusa vai para o aviso. */
export function RegraCartaoRemover({ regraId, descricao }: { regraId: string; descricao: string }) {
  const router = useRouter();
  const aviso = useAviso();

  async function remover() {
    const res = await apiDelete(`/api/v1/emporio/card-fee-rules/${regraId}`);
    if (res.ok) {
      aviso.sucesso("Taxa removida.");
      router.refresh();
    } else aviso.erro(res.message);
  }

  return (
    <ConfirmDialog
      gatilho={
        <Button variant="outline" size="sm">
          Remover
        </Button>
      }
      titulo="Remover taxa de cartão"
      descricao={`${descricao}: sem a taxa, a loja não consegue vender nessa forma até cadastrar de novo. As vendas já feitas guardam a taxa que valia.`}
      rotuloConfirmar="Remover taxa"
      aoConfirmar={remover}
    />
  );
}
