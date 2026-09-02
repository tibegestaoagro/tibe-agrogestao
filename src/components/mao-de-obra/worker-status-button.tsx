"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiPatch } from "@/lib/client-api";

/**
 * Ativa ou inativa um trabalhador (§39).
 *
 * Inativar pede confirmação e ativar não, porque as consequências são
 * assimétricas: inativar APAGA a previsão de pagamento pendente, e a descrição
 * do diálogo diz isso com todas as letras. Sem esse aviso, o produtor que
 * inativasse por engano veria a conta a pagar do mês sumir do Financeiro sem
 * entender por quê.
 *
 * O histórico do que já foi pago nunca é tocado (§40.8).
 */
export default function WorkerStatusButton({
  workerId,
  status,
}: {
  workerId: string;
  status: string;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  async function definir(novo: "ativo" | "inativo") {
    setErro(null);
    const res = await apiPatch(`/api/v1/workers/${workerId}`, { status: novo });
    if (!res.ok) {
      setErro(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {status === "inativo" ? (
        <Button variant="outline" onClick={() => definir("ativo")}>
          Reativar
        </Button>
      ) : (
        <ConfirmDialog
          gatilho={<Button variant="outline">Inativar</Button>}
          titulo="Inativar este trabalhador?"
          descricao="A previsão de pagamento pendente é apagada, e ele deixa de gerar conta a pagar. Tudo que já foi pago continua no histórico e no Financeiro."
          rotuloConfirmar="Inativar"
          aoConfirmar={() => definir("inativo")}
        />
      )}
      {erro && <p className="text-sm text-perigo-tinta">{erro}</p>}
    </div>
  );
}
