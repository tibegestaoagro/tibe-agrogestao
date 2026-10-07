"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Choice = "fazenda" | "prestador" | "ambos";

const OPTIONS: { value: Choice; title: string; desc: string }[] = [
  { value: "fazenda", title: "Fazenda", desc: "Rebanho e lavoura" },
  { value: "prestador", title: "Prestador de Serviço", desc: "Clientes e ordens de serviço" },
  { value: "ambos", title: "Ambos", desc: "Fazenda + prestação de serviço" },
];

async function createProfile(profile_type: "fazenda" | "prestador") {
  const res = await fetch("/api/v1/tenant/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile_type }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? "Falha ao criar perfil");
  }
}

export default function OnboardingForm() {
  const router = useRouter();
  const [selected, setSelected] = useState<Choice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      if (selected === "ambos") {
        await createProfile("fazenda");
        await createProfile("prestador");
      } else {
        await createProfile(selected);
      }
      router.push("/meu-dia");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro inesperado");
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <div className="grid gap-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSelected(opt.value)}
            className={`rounded-lg border p-4 text-left transition ${
              selected === opt.value
                ? "border-primaria bg-superficie-afundada"
                : "border-borda hover:border-primaria"
            }`}
          >
            <span className="block font-medium text-texto">{opt.title}</span>
            <span className="block text-sm text-texto-discreto">{opt.desc}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-perigo-suave px-3 py-2 text-sm text-perigo-tinta">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!selected || loading}
        onClick={handleConfirm}
        className="mt-6 w-full rounded-md bg-primaria px-4 py-2 font-medium text-sobre-primaria transition hover:bg-primaria-hover disabled:opacity-50"
      >
        {loading ? "Configurando..." : "Confirmar"}
      </button>
    </div>
  );
}
