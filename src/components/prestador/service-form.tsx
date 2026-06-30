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
import { apiPost, apiPatch } from "@/lib/client-api";

type Pricing = "hour" | "day" | "fixed";
type Service = { id: string; name: string; pricing_type: Pricing; unit_price: number | null };

export default function ServiceForm({ service }: { service?: Service }) {
  const router = useRouter();
  const editing = !!service;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(service?.name ?? "");
  const [pricing, setPricing] = useState<Pricing | "">(service?.pricing_type ?? "");
  const [price, setPrice] = useState(service?.unit_price != null ? String(service.unit_price) : "");

  async function submit() {
    if (!name || !pricing || !price) return setError("Preencha nome, tipo e valor.");
    setLoading(true);
    setError(null);
    const payload = { name, pricing_type: pricing, unit_price: Number(price) };
    const res = editing
      ? await apiPatch(`/api/v1/services/${service!.id}`, payload)
      : await apiPost("/api/v1/services", payload);
    setLoading(false);
    if (!res.ok) return setError(res.message);
    if (!editing) {
      setName(""); setPricing(""); setPrice("");
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {editing ? (
          <Button variant="ghost" size="sm">Editar</Button>
        ) : (
          <Button>Novo serviço</Button>
        )}
      </SheetTrigger>
      <SheetContent title={editing ? "Editar serviço" : "Novo serviço"}>
        <SheetHeader>
          <SheetTitle>{editing ? "Editar serviço" : "Novo serviço"}</SheetTitle>
        </SheetHeader>
        <div className="space-y-3">
          <div><Label htmlFor="s-name">Nome *</Label><Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Precificação *</Label>
            <Select value={pricing} onValueChange={(v) => setPricing(v as Pricing)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hour">Por hora</SelectItem>
                <SelectItem value="day">Por dia</SelectItem>
                <SelectItem value="fixed">Valor fixo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label htmlFor="s-price">Valor unitário (R$) *</Label><Input id="s-price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          {editing && (
            <p className="text-xs text-gray-500">
              Alterar o valor não afeta ordens já registradas, apenas novas.
            </p>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : editing ? "Salvar" : "Cadastrar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
