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

/**
 * Cancelar uma movimentação (§10.8). O motivo é obrigatório porque a linha
 * continua no histórico para conferência, e uma linha cancelada sem motivo
 * não explica nada a quem for conferir depois.
 */
export default function MovementCancel({
  movementId,
  descricao,
}: {
  movementId: string;
  descricao: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function submit() {
    if (!reason.trim()) {
      setError("Informe o motivo do cancelamento.");
      return;
    }
    setError(null);
    setLoading(true);
    const res = await apiPost(`/api/v1/herd/movements/${movementId}/cancel`, {
      reason: reason.trim(),
    });
    setLoading(false);

    if (!res.ok) {
      setError(res.message);
      return;
    }
    setOpen(false);
    setReason("");
    router.refresh();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setReason("");
          setError(null);
        }
      }}
    >
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex min-h-11 items-center text-sm text-gray-600 underline hover:text-red-700 sm:min-h-0"
        >
          Cancelar
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Cancelar movimentação</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{descricao}</p>
          <p className="text-sm text-gray-500">
            A movimentação para de contar no saldo, mas continua no histórico com o
            motivo, para conferência. Para corrigir um lançamento, cancele e registre
            de novo.
          </p>

          <div>
            <Label htmlFor="cancel-motivo">Motivo</Label>
            <Input
              id="cancel-motivo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: lançado errado"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Cancelando..." : "Confirmar cancelamento"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
