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
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-tibe-primary focus:ring-1 focus:ring-tibe-primary"
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-gray-700">Receber código por</span>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="channel"
              checked={channel === "email"}
              onChange={() => setChannel("email")}
            />
            Email
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
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
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-tibe-primary px-4 py-2 font-medium text-white transition hover:bg-tibe-dark disabled:opacity-60"
      >
        {loading ? "Enviando..." : "Enviar código"}
      </button>
    </form>
  );
}
