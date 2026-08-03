"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiPatch } from "@/lib/client-api";

export default function TaskActions({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<"completed" | "cancelled" | null>(null);

  async function setStatus(status: "completed" | "cancelled") {
    setLoading(status);
    await apiPatch(`/api/v1/tasks/${taskId}`, { status });
    setLoading(null);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        onClick={() => setStatus("completed")}
        disabled={loading !== null}
      >
        {loading === "completed" ? "..." : "Concluir"}
      </Button>
      <Button variant="ghost" onClick={() => setStatus("cancelled")} disabled={loading !== null}>
        {loading === "cancelled" ? "..." : "Cancelar"}
      </Button>
    </div>
  );
}
