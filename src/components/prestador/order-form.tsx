"use client";

import { useState, useMemo } from "react";
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
import { apiPost } from "@/lib/client-api";

type Client = { id: string; name: string };
type Service = {
  id: string;
  name: string;
  pricing_type: "hour" | "day" | "fixed";
  unit_price: number | null;
};

const UNIT: Record<string, string> = { hour: "horas", day: "dias", fixed: "(fixo)" };

export default function OrderForm({
  clients,
  services,
}: {
  clients: Client[];
  services: Service[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  const service = useMemo(() => services.find((s) => s.id === serviceId), [services, serviceId]);
  const isFixed = service?.pricing_type === "fixed";
  const total = service?.unit_price != null
    ? (isFixed ? 1 : (lerValorDoCampo(quantity) ?? 0)) * service.unit_price
    : null;

  async function submit() {
    if (!clientId || !serviceId || !date)
      return setError("Selecione cliente, serviço e data.");
    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/service-orders", {
      service_client_id: clientId,
      service_id: serviceId,
      quantity: isFixed ? 1 : lerValorDoCampo(quantity),
      description: description || null,
      performed_at: new Date(date).toISOString(),
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setClientId(""); setServiceId(""); setQuantity("1"); setDate(""); setDescription("");
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>Nova ordem</Button>
      </SheetTrigger>
      <SheetContent title="Nova ordem de serviço">
        <SheetHeader><SheetTitle>Nova ordem de serviço</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div>
            <Label>Cliente *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Serviço *</Label>
            <Select value={serviceId} onValueChange={setServiceId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}: {UNIT[s.pricing_type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!isFixed && (
            <div>
              <Label htmlFor="o-qty">Quantidade ({service ? UNIT[service.pricing_type] : "unidade"}) *</Label>
              <MoneyInput id="o-qty" kind="quantidade" value={quantity} onValueChange={setQuantity} />
            </div>
          )}
          <div>
            <Label htmlFor="o-date">Data de execução *</Label>
            <Input id="o-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="o-desc">Descrição</Label>
            <Input id="o-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {total != null && (
            <p className="text-sm text-gray-700">
              Total: <span className="font-semibold text-tibe-dark">
                {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </p>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Registrar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
