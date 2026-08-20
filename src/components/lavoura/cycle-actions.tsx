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
import { MoneyInput, lerValorDoCampo } from "@/components/ui/money-input";
import { Label } from "@/components/ui/label";
import { apiPost, apiPatch } from "@/lib/client-api";

/** Ações do talhão: novo ciclo (se não há ativo), e do ciclo ativo: insumo + colheita. */
export default function CycleActions({
  plotId,
  activeCycleId,
}: {
  plotId: string;
  activeCycleId: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {!activeCycleId && <NewCycleSheet plotId={plotId} />}
      {activeCycleId && (
        <>
          <InputSheet cycleId={activeCycleId} />
          <HarvestSheet cycleId={activeCycleId} />
        </>
      )}
    </div>
  );
}

function NewCycleSheet({ plotId }: { plotId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crop, setCrop] = useState("");
  const [planted, setPlanted] = useState("");
  const [expected, setExpected] = useState("");

  async function submit() {
    if (!crop) return setError("Informe a cultura.");
    setLoading(true); setError(null);
    const res = await apiPost(`/api/v1/plots/${plotId}/cycles`, {
      crop_name: crop,
      planted_at: planted ? new Date(planted).toISOString() : null,
      expected_harvest_at: expected ? new Date(expected).toISOString() : null,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setCrop(""); setPlanted(""); setExpected("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button>Iniciar ciclo</Button></SheetTrigger>
      <SheetContent title="Iniciar ciclo">
        <SheetHeader><SheetTitle>Iniciar ciclo</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="crop">Cultura *</Label>
            <Input id="crop" value={crop} onChange={(e) => setCrop(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pl">Data de plantio</Label>
            <Input id="pl" type="date" value={planted} onChange={(e) => setPlanted(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ex">Colheita prevista</Label>
            <Input id="ex" type="date" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Iniciar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InputSheet({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"fertilizer" | "pesticide" | "seed" | "">("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [cost, setCost] = useState("");

  async function submit() {
    if (!type || !name) return setError("Informe tipo e nome do insumo.");
    setLoading(true); setError(null);
    const res = await apiPost(`/api/v1/cycles/${cycleId}/inputs`, {
      input_type: type,
      name,
      quantity: lerValorDoCampo(quantity),
      unit: unit || null,
      cost: lerValorDoCampo(cost),
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setType(""); setName(""); setQuantity(""); setUnit(""); setCost("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button variant="outline">Registrar insumo</Button></SheetTrigger>
      <SheetContent title="Registrar insumo">
        <SheetHeader><SheetTitle>Registrar insumo</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div>
            <Label>Tipo *</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fertilizer">Fertilizante</SelectItem>
                <SelectItem value="pesticide">Defensivo</SelectItem>
                <SelectItem value="seed">Semente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="in">Nome *</Label>
            <Input id="in" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="iq">Quantidade</Label>
              <MoneyInput id="iq" kind="quantidade" value={quantity} onValueChange={setQuantity} />
            </div>
            <div className="flex-1">
              <Label htmlFor="iu">Unidade</Label>
              <Input id="iu" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, L..." />
            </div>
          </div>
          <div>
            <Label htmlFor="ic">Custo (R$)</Label>
            <MoneyInput id="ic" value={cost} onValueChange={setCost} />
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HarvestSheet({ cycleId }: { cycleId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState<"saca" | "tonelada" | "kg" | "">("");

  async function submit() {
    if (!date || !amount || !unit)
      return setError("Informe data, quantidade e unidade.");
    setLoading(true); setError(null);
    const res = await apiPatch(`/api/v1/cycles/${cycleId}/harvest`, {
      harvested_at: new Date(date).toISOString(),
      yield_amount: lerValorDoCampo(amount),
      yield_unit: unit,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setDate(""); setAmount(""); setUnit("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button>Registrar colheita</Button></SheetTrigger>
      <SheetContent title="Registrar colheita">
        <SheetHeader><SheetTitle>Registrar colheita</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="hd">Data da colheita *</Label>
            <Input id="hd" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ha">Quantidade colhida *</Label>
            <MoneyInput id="ha" kind="quantidade" value={amount} onValueChange={setAmount} />
          </div>
          <div>
            <Label>Unidade *</Label>
            <Select value={unit} onValueChange={(v) => setUnit(v as typeof unit)}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="saca">Saca</SelectItem>
                <SelectItem value="tonelada">Tonelada</SelectItem>
                <SelectItem value="kg">Kg</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Registrar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
