"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type Client = { id: string; name: string };
const ALL = "__all__";

export default function OrderFilters({ clients }: { clients: Client[] }) {
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", "ordens");
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.push(`/prestador?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select value={sp.get("status") ?? ALL} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Status" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          <SelectItem value="scheduled">Agendada</SelectItem>
          <SelectItem value="completed">Concluída</SelectItem>
          <SelectItem value="invoiced">Faturada</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={sp.get("service_client_id") ?? ALL}
        onValueChange={(v) => setParam("service_client_id", v)}
      >
        <SelectTrigger className="w-52"><SelectValue placeholder="Cliente" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os clientes</SelectItem>
          {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
