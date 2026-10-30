"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAviso } from "@/components/ui/toast";
import { apiDelete } from "@/lib/client-api";

/** Tira a pessoa do Empório. Ela continua na conta e na fazenda, com o mesmo papel de antes. */
export function EquipeTirarBotao({ userId, nome }: { userId: string; nome: string }) {
  const router = useRouter();
  const aviso = useAviso();

  async function tirar() {
    const res = await apiDelete(`/api/v1/emporio/team/${userId}`);
    if (!res.ok) {
      aviso.erro(res.message);
      return;
    }
    aviso.sucesso(`${nome} saiu do Empório.`);
    router.refresh();
  }

  return (
    <ConfirmDialog
      gatilho={
        <Button variant="outline" size="sm">
          Tirar do Empório
        </Button>
      }
      titulo={`Tirar ${nome} do Empório?`}
      descricao="Ela deixa de ver as lojas. Continua na conta e na fazenda, e você pode trazê-la de volta quando quiser."
      rotuloConfirmar="Tirar do Empório"
      aoConfirmar={tirar}
    />
  );
}
