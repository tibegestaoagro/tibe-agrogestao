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

export default function MachineForm({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [acquisitionCost, setAcquisitionCost] = useState("");
  const [hourMeter, setHourMeter] = useState("");

  function reset() {
    setName("");
    setType("");
    setBrand("");
    setModel("");
    setYear("");
    setPropertyId("");
    setAcquisitionCost("");
    setHourMeter("");
    setError(null);
  }

  async function submit() {
    if (!name || !type || !propertyId) {
      setError("Preencha nome, tipo e propriedade.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/machines", {
      name,
      type,
      brand: brand || null,
      model: model || null,
      year: year ? Number(year) : null,
      property_id: propertyId,
      acquisition_cost: acquisitionCost ? Number(acquisitionCost) : null,
      hour_meter: hourMeter ? Number(hourMeter) : null,
    });
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    reset();
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>Nova máquina</Button>
      </SheetTrigger>
      <SheetContent title="Nova máquina">
        <SheetHeader>
          <SheetTitle>Nova máquina</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="type">Tipo *</Label>
            <Input
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder="Ex: trator, colheitadeira, pulverizador"
            />
          </div>
          <div>
            <Label>Propriedade *</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="brand">Marca</Label>
            <Input id="brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="model">Modelo</Label>
            <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="year">Ano</Label>
            <Input id="year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="hour_meter">Horímetro (h)</Label>
            <Input
              id="hour_meter"
              type="number"
              step="0.1"
              value={hourMeter}
              onChange={(e) => setHourMeter(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="cost">Custo de aquisição (R$)</Label>
            <Input
              id="cost"
              type="number"
              step="0.01"
              value={acquisitionCost}
              onChange={(e) => setAcquisitionCost(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Preenchido, gera uma despesa automática vinculada à máquina.
            </p>
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
