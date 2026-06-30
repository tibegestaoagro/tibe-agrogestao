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

type Vaccine = { id: string; name: string };
type Property = { id: string; name: string };

export default function AnimalActions({
  animalId,
  vaccines,
  properties,
}: {
  animalId: string;
  vaccines: Vaccine[];
  properties: Property[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <WeightSheet animalId={animalId} />
      <VaccinationSheet animalId={animalId} vaccines={vaccines} />
      <MovementSheet animalId={animalId} properties={properties} />
    </div>
  );
}

function useSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { router, open, setOpen, loading, setLoading, error, setError };
}

function WeightSheet({ animalId }: { animalId: string }) {
  const s = useSheet();
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState("");

  async function submit() {
    if (!weight) return s.setError("Informe o peso.");
    s.setLoading(true);
    s.setError(null);
    const res = await apiPost(`/api/v1/animals/${animalId}/weight-logs`, {
      weight: Number(weight),
      measured_at: date ? new Date(date).toISOString() : null,
    });
    s.setLoading(false);
    if (!res.ok) return s.setError(res.message);
    setWeight("");
    setDate("");
    s.setOpen(false);
    s.router.refresh();
  }

  return (
    <Sheet open={s.open} onOpenChange={s.setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">Registrar pesagem</Button>
      </SheetTrigger>
      <SheetContent title="Registrar pesagem">
        <SheetHeader><SheetTitle>Registrar pesagem</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="w">Peso (kg) *</Label>
            <Input id="w" type="number" step="0.001" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="wd">Data</Label>
            <Input id="wd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {s.error && <p className="text-sm text-red-700">{s.error}</p>}
          <Button onClick={submit} disabled={s.loading} className="w-full">
            {s.loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function VaccinationSheet({ animalId, vaccines }: { animalId: string; vaccines: Vaccine[] }) {
  const s = useSheet();
  const [vaccineId, setVaccineId] = useState("");
  const [date, setDate] = useState("");
  const [cost, setCost] = useState("");

  async function submit() {
    if (!vaccineId) return s.setError("Selecione a vacina.");
    s.setLoading(true);
    s.setError(null);
    const res = await apiPost(`/api/v1/animals/${animalId}/vaccinations`, {
      vaccine_id: vaccineId,
      applied_at: date ? new Date(date).toISOString() : null,
      cost: cost ? Number(cost) : null,
    });
    s.setLoading(false);
    if (!res.ok) return s.setError(res.message);
    setVaccineId(""); setDate(""); setCost("");
    s.setOpen(false);
    s.router.refresh();
  }

  return (
    <Sheet open={s.open} onOpenChange={s.setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">Registrar vacinação</Button>
      </SheetTrigger>
      <SheetContent title="Registrar vacinação">
        <SheetHeader><SheetTitle>Registrar vacinação</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div>
            <Label>Vacina *</Label>
            <Select value={vaccineId} onValueChange={setVaccineId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {vaccines.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="vd">Data de aplicação</Label>
            <Input id="vd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="vc">Custo (R$)</Label>
            <Input id="vc" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          {s.error && <p className="text-sm text-red-700">{s.error}</p>}
          <Button onClick={submit} disabled={s.loading} className="w-full">
            {s.loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MovementSheet({ animalId, properties }: { animalId: string; properties: Property[] }) {
  const s = useSheet();
  const [type, setType] = useState<"purchase" | "sale" | "transfer" | "death" | "">("");
  const [value, setValue] = useState("");
  const [toProperty, setToProperty] = useState("");
  const [date, setDate] = useState("");

  async function submit() {
    if (!type) return s.setError("Selecione o tipo.");
    if (type === "transfer" && !toProperty)
      return s.setError("Selecione a propriedade de destino.");
    s.setLoading(true);
    s.setError(null);
    const res = await apiPost(`/api/v1/animals/${animalId}/movements`, {
      movement_type: type,
      value: value ? Number(value) : null,
      to_property_id: type === "transfer" ? toProperty : null,
      occurred_at: date ? new Date(date).toISOString() : null,
    });
    s.setLoading(false);
    if (!res.ok) return s.setError(res.message);
    setType(""); setValue(""); setToProperty(""); setDate("");
    s.setOpen(false);
    s.router.refresh();
  }

  return (
    <Sheet open={s.open} onOpenChange={s.setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">Registrar movimentação</Button>
      </SheetTrigger>
      <SheetContent title="Registrar movimentação">
        <SheetHeader><SheetTitle>Registrar movimentação</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo *</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="purchase">Compra</SelectItem>
                <SelectItem value="sale">Venda</SelectItem>
                <SelectItem value="transfer">Transferência</SelectItem>
                <SelectItem value="death">Morte</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {(type === "purchase" || type === "sale") && (
            <div>
              <Label htmlFor="mv">Valor (R$)</Label>
              <Input id="mv" type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
              <p className="mt-1 text-xs text-gray-500">
                Gera lançamento financeiro automático ({type === "sale" ? "receita" : "despesa"}).
              </p>
            </div>
          )}
          {type === "transfer" && (
            <div>
              <Label>Propriedade de destino *</Label>
              <Select value={toProperty} onValueChange={setToProperty}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="md">Data</Label>
            <Input id="md" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          {s.error && <p className="text-sm text-red-700">{s.error}</p>}
          <Button onClick={submit} disabled={s.loading} className="w-full">
            {s.loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
