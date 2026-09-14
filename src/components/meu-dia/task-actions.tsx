"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPatch, apiPost } from "@/lib/client-api";

/**
 * Concluir, adiar ou cancelar uma tarefa do Meu Dia.
 *
 * Este era o exemplo mais claro da falha silenciosa: `await apiPatch(...)` sem
 * olhar o resultado, seguido de `router.refresh()`. O produtor toca em
 * "Concluir" com 4G ruim, o botão volta ao normal, a linha continua
 * "Pendente", e ele não sabe se salvou. Toca de novo.
 *
 * Módulo 38, §26: "não consegui arrumar a cerca hoje, coloca para amanhã". O
 * adiar desta linha é sempre para AMANHÃ, que é o caso do exemplo e o gesto de
 * um toque. Outra data é edição, e fica no formulário.
 */

type Acao = "completed" | "cancelled" | "postpone";

/** Amanhã, ao meio-dia UTC: a mesma convenção de data de calendário do formulário. */
function amanha(): string {
  const agora = new Date();
  const hojeEmSaoPaulo = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const base = new Date(`${hojeEmSaoPaulo}T12:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString();
}

export default function TaskActions({
  taskId,
  temData = true,
  recorrente = false,
}: {
  taskId: string;
  /** Tarefa sem data não se adia: não há dia de onde partir. */
  temData?: boolean;
  recorrente?: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState<Acao | null>(null);

  async function executar(acao: Acao) {
    setLoading(acao);
    const res =
      acao === "postpone"
        ? await apiPost(`/api/v1/tasks/${taskId}/postpone`, { due_date: amanha() })
        : await apiPatch<{ next_task_id: string | null }>(`/api/v1/tasks/${taskId}`, { status: acao });
    setLoading(null);

    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }

    if (acao === "postpone") aviso.sucesso("Tarefa passada para amanhã.");
    else if (acao === "cancelled") aviso.sucesso("Tarefa cancelada.");
    /* Na recorrente, dizer que a próxima já nasceu evita o produtor achar que
       "toda segunda" parou de repetir quando a linha some da tela. */
    else aviso.sucesso(recorrente ? "Feito. A próxima já está na lista." : "Tarefa concluída.");

    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => executar("completed")} disabled={loading !== null}>
        {loading === "completed" ? "Salvando..." : "Feito"}
      </Button>
      {temData && (
        <Button variant="ghost" onClick={() => executar("postpone")} disabled={loading !== null}>
          {loading === "postpone" ? "Adiando..." : "Amanhã"}
        </Button>
      )}
      <Button variant="ghost" onClick={() => executar("cancelled")} disabled={loading !== null}>
        {loading === "cancelled" ? "Cancelando..." : "Cancelar"}
      </Button>
    </div>
  );
}
