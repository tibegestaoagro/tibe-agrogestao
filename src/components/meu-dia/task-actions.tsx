"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

/**
 * Concluir ou cancelar uma tarefa do Meu Dia.
 *
 * Este era o exemplo mais claro da falha silenciosa: `await apiPatch(...)` sem
 * olhar o resultado, seguido de `router.refresh()`. O produtor toca em
 * "Concluir" com 4G ruim, o botão volta ao normal, a linha continua
 * "Pendente", e ele não sabe se salvou. Toca de novo.
 *
 * O rótulo de carregando também mudou: era literalmente `"..."`, que não diz
 * se está salvando ou se travou.
 */
export default function TaskActions({ taskId }: { taskId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState<"completed" | "cancelled" | null>(null);

  async function setStatus(status: "completed" | "cancelled") {
    setLoading(status);
    const res = await apiPatch(`/api/v1/tasks/${taskId}`, { status });
    setLoading(null);
    if (res.ok) {
      aviso.sucesso(status === "completed" ? "Tarefa concluída." : "Tarefa cancelada.");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={() => setStatus("completed")}
        disabled={loading !== null}
      >
        {loading === "completed" ? "Salvando..." : "Concluir"}
      </Button>
      <Button variant="ghost" onClick={() => setStatus("cancelled")} disabled={loading !== null}>
        {loading === "cancelled" ? "Cancelando..." : "Cancelar"}
      </Button>
    </div>
  );
}
