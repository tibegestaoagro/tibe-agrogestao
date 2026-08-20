"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Home, ChevronDown, Check } from "lucide-react";
import { apiPost } from "@/lib/client-api";
import { useDropdown } from "@/components/ui/use-dropdown";
import { useAviso } from "@/components/ui/toast";

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
  const aviso = useAviso();

  if (properties.length === 0) return null;

  const activeName =
    properties.find((p) => p.id === activePropertyId)?.name ?? "Todas as propriedades";

  /**
   * Trocar a fazenda que o painel inteiro está mostrando.
   *
   * Engolia o erro (2026-08-20), e aqui isso era especialmente traiçoeiro: o
   * seletor no topo passava a exibir o nome novo enquanto os números da tela
   * continuavam sendo os da fazenda antiga. O produtor lia o saldo de um lugar
   * achando que era de outro.
   */
  async function select(propertyId: string | null) {
    setOpen(false);
    setLoading(true);
    const res = await apiPost("/api/v1/tenant/active-property", { property_id: propertyId });
    setLoading(false);
    if (res.ok) router.refresh();
    else aviso.erro(res.message);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition hover:border-tibe-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tibe-primary disabled:opacity-60 sm:min-h-0"
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
            className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700 hover:bg-tibe-light sm:min-h-9"
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
              className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700 hover:bg-tibe-light sm:min-h-9"
            >
              <span className="truncate">{p.name}</span>
              {activePropertyId === p.id && <Check className="h-4 w-4 shrink-0 text-tibe-primary" />}
            </button>
          ))}
          <div className="my-1 border-t border-gray-100" />
          {/* Apontava para `/rebanho`, onde a gestão de propriedades foi
              REMOVIDA no Módulo 29: o cadastro de fazenda passou a existir só
              em Minha Fazenda, e o link ficou levando a uma tela onde a
              funcionalidade não está mais. O texto também mudou: o produto diz
              "fazenda" ao produtor, e "propriedade" só aparecia aqui. */}
          <Link
            href="/minha-fazenda"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center px-3 py-2 text-sm text-tibe-primary hover:bg-tibe-light sm:min-h-9"
          >
            Gerenciar minhas fazendas
          </Link>
        </div>
      )}
    </div>
  );
}
