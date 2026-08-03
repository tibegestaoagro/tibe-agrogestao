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

export default function TaskForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [remind, setRemind] = useState(true);

  function reset() {
    setTitle("");
    setDueDate("");
    setRemind(true);
    setError(null);
  }

  async function submit() {
    if (!title || !dueDate) {
      setError("Preencha o que precisa ser feito e a data.");
      return;
    }
    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/tasks", {
      title,
      due_date: new Date(dueDate).toISOString(),
      remind,
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
        <Button>Nova tarefa</Button>
      </SheetTrigger>
      <SheetContent title="Nova tarefa">
        <SheetHeader>
          <SheetTitle>Nova tarefa</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="title">O que precisa ser feito *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: comprar sal mineral"
            />
          </div>
          <div>
            <Label htmlFor="due_date">Data *</Label>
            <Input id="due_date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="remind"
              type="checkbox"
              checked={remind}
              onChange={(e) => setRemind(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="remind" className="!mb-0">
              Me avisar no dia
            </Label>
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Criar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
