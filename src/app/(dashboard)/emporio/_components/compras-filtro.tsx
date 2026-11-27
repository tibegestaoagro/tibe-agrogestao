"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { PaginacaoSeletores } from "./paginacao-seletores";
import { BarraDeFiltros } from "./barra-de-filtros";

const TODAS = "__todas__";

const SITUACOES: { valor: string; rotulo: string }[] = [
  { valor: "pendente", rotulo: "Pendente" },
  { valor: "recebida", rotulo: "Recebida" },
  { valor: "cancelada", rotulo: "Cancelada" },
];

type Estado = { situacao: string; porPagina: number; ordem: string };

/** Filtro da lista de compras: vive na URL, e a página server relê. A loja é a do topo (cookie), não daqui. */
export function ComprasFiltro({
  situacao,
  porPagina,
  ordem,
}: {
  situacao: string;
  porPagina: number;
  ordem: string;
}) {
  const router = useRouter();
  const atual: Estado = { situacao, porPagina, ordem };

  function ir(mudanca: Partial<Estado>) {
    const e = { ...atual, ...mudanca };
    const q = new URLSearchParams();
    if (e.situacao) q.set("situacao", e.situacao);
    if (e.porPagina !== 20) q.set("por_pagina", String(e.porPagina));
    if (e.ordem !== "desc") q.set("ordem", e.ordem);
    const texto = q.toString();
    router.push(texto ? `/emporio/compras?${texto}` : "/emporio/compras");
  }

  return (
    <BarraDeFiltros
      filtros={
        <>
      <Select value={situacao || TODAS} onValueChange={(v) => ir({ situacao: v === TODAS ? "" : v })}>
        <SelectTrigger aria-label="Filtrar por situação">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as situações</SelectItem>
          {SITUACOES.map((s) => (
            <SelectItem key={s.valor} value={s.valor}>
              {s.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

        </>
      }
      ajustes={
        <PaginacaoSeletores
          ordem={ordem}
          porPagina={porPagina}
          onOrdem={(v) => ir({ ordem: v })}
          onPorPagina={(v) => ir({ porPagina: v })}
        />
      }
    />
  );
}
