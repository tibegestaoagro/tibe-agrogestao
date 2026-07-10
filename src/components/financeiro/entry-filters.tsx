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

export default function EntryFilters() {
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.push(`/financeiro?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select value={sp.get("entry_type") ?? ALL} onValueChange={(v) => setParam("entry_type", v)}>
        <SelectTrigger className="w-36"><SelectValue placeholder="Tipo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          <SelectItem value="income">Receita</SelectItem>
          <SelectItem value="expense">Despesa</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sp.get("related_module") ?? ALL} onValueChange={(v) => setParam("related_module", v)}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Módulo" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os módulos</SelectItem>
          <SelectItem value="rebanho">Rebanho</SelectItem>
          <SelectItem value="lavoura">Lavoura</SelectItem>
          <SelectItem value="servico">Prestador</SelectItem>
          <SelectItem value="geral">Geral</SelectItem>
        </SelectContent>
      </Select>
      <Select value={sp.get("status") ?? ALL} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          <SelectItem value="pending">Pendente</SelectItem>
          <SelectItem value="paid">Pago</SelectItem>
          <SelectItem value="overdue">Vencido</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
