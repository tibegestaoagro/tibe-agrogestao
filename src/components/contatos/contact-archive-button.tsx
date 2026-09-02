"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { apiPatch } from "@/lib/client-api";

/**
 * Arquiva ou desarquiva um contato.
 *
 * Arquivar pede confirmação e desarquivar não: o §5 do Módulo 31 não trata
 * disso, mas a assimetria é a consequência. Arquivar tira o contato das listas
 * E faz a conversa do WhatsApp parar de reaproveitá-lo, então um negócio novo
 * com "João" passa a criar um João novo. Desarquivar só desfaz isso.
 *
 * Não apaga: `Negotiation.contact_id` é `onDelete: SetNull`, e apagar deixaria
 * o histórico anônimo em silêncio.
 */
export default function ContactArchiveButton({
  contactId,
  arquivado,
}: {
  contactId: string;
  arquivado: boolean;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  async function definir(archived: boolean) {
    setErro(null);
    const res = await apiPatch(`/api/v1/contacts/${contactId}/archive`, { archived });
    if (!res.ok) {
      setErro(res.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {arquivado ? (
        <Button variant="outline" onClick={() => definir(false)}>
          Desarquivar
        </Button>
      ) : (
        <ConfirmDialog
          gatilho={<Button variant="outline">Arquivar</Button>}
          titulo="Arquivar este contato?"
          descricao="Ele sai das listas e das buscas. O histórico de negócios continua inteiro, e um negócio novo com o mesmo nome vai criar um contato novo."
          rotuloConfirmar="Arquivar"
          aoConfirmar={() => definir(true)}
        />
      )}
      {erro && <p className="text-sm text-perigo-tinta">{erro}</p>}
    </div>
  );
}
