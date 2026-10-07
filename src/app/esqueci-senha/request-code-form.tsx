"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client-api";

type Channel = "email" | "whatsapp";

export default function RequestCodeForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<Channel>("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await apiPost<{ requested: true }>("/api/v1/password-reset/request", { email, channel });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    router.push(`/esqueci-senha/verificar?email=${encodeURIComponent(email)}`);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-texto-secundario">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-borda-forte px-3 py-2 text-sm outline-none focus:border-primaria focus:ring-1 focus:ring-primaria"
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-texto-secundario">Receber código por</span>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-2 text-sm text-texto-secundario">
            <input
              type="radio"
              name="channel"
              checked={channel === "email"}
              onChange={() => setChannel("email")}
            />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm text-texto-secundario">
            <input
              type="radio"
              name="channel"
              checked={channel === "whatsapp"}
              onChange={() => setChannel("whatsapp")}
            />
            WhatsApp
          </label>
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-perigo-suave px-3 py-2 text-sm text-perigo-tinta">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-primaria px-4 py-2 font-medium text-sobre-primaria transition hover:bg-primaria-hover disabled:opacity-60"
      >
        {loading ? "Enviando..." : "Enviar código"}
      </button>
    </form>
  );
}
