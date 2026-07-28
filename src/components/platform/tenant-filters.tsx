"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "trial", label: "Trial" },
  { value: "active", label: "Ativo" },
  { value: "overdue", label: "Em atraso" },
  { value: "canceled", label: "Cancelado" },
];

export default function TenantFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/plataforma/tenants?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateParam("q", q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome ou documento"
          className="w-64 rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white outline-none focus:border-gray-500"
        />
      </form>
      <select
        value={sp.get("status") ?? ""}
        onChange={(e) => updateParam("status", e.target.value)}
        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-sm text-gray-400">
        <input
          type="checkbox"
          checked={sp.get("archived") === "1"}
          onChange={(e) => updateParam("archived", e.target.checked ? "1" : "")}
          className="rounded border-gray-700 bg-gray-900"
        />
        Mostrar arquivados
      </label>
    </div>
  );
}
