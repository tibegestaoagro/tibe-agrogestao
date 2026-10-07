"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client-api";

export default function VerifyCodeForm({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await apiPost<{ reset_id: string }>("/api/v1/password-reset/verify", { email, code });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    router.push(`/esqueci-senha/nova-senha?rid=${encodeURIComponent(res.data.reset_id)}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="code" className="block text-sm font-medium text-texto-secundario">
          Código de 6 dígitos
        </label>
        <input
          id="code"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          className="mt-1 w-full rounded-md border border-borda-forte px-3 py-2 text-center text-lg tracking-[0.5em] outline-none focus:border-primaria focus:ring-1 focus:ring-primaria"
        />
      </div>

      {error && (
        <p className="rounded-md bg-perigo-suave px-3 py-2 text-sm text-perigo-tinta">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="w-full rounded-md bg-primaria px-4 py-2 font-medium text-sobre-primaria transition hover:bg-primaria-hover disabled:opacity-60"
      >
        {loading ? "Validando..." : "Validar código"}
      </button>
    </form>
  );
}
