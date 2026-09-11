"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

/**
 * §13 do Módulo 36: manda para a Lista de Compra o produto que está acabando.
 *
 * Só aparece no alerta `low_stock`, e só para quem pode escrever. O sistema
 * nunca adiciona sozinho: este botão É a confirmação que o documento exige.
 *
 * Quando o produto já está na lista, o servidor recusa com `ITEM_JA_NA_LISTA`
 * e a pergunta vai para o produtor, que confirma e a chamada se repete
 * dizendo que pode duplicar.
 */
export default function AlertToShoppingButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState(false);

  async function adicionar(permitirDuplicata: boolean) {
    setLoading(true);
    const res = await apiPost(`/api/v1/alerts/${alertId}/shopping-item`, {
      permitir_duplicata: permitirDuplicata,
    });
    setLoading(false);

    if (res.ok) {
      aviso.sucesso("Adicionado à sua Lista de Compra.");
      router.refresh();
      return;
    }

    if (res.code === "ITEM_JA_NA_LISTA" && !permitirDuplicata) {
      // A pergunta do §19.7, feita ao produtor em vez de decidida por nós.
      if (window.confirm(`${res.message}`)) await adicionar(true);
      return;
    }

    aviso.erro(res.message);
  }

  return (
    <Button variant="outline" size="sm" onClick={() => adicionar(false)} disabled={loading}>
      {loading ? "..." : "Add à lista de compra"}
    </Button>
  );
}
