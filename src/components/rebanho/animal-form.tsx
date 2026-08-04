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

export default function AnimalForm({
  properties,
  categories,
}: {
  properties: Property[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [categoryId, setCategoryId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [earTag, setEarTag] = useState("");
  const [breed, setBreed] = useState("");
  const [sex, setSex] = useState<"male" | "female" | "">("");
  const [propertyId, setPropertyId] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [weight, setWeight] = useState("");

  function reset() {
    setCategoryId("");
    setQuantity("1");
    setEarTag("");
    setBreed("");
    setSex("");
    setPropertyId("");
    setBirthDate("");
    setWeight("");
    setError(null);
  }

  async function submit() {
    const qtd = Number(quantity);
    if (!categoryId || !propertyId || !Number.isInteger(qtd) || qtd <= 0) {
      setError("Preencha categoria, propriedade e uma quantidade inteira maior que zero.");
      return;
    }
    // Brinco identifica UMA cabeça: o back-end recusa brinco com quantidade
    // maior que 1, então o aviso aqui evita a viagem até o servidor.
    if (earTag && qtd !== 1) {
      setError("Brinco identifica uma cabeça: deixe a quantidade em 1 ou remova o brinco.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/animals", {
      category_id: categoryId,
      property_id: propertyId,
      quantity: qtd,
      ear_tag: earTag || null,
      breed: breed || null,
      sex: sex || null,
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
        <Button>Novo registro</Button>
      </SheetTrigger>
      <SheetContent title="Novo registro de rebanho">
        <SheetHeader>
          <SheetTitle>Novo registro de rebanho</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div>
            <Label>Categoria *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha a categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="quantity">Quantidade de cabeças *</Label>
            <Input
              id="quantity"
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="ear_tag">Brinco (opcional)</Label>
            <Input
              id="ear_tag"
              placeholder="só para quem trabalha com brinco"
              value={earTag}
              onChange={(e) => setEarTag(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Identifica uma cabeça: deixe a quantidade em 1 para usar o brinco.
            </p>
          </div>
          <div>
            <Label htmlFor="breed">Raça</Label>
            <Input id="breed" value={breed} onChange={(e) => setBreed(e.target.value)} />
          </div>
          <div>
            <Label>Sexo</Label>
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
