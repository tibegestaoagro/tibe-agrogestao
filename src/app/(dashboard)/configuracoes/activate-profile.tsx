"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ActivateProfile({
  profileType,
  label,
}: {
  profileType: "fazenda" | "prestador";
  label: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/v1/tenant/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile_type: profileType }),
    });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error?.message ?? "Falha ao ativar perfil");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        onClick={activate}
        disabled={loading}
        className="rounded-md bg-tibe-primary px-4 py-2 text-sm font-medium text-white transition hover:bg-tibe-dark disabled:opacity-60"
      >
        {loading ? "Ativando..." : label}
      </button>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
