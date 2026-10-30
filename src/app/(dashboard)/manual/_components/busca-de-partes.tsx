"use client";

import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { BASE_DO_EMPORIO, GRUPOS, PARTES_DO_EMPORIO } from "../_conteudo/indice";

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Filtra as partes do capítulo pelo título (e pelo resumo), sem servidor de busca. */
export function BuscaDePartes() {
  const [termo, setTermo] = useState("");
  const alvo = normalizar(termo.trim());
  const achadas = PARTES_DO_EMPORIO.filter(
    (p) => !alvo || normalizar(p.titulo).includes(alvo) || normalizar(p.resumo).includes(alvo),
  );

  return (
    <div className="space-y-4">
      <Input
        type="search"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Buscar no capítulo: fiado, gaveta, saca..."
        aria-label="Buscar no capítulo pelo título"
      />
      {achadas.length === 0 ? (
        <EmptyState titulo="Nada com esse nome">Tente outra palavra, como &quot;venda&quot; ou &quot;estoque&quot;.</EmptyState>
      ) : (
        GRUPOS.map((g) => {
          const doGrupo = achadas.filter((p) => p.grupo === g);
          if (doGrupo.length === 0) return null;
          return (
            <section key={g}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-texto-discreto">{g}</h2>
              <ul className="grid gap-2 sm:grid-cols-2">
                {doGrupo.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={`${BASE_DO_EMPORIO}/${p.slug}`}
                      className="block h-full rounded-lg border border-borda bg-superficie p-4 hover:border-borda-forte"
                    >
                      <span className="font-medium text-texto">{p.titulo}</span>
                      <span className="mt-1 block text-sm text-texto-secundario">{p.resumo}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
