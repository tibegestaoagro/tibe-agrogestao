"use client";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ORDENS_DO_ORCAMENTO, TAMANHOS_DE_PAGINA } from "./paginacao-opcoes";

/** Os seletores "Ordem" e "Por página" que acompanham os filtros das listas paginadas. */
export function PaginacaoSeletores({
  ordem,
  porPagina,
  onOrdem,
  onPorPagina,
}: {
  /** Sem `ordem` (e `onOrdem`), o seletor "Ordem" não aparece: só o "Por página". */
  ordem?: string;
  porPagina: number;
  onOrdem?: (ordem: string) => void;
  onPorPagina: (porPagina: number) => void;
}) {
  return (
    <>
      {ordem !== undefined && onOrdem && (
        <Select value={ordem} onValueChange={onOrdem}>
          <SelectTrigger aria-label="Ordem">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDENS_DO_ORCAMENTO.map((o) => (
              <SelectItem key={o.valor} value={o.valor}>
                {o.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={String(porPagina)} onValueChange={(v) => onPorPagina(Number(v))}>
        <SelectTrigger aria-label="Por página">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TAMANHOS_DE_PAGINA.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n} por página
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
