"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

const NEXT: Record<string, { status: string; label: string } | null> = {
  scheduled: { status: "completed", label: "Concluir" },
  completed: { status: "invoiced", label: "Faturar" },
  invoiced: null,
};

export default function OrderStatusButton({
  orderId,
  status,
}: {
  orderId: string;
  status: string;
}) {
  const router = useRouter();
  const aviso = useAviso();
  const [loading, setLoading] = useState(false);
  const next = NEXT[status];

  if (!next) return null;

  async function advance() {
    setLoading(true);
    const res = await apiPatch(`/api/v1/service-orders/${orderId}/status`, {
      status: next!.status,
    });
    setLoading(false);
    // Sem o `else`, faturar uma ordem falhava e a linha continuava
    // "Concluída", sem nada dito. Mesmo defeito que o `pay-button` teve.
    if (res.ok) router.refresh();
    else aviso.erro(res.message);
  }

  return (
    <Button variant="outline" size="sm" onClick={advance} disabled={loading}>
      {loading ? "..." : next.label}
    </Button>
  );
}
