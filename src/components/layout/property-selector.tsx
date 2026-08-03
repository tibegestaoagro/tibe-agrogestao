"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, ChevronDown, Check } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import { useDropdown } from "@/components/ui/use-dropdown";

export type PropertyOption = { id: string; name: string };

/**
 * Seletor de propriedade ativa no topo (briefing de layout, seção 12):
 * troca filtra Rebanho/Máquinas/Lavoura/KPIs do dashboard pela propriedade
 * escolhida, via cookie (`src/lib/active-property.ts`). "Todas as
 * propriedades" volta ao comportamento de sempre (soma tudo do tenant).
 */
export default function PropertySelector({
  properties,
  activePropertyId,
}: {
  properties: PropertyOption[];
  activePropertyId: string | null;
}) {
  const { open, setOpen, ref } = useDropdown<HTMLDivElement>();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  if (properties.length === 0) return null;

  const activeName =
    properties.find((p) => p.id === activePropertyId)?.name ?? "Todas as propriedades";

  async function select(propertyId: string | null) {
    setOpen(false);
    setLoading(true);
    await apiPost("/api/v1/tenant/active-property", { property_id: propertyId });
    setLoading(false);
    router.refresh();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:border-tibe-primary disabled:opacity-60"
      >
        <Home className="h-4 w-4 text-tibe-primary" />
        <span className="max-w-[10rem] truncate font-medium">{activeName}</span>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => select(null)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700 hover:bg-tibe-light"
          >
            Todas as propriedades
            {!activePropertyId && <Check className="h-4 w-4 text-tibe-primary" />}
          </button>
          <div className="my-1 border-t border-gray-100" />
          {properties.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => select(p.id)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700 hover:bg-tibe-light"
            >
              <span className="truncate">{p.name}</span>
              {activePropertyId === p.id && <Check className="h-4 w-4 shrink-0 text-tibe-primary" />}
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          <Link
            href="/rebanho"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-tibe-primary hover:bg-tibe-light"
          >
            Gerenciar propriedades →
          </Link>
        </div>
      )}
    </div>
  );
}
