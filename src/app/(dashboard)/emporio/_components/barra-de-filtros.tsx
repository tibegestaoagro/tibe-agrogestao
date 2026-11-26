import type { ReactNode } from "react";

/**
 * O arranjo único dos filtros das listas do Empório: a busca à esquerda e os filtros ao lado
 * (quebram linha no celular); embaixo, menor e à direita, os ajustes (ordenação e itens por página).
 * Linha sem conteúdo não aparece.
 */
export function BarraDeFiltros({
  busca,
  filtros,
  ajustes,
}: {
  busca?: ReactNode;
  filtros?: ReactNode;
  ajustes?: ReactNode;
}) {
  const temPrimeira = Boolean(busca) || Boolean(filtros);
  return (
    <div className="space-y-2">
      {temPrimeira && (
        <div className="flex flex-wrap items-end gap-3">
          {busca && <div className="min-w-full flex-1 sm:min-w-64">{busca}</div>}
          {filtros && <div className="flex flex-wrap items-end gap-3 [&_button[role=combobox]]:w-full sm:[&_button[role=combobox]]:w-52">{filtros}</div>}
        </div>
      )}
      {ajustes && <div className="flex flex-wrap justify-end gap-2 text-sm [&_button[role=combobox]]:w-full sm:[&_button[role=combobox]]:w-52">{ajustes}</div>}
    </div>
  );
}
