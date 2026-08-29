"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAviso } from "@/components/ui/toast";
import { apiPatch } from "@/lib/client-api";

export default function PostponeButton({ entryId }: { entryId: string }) {
  const router = useRouter();
  const aviso = useAviso();
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!newDate) return;
    setLoading(true);
    const res = await apiPatch(`/api/v1/financial-entries/${entryId}/postpone`, {
      due_date: new Date(newDate).toISOString(),
    });
    setLoading(false);
    // Sem o `else`, o campo de data ficava aberto com a data digitada e nada
    // acontecia: o produtor não sabia se adiou. Mesmo defeito que o
    // `pay-button` teve até 2026-08-20, na mesma tela.
    if (res.ok) {
      setOpen(false);
      setNewDate("");
      router.refresh();
    } else {
      aviso.erro(res.message);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Adiar
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="date"
        value={newDate}
        onChange={(e) => setNewDate(e.target.value)}
        className="h-8 w-36 text-xs"
      />
      <Button variant="outline" size="sm" onClick={submit} disabled={loading || !newDate}>
        {loading ? "..." : "OK"}
      </Button>
    </div>
  );
}
