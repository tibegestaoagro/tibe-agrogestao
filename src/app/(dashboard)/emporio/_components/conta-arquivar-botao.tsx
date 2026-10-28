"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

/** Arquiva ou reativa a conta: sem formulário, a recusa vai para o aviso. */
export function ContaArquivarBotao({ contaId, arquivada }: { contaId: string; arquivada: boolean }) {
  const router = useRouter();
  const aviso = useAviso();
  const [pending, setPending] = useState(false);

  async function alternar() {
    setPending(true);
    const res = await apiPatch(`/api/v1/emporio/bank-accounts/${contaId}`, { archived: !arquivada });
    setPending(false);
    if (res.ok) {
      aviso.sucesso(arquivada ? "Conta reativada." : "Conta arquivada.");
      router.refresh();
    } else aviso.erro(res.message);
  }

  return (
    <Button variant="outline" size="sm" onClick={alternar} disabled={pending}>
      {pending ? "..." : arquivada ? "Reativar" : "Arquivar"}
    </Button>
  );
}
