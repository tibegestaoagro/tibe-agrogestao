"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

/** Arquivar e desarquivar o franqueado: ação sem formulário, a recusa vai para o aviso. */
export function FranqueadoArquivarBotao({ id, arquivado }: { id: string; arquivado: boolean }) {
  const router = useRouter();
  const aviso = useAviso();
  const [pending, setPending] = useState(false);

  async function alternar() {
    setPending(true);
    const res = await apiPost(`/api/v1/emporio/franchisees/${id}/archive`, { archived: !arquivado });
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
