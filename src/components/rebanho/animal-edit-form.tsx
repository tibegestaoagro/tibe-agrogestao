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
import { apiPatch } from "@/lib/client-api";

type Property = { id: string; name: string };

export default function AnimalEditForm({
  animal,
  properties,
}: {
  animal: {
    id: string;
    ear_tag: string;
    breed: string | null;
    sex: "male" | "female";
    property_id: string;
    birth_date: string | null; // ISO ou null
  };
  properties: Property[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [earTag, setEarTag] = useState(animal.ear_tag);
  const [breed, setBreed] = useState(animal.breed ?? "");
  const [sex, setSex] = useState<"male" | "female">(animal.sex);
  const [propertyId, setPropertyId] = useState(animal.property_id);
  const [birthDate, setBirthDate] = useState(
    animal.birth_date ? animal.birth_date.slice(0, 10) : "",
  );

  async function submit() {
    if (!earTag || !breed) {
      setError("Brinco e raça são obrigatórios.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiPatch(`/api/v1/animals/${animal.id}`, {
      ear_tag: earTag,
      breed,
      sex,
      property_id: propertyId,
      birth_date: birthDate ? new Date(birthDate).toISOString() : null,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">Editar</Button>
      </SheetTrigger>
      <SheetContent title="Editar animal">
        <SheetHeader>
          <SheetTitle>Editar animal</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="e-ear">Brinco *</Label>
            <Input id="e-ear" value={earTag} onChange={(e) => setEarTag(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="e-breed">Raça *</Label>
            <Input id="e-breed" value={breed} onChange={(e) => setBreed(e.target.value)} />
          </div>
          <div>
            <Label>Sexo *</Label>
            <Select value={sex} onValueChange={(v) => setSex(v as "male" | "female")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Macho</SelectItem>
                <SelectItem value="female">Fêmea</SelectItem>
              </SelectContent>
            </Select>
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
          <div>
            <Label htmlFor="e-birth">Data de nascimento</Label>
            <Input id="e-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
