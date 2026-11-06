"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAviso } from "@/components/ui/toast";
import { apiDelete } from "@/lib/client-api";

/**
 * Tira a pessoa da equipe (Q190): ela fica DESATIVADA, com função, lojas e
 * chaves guardadas. Não vira usuária do Tibé; o Reativar a devolve como estava.
 */
export function EquipeTirarBotao({ userId, nome }: { userId: string; nome: string }) {
  const router = useRouter();
  const aviso = useAviso();

  async function tirar() {
    const res = await apiDelete(`/api/v1/emporio/team/${userId}`);
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    aviso.sucesso(`Pessoa desativada: ${nome}.`);
    router.refresh();
  }

  return (
    <ConfirmDialog
      gatilho={
        <Button variant="outline" size="sm">
          Desativar
        </Button>
      }
      titulo={`Desativar ${nome}?`}
      descricao="A pessoa sai da equipe e deixa de entrar no Tibé. A função, as lojas e as chaves ficam guardadas: em Desativados, Reativar a devolve como estava."
      rotuloConfirmar="Desativar"
      aoConfirmar={tirar}
    />
  );
}
