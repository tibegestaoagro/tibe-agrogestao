"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Troca do email de LOGIN do dono (2026-07-30). Fica separado do formulário de
 * dados cadastrais de propósito: editar o contato da empresa e trocar a
 * credencial de acesso são coisas com consequências diferentes, e tê-las no
 * mesmo lugar foi o que levou a editar uma achando que era a outra.
 */
export default function EditOwnerEmailForm({
  tenantId,
  currentEmail,
}: {
  tenantId: string;
  currentEmail: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch(`/api/platform/tenants/${tenantId}/owner-email`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => null);
    setLoading(false);
    if (!res.ok) {
      setError(body?.error?.message ?? "Não foi possível trocar o email de login.");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-tibe-primary hover:underline"
      >
        Trocar email de login
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2">
      <input
        type="email"
        required
        value={email}
        onChange={(ev) => setEmail(ev.target.value)}
        className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-sm text-white"
      />
      <p className="text-xs text-gray-500">
        Isso muda a credencial de acesso ao painel. A senha atual continua valendo.
      </p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-md bg-tibe-primary px-3 py-1 text-xs text-white disabled:opacity-50"
        >
          {loading ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); }}
          className="rounded-md border border-gray-700 px-3 py-1 text-xs text-gray-300"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
