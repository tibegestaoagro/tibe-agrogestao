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
 * Cancelar uma negociação (§17.9). O motivo é obrigatório porque a linha
 * continua no histórico para conferência (§17.10), e linha cancelada sem
 * motivo não explica nada a quem for conferir depois.
 */
export default function NegotiationCancel({
  negotiationId,
  descricao,
  valorPago,
}: {
  negotiationId: string;
  descricao: string;
  /** Quanto deste negócio já foi pago: continua lançado depois do cancelamento. */
  valorPago: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function submit() {
    if (!reason.trim()) return setError("Informe o motivo do cancelamento.");
    setError(null);
    setLoading(true);
    const res = await apiPost(`/api/v1/negotiations/${negotiationId}/cancel`, {
      reason: reason.trim(),
    });
    setLoading(false);

    if (!res.ok) return setError(res.message);
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
        <button type="button" className="text-sm text-gray-500 underline hover:text-red-700">
          Cancelar
        </button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Cancelar negócio</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700">{descricao}</p>
          <p className="text-sm text-gray-500">
            Os animais voltam ao rebanho e as contas em aberto saem do financeiro. O
            negócio continua no histórico, marcado, com o motivo. Se parte dos animais
            já foi vendida ou movimentada, o cancelamento é recusado.
          </p>

          {valorPago > 0 && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Atenção: {valorPago.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{" "}
              deste negócio já {valorPago > 0 ? "foi pago" : ""} e vai continuar lançado no
              financeiro, porque o dinheiro saiu de verdade. Se houver devolução, registre
              como uma entrada nova.
            </p>
          )}

          <div>
            <Label htmlFor="cancel-motivo">Motivo</Label>
            <Input
              id="cancel-motivo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: negócio desfeito"
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
