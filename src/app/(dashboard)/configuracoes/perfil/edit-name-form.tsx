"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPatch } from "@/lib/client-api";

export default function EditNameForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    setLoading(true);
    const res = await apiPatch<{ name: string }>("/api/v1/auth/profile", { name });
    setLoading(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setDone(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <Label htmlFor="profile_name">Nome</Label>
        <Input
          id="profile_name"
          required
          minLength={2}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && (
        <p className="rounded-md bg-tibe-light px-3 py-2 text-sm text-tibe-dark">
          Nome atualizado.
        </p>
      )}
      <Button type="submit" disabled={loading || name.trim() === initialName.trim()}>
        {loading ? "Salvando..." : "Salvar nome"}
      </Button>
    </form>
  );
}
