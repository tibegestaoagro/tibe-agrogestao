"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAviso } from "@/components/ui/toast";
import { apiDelete } from "@/lib/client-api";

/** Apaga o PIN de autorização de quem esqueceu ou saiu: a pessoa cadastra outro em Minha senha. */
export function EquipeApagarPinBotao({ userId, nome }: { userId: string; nome: string }) {
  const router = useRouter();
  const aviso = useAviso();

  async function apagar() {
    const res = await apiDelete(`/api/v1/emporio/team/${userId}/pin`);
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    aviso.sucesso(`PIN apagado: ${nome}.`);
    router.refresh();
  }

  return (
    <ConfirmDialog
      gatilho={
        <Button variant="outline" size="sm">
          Apagar PIN
        </Button>
      }
      titulo={`Apagar o PIN de ${nome}?`}
      descricao="Sem o PIN, a pessoa não autoriza desconto acima do limite até cadastrar outro em Minha senha."
      rotuloConfirmar="Apagar PIN"
      aoConfirmar={apagar}
    />
  );
}
