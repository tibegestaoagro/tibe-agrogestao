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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPost } from "@/lib/client-api";

type Property = { id: string; name: string };

export default function PlotForm({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [propertyId, setPropertyId] = useState("");

  async function submit() {
    if (!name || !area || !propertyId) {
      setError("Preencha nome, área e propriedade.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/plots", {
      name,
      area_hectares: Number(area),
      property_id: propertyId,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setName(""); setArea(""); setPropertyId("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>Novo talhão</Button>
      </SheetTrigger>
      <SheetContent title="Novo talhão">
        <SheetHeader><SheetTitle>Novo talhão</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="pn">Nome *</Label>
            <Input id="pn" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pa">Área (ha) *</Label>
            <Input id="pa" type="number" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} />
          </div>
          <div>
            <Label>Propriedade *</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Cadastrar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
