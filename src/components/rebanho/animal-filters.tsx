"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

type Property = { id: string; name: string };

const ALL = "__all__";

export default function AnimalFilters({
  properties,
  breeds,
}: {
  properties: Property[];
  breeds: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.push(`/rebanho?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Input
        placeholder="Buscar por brinco..."
        defaultValue={sp.get("q") ?? ""}
        onChange={(e) => setParam("q", e.target.value)}
        className="w-48"
      />
      <Select
        value={sp.get("property_id") ?? ALL}
        onValueChange={(v) => setParam("property_id", v)}
      >
        <SelectTrigger className="w-44">
          <SelectValue placeholder="Propriedade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as propriedades</SelectItem>
          {properties.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={sp.get("status") ?? ALL}
        onValueChange={(v) => setParam("status", v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos os status</SelectItem>
          <SelectItem value="active">Ativo</SelectItem>
          <SelectItem value="sold">Vendido</SelectItem>
          <SelectItem value="deceased">Morto</SelectItem>
        </SelectContent>
      </Select>
      {breeds.length > 0 && (
        <Select
          value={sp.get("breed") ?? ALL}
          onValueChange={(v) => setParam("breed", v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Raça" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as raças</SelectItem>
            {breeds.map((b) => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
