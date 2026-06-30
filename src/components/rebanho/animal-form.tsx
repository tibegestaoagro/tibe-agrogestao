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

export default function AnimalForm({ properties }: { properties: Property[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [earTag, setEarTag] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [propertyId, setPropertyId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [weight, setWeight] = useState("");

  function reset() {
    setEarTag("");
    setBreed("");
    setSex("");
    setPropertyId("");
    setBirthDate("");
    setWeight("");
    setError(null);
  }

  async function submit() {
    if (!earTag || !breed || !sex || !propertyId) {
      setError("Preencha brinco, raça, sexo e propriedade.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/animals", {
      ear_tag: earTag,
      breed,
      sex,
      property_id: propertyId,
      birth_date: birthDate ? new Date(birthDate).toISOString() : null,
      initial_weight: weight ? Number(weight) : null,
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
        <Button>Novo animal</Button>
      </SheetTrigger>
      <SheetContent title="Novo animal">
        <SheetHeader>
          <SheetTitle>Novo animal</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="ear_tag">Brinco *</Label>
            <Input id="ear_tag" value={earTag} onChange={(e) => setEarTag(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="breed">Raça *</Label>
            <Input id="breed" value={breed} onChange={(e) => setBreed(e.target.value)} />
          </div>
          <div>
            <Label>Sexo *</Label>
            <Select value={sex} onValueChange={(v) => setSex(v as "male" | "female")}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Macho</SelectItem>
                <SelectItem value="female">Fêmea</SelectItem>
              </SelectContent>
            </Select>
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
            <Label htmlFor="birth">Data de nascimento</Label>
            <Input id="birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="weight">Peso inicial (kg)</Label>
            <Input id="weight" type="number" step="0.001" value={weight} onChange={(e) => setWeight(e.target.value)} />
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
