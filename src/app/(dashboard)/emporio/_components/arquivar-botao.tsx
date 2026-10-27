"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

/**
 * Arquivar e desarquivar sem formulário: estabelecimento, produto e
 * apresentação usam a mesma rota `POST .../archive { archived }`. A recusa vai
 * para o aviso, porque não há campo onde ela caiba.
 */
export function ArquivarBotao({
  url,
  arquivado,
  rotulo = "Arquivar",
}: {
  url: string;
  arquivado: boolean;
  rotulo?: string;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [pending, setPending] = useState(false);

  async function alternar() {
    setPending(true);
    const res = await apiPost(url, { archived: !arquivado });
    setPending(false);
    if (res.ok) router.refresh();
    else aviso.erro(res.message);
  }

  return (
    <Button variant="outline" size="sm" onClick={alternar} disabled={pending}>
      {pending ? "..." : arquivado ? "Desarquivar" : rotulo}
    </Button>
  );
}
