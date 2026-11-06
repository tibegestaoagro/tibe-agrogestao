"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Filtro da lista de fornecedores: nome e "mostrar arquivados" vivem na URL, e a página server relê. */
export function FornecedoresFiltro({ q, arquivados }: { q: string; arquivados: boolean }) {
  const router = useRouter();
  const [texto, setTexto] = useState(q);

  function ir(novoTexto: string, novosArquivados: boolean) {
    const p = new URLSearchParams();
    if (novoTexto.trim()) p.set("q", novoTexto.trim());
    if (novosArquivados) p.set("arquivados", "1");
    const s = p.toString();
    router.push(s ? `/emporio/fornecedores?${s}` : "/emporio/fornecedores");
  }

  return (
    <form
      className="flex flex-wrap items-center gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        ir(texto, arquivados);
      }}
    >
      <div className="min-w-0 flex-1 sm:max-w-sm">
        <Input
          aria-label="Buscar fornecedor pelo nome"
          placeholder="Buscar pelo nome"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
      </div>
      <Button type="submit" variant="outline" size="sm">
        Buscar
      </Button>
      <label className="flex items-center gap-2 text-sm text-texto">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-borda text-primaria-tinta focus:ring-primaria"
          checked={arquivados}
          onChange={(e) => ir(texto, e.target.checked)}
        />
        Mostrar arquivados
      </label>
    </form>
  );
}
