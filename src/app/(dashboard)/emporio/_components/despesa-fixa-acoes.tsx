"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAviso } from "@/components/ui/toast";
import { apiPost } from "@/lib/client-api";

/**
 * Encerrar e renovar a despesa fixa: sem formulário, então a recusa vai para o
 * aviso. Cada função trata o retorno da sua própria chamada.
 */
export function DespesaFixaAcoes({
  despesaId,
  nome,
  podeRenovar,
}: {
  despesaId: string;
  nome: string;
  /** `needs_renewal` da despesa: faltam menos de 3 meses gerados. */
  podeRenovar: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [renovando, setRenovando] = useState(false);

  async function renovar() {
    setRenovando(true);
    const res = await apiPost<{ created: number }>(`/api/v1/emporio/fixed-expenses/${despesaId}/renew`);
    setRenovando(false);
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    const n = res.data?.created ?? 0;
    aviso.sucesso(n === 1 ? "Despesa renovada: 1 conta gerada." : `Despesa renovada: ${n} contas geradas.`);
    router.refresh();
  }

  async function encerrar() {
    const res = await apiPost(`/api/v1/emporio/fixed-expenses/${despesaId}/end`);
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    aviso.sucesso("Despesa encerrada.");
    router.refresh();
  }

  return (
    <>
      {podeRenovar && (
        <Button variant="outline" size="sm" onClick={renovar} disabled={renovando}>
          {renovando ? "..." : "Renovar"}
        </Button>
      )}
      <ConfirmDialog
        gatilho={
          <Button variant="outline" size="sm">
            Encerrar
          </Button>
        }
        titulo={`Encerrar "${nome}"?`}
        descricao="As contas dos meses seguintes que ainda não foram pagas são canceladas, e a despesa não gera mais contas. O mês atual e o que já foi pago ficam."
        rotuloConfirmar="Encerrar despesa"
        aoConfirmar={encerrar}
      />
    </>
  );
}
