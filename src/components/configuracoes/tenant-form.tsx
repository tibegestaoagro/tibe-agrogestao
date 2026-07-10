"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPatch } from "@/lib/client-api";

export default function TenantForm({
  tenant,
}: {
  tenant: { name: string; document: string; phone: string | null; email: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState(tenant.name);
  const [document, setDocument] = useState(tenant.document);
  const [phone, setPhone] = useState(tenant.phone ?? "");
  const [email, setEmail] = useState(tenant.email ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    setSaved(false);
    const res = await apiPatch("/api/v1/tenant", { name, document, phone, email });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="t-name">Nome da empresa</Label>
        <Input id="t-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="t-doc">CNPJ/CPF</Label>
          <Input id="t-doc" value={document} onChange={(e) => setDocument(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="t-phone">Telefone</Label>
          <Input id="t-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
      </div>
      <div>
        <Label htmlFor="t-email">Email</Label>
        <Input id="t-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {saved && <p className="text-sm text-tibe-primary">Dados salvos.</p>}
      <Button onClick={submit} disabled={loading}>
        {loading ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );
}
