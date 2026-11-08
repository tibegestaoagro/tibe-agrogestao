"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiDelete, apiPost } from "@/lib/client-api";

const URL_DO_CARIMBO = "/api/v1/emporio/finance/statement/reconcile";

/**
 * Carimbar e retirar o carimbo de conciliação de uma linha do extrato da conta.
 * Sem formulário: a recusa (linha já carimbada, sem carimbo, fora de conta) vai
 * para o aviso.
 */
export function CarimboBotao({
  kind,
  id,
  carimbadoEm,
}: {
  kind: "movimento" | "cartao";
  id: string;
  /** "dd/mm" já formatado pelo servidor, ou null quando a linha não tem carimbo. */
  carimbadoEm: string | null;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [pending, setPending] = useState(false);
  const carimbado = carimbadoEm !== null;

  async function alternar() {
    setPending(true);
    const res = carimbado ? await apiDelete(URL_DO_CARIMBO, { kind, id }) : await apiPost(URL_DO_CARIMBO, { kind, id });
    setPending(false);
    if (res.ok) router.refresh();
    else aviso.erro(res.message);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {carimbado && <span className="text-xs text-texto-secundario">Carimbado em {carimbadoEm}</span>}
      <Button
        variant="outline"
        size="sm"
        onClick={alternar}
        disabled={pending}
        className="min-h-11 sm:min-h-0"
      >
        {pending ? "..." : carimbado ? "Retirar" : "Carimbar"}
      </Button>
    </div>
  );
}
