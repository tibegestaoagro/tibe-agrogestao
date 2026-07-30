"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Troca voluntária de senha (Módulo 19): exige a senha atual. */
export default function ChangeOwnPasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (next !== confirm) {
      setError("A nova senha e a confirmação não coincidem.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/v1/auth/change-password-self", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ current_password: current, new_password: next }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);

    if (!res.ok) {
      setError(body?.error?.message ?? "Não foi possível trocar a senha.");
      return;
    }

    setCurrent("");
    setNext("");
    setConfirm("");
    setDone(true);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="current_password">Senha atual</Label>
        <Input
          id="current_password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>

      <div>
        <Label htmlFor="new_password">Nova senha</Label>
        <Input
          id="new_password"
          type="password"
          autoComplete="new-password"
          required
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-500">
          Mínimo de 8 caracteres, com letra maiúscula, número e símbolo.
        </p>
      </div>

      <div>
        <Label htmlFor="confirm_password">Confirmar nova senha</Label>
        <Input
          id="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {done && (
        <p className="rounded-md bg-tibe-light px-3 py-2 text-sm text-tibe-dark">
          Senha alterada com sucesso.
        </p>
      )}

      <Button type="submit" disabled={loading}>
        {loading ? "Salvando..." : "Trocar senha"}
      </Button>
    </form>
  );
}
