"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const CHAVE_AREA = "tibe:financeiro:area";
const AREAS = ["fazenda", "emporio", "tudo"];

/**
 * Fazenda, Empório ou Tudo (Q106). Vive na URL (`area`), a página server relê.
 * Sem `area` na URL e com uma escolha lembrada neste navegador, usa a lembrada.
 */
export function AreaFiltro({ area, areaVeioDaUrl }: { area: string; areaVeioDaUrl: boolean }) {
  const router = useRouter();
  const sp = useSearchParams();

  function ir(nova: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("area", nova);
    router.push(`/financeiro?${params.toString()}`);
  }

  useEffect(() => {
    if (areaVeioDaUrl) return;
    try {
      const lembrada = window.localStorage.getItem(CHAVE_AREA);
      if (lembrada && lembrada !== area && AREAS.includes(lembrada)) {
        const params = new URLSearchParams(sp.toString());
        params.set("area", lembrada);
        router.replace(`/financeiro?${params.toString()}`);
      }
    } catch {
      // Sem armazenamento, fica em Tudo.
    }
  }, [areaVeioDaUrl, area, sp, router]);

  function escolher(nova: string) {
    try {
      window.localStorage.setItem(CHAVE_AREA, nova);
    } catch {
      // Sem armazenamento, a escolha vale só nesta tela.
    }
    ir(nova);
  }

  return (
    <div className="space-y-1">
      <Select value={area} onValueChange={escolher}>
        <SelectTrigger aria-label="Área" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="tudo">Tudo</SelectItem>
          <SelectItem value="fazenda">Fazenda</SelectItem>
          <SelectItem value="emporio">Empório</SelectItem>
        </SelectContent>
      </Select>
      {area === "emporio" && (
        <p className="text-xs text-texto-discreto">O seletor de fazenda não se aplica ao Empório.</p>
      )}
    </div>
  );
}
