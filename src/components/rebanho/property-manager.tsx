"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { apiPost } from "@/lib/client-api";

type Property = {
  id: string;
  name: string;
  area_hectares: number | null;
  archived: boolean;
};

export default function PropertyManager({
  properties,
  canWrite,
}: {
  properties: Property[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!name) return;
    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/properties", {
      name,
      area_hectares: area ? Number(area) : null,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setName("");
    setArea("");
    router.refresh();
  }

  async function archive(id: string) {
    await apiPost(`/api/v1/properties/${id}/archive`);
    router.refresh();
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Propriedades</Button>
      </SheetTrigger>
      <SheetContent title="Propriedades">
        <SheetHeader>
          <SheetTitle>Propriedades</SheetTitle>
        </SheetHeader>

        <ul className="space-y-2">
          {properties.length === 0 && (
            <li className="text-sm text-gray-500">Nenhuma propriedade.</li>
          )}
          {properties.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
            >
              <span className="text-sm">
                {p.name}
                {p.area_hectares != null && (
                  <span className="text-gray-500"> · {p.area_hectares} ha</span>
                )}
                {p.archived && (
                  <Badge variant="gray" className="ml-2">
                    Arquivada
                  </Badge>
                )}
              </span>
              {canWrite && !p.archived && (
                <Button variant="ghost" size="sm" onClick={() => archive(p.id)}>
                  Arquivar
                </Button>
              )}
            </li>
          ))}
        </ul>

        {canWrite && (
          <div className="mt-4 space-y-2 border-t pt-4">
            <Label htmlFor="prop-name">Nova propriedade</Label>
            <Input
              id="prop-name"
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Área (ha)"
              type="number"
              step="0.01"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
            {error && <p className="text-sm text-red-700">{error}</p>}
            <Button onClick={add} disabled={loading} className="w-full">
              {loading ? "Salvando..." : "Adicionar"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
