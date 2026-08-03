"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiPatch } from "@/lib/client-api";

export default function CancelButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function cancel() {
    if (!confirm("Cancelar este lançamento?")) return;
    setLoading(true);
    const res = await apiPatch(`/api/v1/financial-entries/${entryId}/cancel`, {});
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={cancel} disabled={loading}>
      {loading ? "..." : "Cancelar"}
    </Button>
  );
}
