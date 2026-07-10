"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiPatch } from "@/lib/client-api";

export default function PayButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function markPaid() {
    setLoading(true);
    // Corpo explícito {} — a rota exige JSON válido mesmo sem campos obrigatórios.
    const res = await apiPatch(`/api/v1/financial-entries/${entryId}/pay`, {});
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={markPaid} disabled={loading}>
      {loading ? "..." : "Marcar como pago"}
    </Button>
  );
}
