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
import { apiPost, apiPatch } from "@/lib/client-api";

type Pasture = { id: string; name: string; area_hectares: number | null };

/**
 * Cadastro/edição de pasto (doc "Minha Fazenda" §4, Módulo 29). Mesmo padrão
 * de `FazendaForm`: um componente para criar (sem `pasture`) e editar (com
 * `pasture`).
 */
export default function PastureForm({
  propertyId,
  pasture,
  trigger,
}: {
  propertyId: string;
  pasture?: Pasture;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const editing = !!pasture;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(pasture?.name ?? "");
  const [area, setArea] = useState(pasture?.area_hectares?.toString() ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    const res = editing
      ? await apiPatch(`/api/v1/pastures/${pasture.id}`, {
          name,
          area_hectares: area ? Number(area) : undefined,
        })
      : await apiPost("/api/v1/pastures", {
          name,
          area_hectares: area ? Number(area) : undefined,
          property_id: propertyId,
        });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent title={editing ? "Editar pasto" : "Novo pasto"}>
        <SheetHeader>
          <SheetTitle>{editing ? "Editar pasto" : "Novo pasto"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="pasture-name">Nome do pasto</Label>
            <Input
              id="pasture-name"
              placeholder="Ex: Pasto da Sede"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pasture-area">Tamanho (hectares)</Label>
            <Input
              id="pasture-area"
              type="number"
              step="0.01"
              min="0"
              placeholder="Ex: 20"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button onClick={save} disabled={loading} className="w-full">
            {loading ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar pasto"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
