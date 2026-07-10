"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

const ALL = "__all__";

export default function AlertFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.push(`/alertas?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select value={sp.get("type") ?? ALL} onValueChange={(v) => setParam("type", v)}>
        <SelectTrigger className="w-52"><SelectValue placeholder="Tipo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os tipos</SelectItem>
          <SelectItem value="vaccine_due">Vacina a vencer</SelectItem>
          <SelectItem value="harvest_near">Colheita próxima</SelectItem>
          <SelectItem value="bill_due">Conta a vencer</SelectItem>
          <SelectItem value="low_balance">Saldo negativo</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sp.get("status") ?? ALL} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          <SelectItem value="pending">Pendente</SelectItem>
          <SelectItem value="sent">Enviado</SelectItem>
          <SelectItem value="dismissed">Resolvido</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
