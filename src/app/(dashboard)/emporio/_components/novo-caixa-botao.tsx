"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

/** Cria o próximo caixa da loja (o número é o maior mais um). Sem formulário: a recusa vai para o aviso. */
export function NovoCaixaBotao({ lojaId, lojaNome }: { lojaId: string; lojaNome: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [pending, setPending] = useState(false);

  async function criar() {
    setPending(true);
    const res = await apiPost<{ nome: string }>("/api/v1/emporio/cash/registers", { establishment_id: lojaId });
    setPending(false);
    if (res.ok) {
      aviso.sucesso(`${res.data.nome} criado na ${lojaNome}.`);
      router.refresh();
    } else aviso.erro(res.message);
  }

  return (
    <Button variant="outline" size="sm" onClick={criar} disabled={pending}>
      {pending ? "..." : "Novo caixa"}
    </Button>
  );
}
