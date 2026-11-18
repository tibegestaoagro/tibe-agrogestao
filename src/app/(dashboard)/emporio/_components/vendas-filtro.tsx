"use client";

import { useRouter } from "next/navigation";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { ORIGENS_DA_VENDA, ROTULO_DA_ORIGEM } from "@/lib/emporio/frete";
import { PaginacaoSeletores } from "./paginacao-seletores";

const TODAS = "__todas__";

const SITUACOES: { valor: string; rotulo: string }[] = [
  { valor: "concluida", rotulo: "Concluída" },
  { valor: "cancelada", rotulo: "Cancelada" },
];

type Estado = { loja: string; situacao: string; origem: string; porPagina: number; ordem: string };

/** Filtro da lista de vendas: vive na URL, e a página server relê. Mudar qualquer coisa volta à página 1. */
export function VendasFiltro({
  lojas,
  loja,
  situacao,
  origem,
  porPagina,
  ordem,
}: {
  lojas: { id: string; name: string }[];
  loja: string;
  situacao: string;
  origem: string;
  porPagina: number;
  ordem: string;
}) {
  const router = useRouter();
  const atual: Estado = { loja, situacao, origem, porPagina, ordem };

  function ir(mudanca: Partial<Estado>) {
    const e = { ...atual, ...mudanca };
    const q = new URLSearchParams();
    if (e.loja) q.set("loja", e.loja);
    if (e.situacao) q.set("situacao", e.situacao);
    if (e.origem) q.set("origin", e.origem);
    if (e.porPagina !== 20) q.set("por_pagina", String(e.porPagina));
    if (e.ordem !== "desc") q.set("ordem", e.ordem);
    const texto = q.toString();
    router.push(texto ? `/emporio/vendas?${texto}` : "/emporio/vendas");
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Select value={loja || TODAS} onValueChange={(v) => ir({ loja: v === TODAS ? "" : v })}>
        <SelectTrigger aria-label="Filtrar por loja">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as lojas</SelectItem>
          {lojas.map((l) => (
            <SelectItem key={l.id} value={l.id}>
              {l.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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

      <Select value={origem || TODAS} onValueChange={(v) => ir({ origem: v === TODAS ? "" : v })}>
        <SelectTrigger aria-label="Filtrar por origem">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as origens</SelectItem>
          {ORIGENS_DA_VENDA.map((o) => (
            <SelectItem key={o} value={o}>
              {ROTULO_DA_ORIGEM[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <PaginacaoSeletores
        ordem={ordem}
        porPagina={porPagina}
        onOrdem={(v) => ir({ ordem: v })}
        onPorPagina={(v) => ir({ porPagina: v })}
      />
    </div>
  );
}
