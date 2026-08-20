"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "@/lib/client-api";
import { PLAN_PRICES } from "@/lib/asaas";

type Plan = "campo" | "fazenda" | "grupo";

const PLANS: { key: Plan; name: string; tagline: string }[] = [
  { key: "campo", name: "Campo", tagline: "Para o produtor iniciando o controle digital" },
  { key: "fazenda", name: "Fazenda", tagline: "Gestão completa de rebanho e lavoura" },
  { key: "grupo", name: "Grupo", tagline: "Fazenda + prestação de serviço + agente no WhatsApp" },
];

export default function ChoosePlanForm() {
  const router = useRouter();
  const [selected, setSelected] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    const res = await apiPost<{ plan: Plan }>("/api/v1/tenant/plan", { plan: selected });
    setLoading(false);
    if (!res.ok) return setError(res.message);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {PLANS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setSelected(p.key)}
            className={`rounded-lg border p-4 text-left transition ${
              selected === p.key
                ? "border-tibe-primary bg-tibe-light"
                : "border-gray-200 hover:border-tibe-primary"
            }`}
          >
            <span className="block font-medium text-gray-900">{p.name}</span>
            <span className="mt-1 block text-lg font-bold text-tibe-dark">
              R$ {PLAN_PRICES[p.key]}
              <span className="text-xs font-normal text-gray-500">/mês</span>
            </span>
            <span className="mt-1 block text-sm text-gray-500">{p.tagline}</span>
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <button
        type="button"
        disabled={!selected || loading}
        onClick={confirm}
        className="mt-6 w-full rounded-md bg-primaria px-4 py-2 font-medium text-sobre-primaria transition hover:bg-primaria-hover disabled:opacity-50"
      >
        {loading ? "Confirmando..." : "Confirmar plano"}
      </button>
    </div>
  );
}
