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
import { apiPost } from "@/lib/client-api";

export default function MaintenanceForm({ machineId }: { machineId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [performedAt, setPerformedAt] = useState("");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [nextDueAt, setNextDueAt] = useState("");

  function reset() {
    setPerformedAt("");
    setDescription("");
    setCost("");
    setNextDueAt("");
    setError(null);
  }

  async function submit() {
    if (!description) {
      setError("Descreva o que foi feito.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiPost(`/api/v1/machines/${machineId}/maintenances`, {
      performed_at: performedAt ? new Date(performedAt).toISOString() : null,
      description,
      cost: cost ? Number(cost) : null,
      next_due_at: nextDueAt ? new Date(nextDueAt).toISOString() : null,
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
        <Button variant="outline">Registrar manutenção</Button>
      </SheetTrigger>
      <SheetContent title="Registrar manutenção">
        <SheetHeader>
          <SheetTitle>Registrar manutenção</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="performed_at">Data (deixe em branco para hoje)</Label>
            <Input
              id="performed_at"
              type="date"
              value={performedAt}
              onChange={(e) => setPerformedAt(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="description">O que foi feito *</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: troca de óleo e filtros"
            />
          </div>
          <div>
            <Label htmlFor="cost">Custo (R$)</Label>
            <Input id="cost" type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
            <p className="mt-1 text-xs text-gray-500">
              Preenchido, gera uma despesa automática vinculada a esta manutenção.
            </p>
          </div>
          <div>
            <Label htmlFor="next_due">Próxima manutenção prevista</Label>
            <Input
              id="next_due"
              type="date"
              value={nextDueAt}
              onChange={(e) => setNextDueAt(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Se informada, substitui a previsão anterior e gera aviso quando estiver próxima.
            </p>
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
