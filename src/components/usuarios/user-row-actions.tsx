"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

type Role = "OWNER" | "ADMIN" | "OPERADOR" | "VISUALIZADOR";
const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  OPERADOR: "Operador",
  VISUALIZADOR: "Visualizador",
};

export default function UserRowActions({
  userId,
  role,
  active,
  isSelf,
  canEdit,
}: {
  userId: string;
  role: Role;
  active: boolean;
  isSelf: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState(false);

  /**
   * As DUAS chamadas precisam do `else`, e este era o pior dos quatro casos
   * achados em 2026-08-28: mudar a permissão de alguém ou desativá-lo falhava
   * e a tela não dizia nada. O seletor voltava ao valor antigo sozinho, o que
   * lê como "não deixou" quando na verdade foi "não consegui te contar". A
   * rota recusa por limite de assento (`SEAT_LIMIT_REACHED`) e por regra de
   * quem pode promover a Owner, e as duas mensagens são úteis.
   */
  async function changeRole(newRole: string) {
    setLoading(true);
    const res = await apiPatch(`/api/v1/users/${userId}/role`, { role: newRole });
    setLoading(false);
    if (res.ok) router.refresh();
    else aviso.erro(res.message);
  }

  async function toggleActive() {
    setLoading(true);
    const res = await apiPatch(`/api/v1/users/${userId}/active`, { active: !active });
    setLoading(false);
    if (res.ok) router.refresh();
    else aviso.erro(res.message);
  }

  if (!canEdit || isSelf || role === "OWNER") {
    return <span className="text-xs text-texto-discreto">{ROLE_LABEL[role]}</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={role} onValueChange={changeRole}>
        <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(ROLE_LABEL) as Role[])
            .filter((r) => r !== "OWNER")
            .map((r) => (
              <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={toggleActive} disabled={loading}>
        {active ? "Desativar" : "Reativar"}
      </Button>
    </div>
  );
}
