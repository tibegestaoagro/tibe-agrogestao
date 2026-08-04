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

type Fazenda = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  district: string | null;
  area_hectares: number | null;
};

/**
 * Cadastro/edição da fazenda (doc "Minha Fazenda" §3, Módulo 29). Um único
 * componente para os dois modos: "criar" (sem `fazenda`) reusa a mesma
 * validação de "editar" (com `fazenda`), evitando duas cópias do formulário.
 */
export default function FazendaForm({
  fazenda,
  trigger,
}: {
  fazenda?: Fazenda;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const editing = !!fazenda;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(fazenda?.name ?? "");
  const [area, setArea] = useState(fazenda?.area_hectares?.toString() ?? "");
  const [city, setCity] = useState(fazenda?.city ?? "");
  const [district, setDistrict] = useState(fazenda?.district ?? "");
  const [address, setAddress] = useState(fazenda?.address ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setLoading(true);
    setError(null);
    const payload = {
      name,
      city,
      district: district || null,
      address: address || null,
      area_hectares: area ? Number(area) : undefined,
    };
    const res = editing
      ? await apiPatch(`/api/v1/properties/${fazenda.id}`, payload)
      : await apiPost("/api/v1/properties", payload);
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent title={editing ? "Editar fazenda" : "Nova fazenda"}>
        <SheetHeader>
          <SheetTitle>{editing ? "Editar fazenda" : "Nova fazenda"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="fazenda-name">Nome da fazenda</Label>
            <Input
              id="fazenda-name"
              placeholder="Ex: Fazenda Santa Helena"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fazenda-area">Tamanho total (hectares)</Label>
            <Input
              id="fazenda-area"
              type="number"
              step="0.01"
              min="0"
              placeholder="Ex: 120"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fazenda-city">Município</Label>
            <Input
              id="fazenda-city"
              placeholder="Ex: Montes Claros"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fazenda-district">Distrito (opcional)</Label>
            <Input
              id="fazenda-district"
              placeholder="Ex: São João da Vereda"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="fazenda-address">Endereço (opcional)</Label>
            <Input
              id="fazenda-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button onClick={save} disabled={loading} className="w-full">
            {loading ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar fazenda"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
