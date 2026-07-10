"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiPatch } from "@/lib/client-api";

export default function AlertDismissButton({ alertId }: { alertId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function dismiss() {
    setLoading(true);
    const res = await apiPatch(`/api/v1/alerts/${alertId}/dismiss`);
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={dismiss} disabled={loading}>
      {loading ? "..." : "Marcar como resolvido"}
    </Button>
  );
}
