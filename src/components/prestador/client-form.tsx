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

export default function ClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", document: "", phone: "", email: "", notes: "" });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.name) return setError("Nome é obrigatório.");
    setLoading(true);
    setError(null);
    const res = await apiPost("/api/v1/service-clients", {
      name: form.name,
      document: form.document || null,
      phone: form.phone || null,
      email: form.email || null,
      notes: form.notes || null,
    });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setForm({ name: "", document: "", phone: "", email: "", notes: "" });
    setOpen(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>Novo cliente</Button>
      </SheetTrigger>
      <SheetContent title="Novo cliente">
        <SheetHeader><SheetTitle>Novo cliente</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div><Label htmlFor="c-name">Nome *</Label><Input id="c-name" value={form.name} onChange={set("name")} /></div>
          <div><Label htmlFor="c-doc">Documento (CPF/CNPJ)</Label><Input id="c-doc" value={form.document} onChange={set("document")} /></div>
          <div><Label htmlFor="c-phone">Telefone</Label><Input id="c-phone" value={form.phone} onChange={set("phone")} /></div>
          <div><Label htmlFor="c-email">Email</Label><Input id="c-email" type="email" value={form.email} onChange={set("email")} /></div>
          <div><Label htmlFor="c-notes">Observações</Label><Input id="c-notes" value={form.notes} onChange={set("notes")} /></div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <Button onClick={submit} disabled={loading} className="w-full">
            {loading ? "Salvando..." : "Cadastrar"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
