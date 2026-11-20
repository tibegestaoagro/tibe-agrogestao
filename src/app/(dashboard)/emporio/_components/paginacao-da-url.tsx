"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { PaginacaoSeletores } from "./paginacao-seletores";

/**
 * Seletores de ordem e de tamanho de página que vivem na URL, para páginas server com mais de uma
 * lista (cada lista tem as próprias chaves). Trocar qualquer um volta a página daquela lista para 1.
 */
export function PaginacaoDaUrl({
  ordem,
  porPagina,
  chaveOrdem,
  chavePorPagina,
  chavePagina,
}: {
  ordem?: string;
  porPagina: number;
  chaveOrdem?: string;
  chavePorPagina: string;
  chavePagina: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const atuais = useSearchParams();

  function trocar(chave: string, valor: string) {
    const p = new URLSearchParams(atuais.toString());
    p.set(chave, valor);
    p.delete(chavePagina);
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <PaginacaoSeletores
        ordem={chaveOrdem ? ordem : undefined}
        porPagina={porPagina}
        onOrdem={chaveOrdem ? (o) => trocar(chaveOrdem, o) : undefined}
        onPorPagina={(n) => trocar(chavePorPagina, String(n))}
      />
    </div>
  );
}
