"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

/** Arquivar e desarquivar o cliente: ação sem formulário, a recusa vai para o aviso. */
export function ClienteArquivarBotao({ id, arquivado }: { id: string; arquivado: boolean }) {
  const router = useRouter();
  const aviso = useAviso();
  const [pending, setPending] = useState(false);

  async function alternar() {
    setPending(true);
    const res = await apiPatch(`/api/v1/emporio/customers/${id}/archive`, { archived: !arquivado });
    setPending(false);
    if (res.ok) router.refresh();
    else aviso.erro(res.message);
  }

  return (
    <Button variant="outline" size="sm" onClick={alternar} disabled={pending}>
      {pending ? "..." : arquivado ? "Desarquivar" : "Arquivar"}
    </Button>
  );
}
