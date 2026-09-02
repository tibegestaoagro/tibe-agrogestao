"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiDelete } from "@/lib/client-api";
import { moeda } from "@/components/servicos/labels";

/**
 * Cancela um serviço.
 *
 * A descrição do diálogo diz as DUAS consequências, porque elas são opostas e
 * o produtor precisa das duas para decidir: a conta a pagar em aberto some, e
 * o que já foi pago fica. Sem isso, quem cancela achando que "desfaz tudo"
 * procuraria o estorno que não existe.
 */
export default function ServiceCancelButton({
  serviceJobId,
  pago,
  restante,
}: {
  serviceJobId: string;
  pago: number;
  restante: number;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar() {
    setErro(null);
    const res = await apiDelete(`/api/v1/service-jobs/${serviceJobId}`);
    if (!res.ok) {
      setErro(res.message);
      return;
    }
    router.refresh();
  }

  const consequencias =
    restante > 0 && pago > 0
      ? `A conta a pagar de ${moeda(restante)} some, e os ${moeda(pago)} já pagos continuam no Financeiro.`
      : restante > 0
        ? `A conta a pagar de ${moeda(restante)} some do Financeiro.`
        : "Nada muda no Financeiro: este serviço já está pago, e o dinheiro que saiu continua registrado.";

  return (
    <div className="flex flex-col items-start gap-1">
      <ConfirmDialog
        gatilho={<Button variant="outline">Cancelar serviço</Button>}
        titulo="Cancelar este serviço?"
        descricao={`${consequencias} O histórico do que foi feito fica registrado.`}
        rotuloConfirmar="Cancelar serviço"
        aoConfirmar={cancelar}
      />
      {erro && <p className="text-sm text-perigo-tinta">{erro}</p>}
    </div>
  );
}
