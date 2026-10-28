"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

/** Arquiva a regra: as vendas novas deixam de usá-la, as já feitas guardam a regra que valia. */
export function RegraVariavelArquivar({ regraId, nome }: { regraId: string; nome: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [pending, setPending] = useState(false);

  async function arquivar() {
    setPending(true);
    const res = await apiPatch(`/api/v1/emporio/variable-expense-rules/${regraId}`, { archived: true });
    setPending(false);
    if (res.ok) {
      aviso.sucesso("Regra arquivada.");
      router.refresh();
    } else aviso.erro(res.message);
  }

  return (
    <ConfirmDialog
      gatilho={
        <Button variant="outline" size="sm" disabled={pending}>
          Arquivar
        </Button>
      }
      titulo={`Arquivar a regra "${nome}"?`}
      descricao="As vendas novas deixam de usar a regra. As vendas já feitas e as contas a pagar delas continuam como estão."
      rotuloConfirmar="Arquivar regra"
      destrutivo={false}
      aoConfirmar={arquivar}
    />
  );
}
