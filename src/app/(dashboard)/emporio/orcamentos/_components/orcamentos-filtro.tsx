"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarraDeFiltros } from "../../_components/barra-de-filtros";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { SITUACOES_DO_ORCAMENTO } from "./situacoes";
import { ORDENS_DO_ORCAMENTO, TAMANHOS_DE_PAGINA } from "../../_components/paginacao-opcoes";

const TODAS = "__todas__";

type Estado = { loja: string; situacao: string; q: string; porPagina: number; ordem: string };

/** Filtro da lista de orçamentos: vive na URL, e a página server relê. Mudar qualquer coisa volta à página 1. */
export function OrcamentosFiltro({
  lojas,
  loja,
  situacao,
  q,
  porPagina,
  ordem,
}: {
  lojas: { id: string; name: string }[];
  loja: string;
  situacao: string;
  q: string;
  porPagina: number;
  ordem: string;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(q);
  const atual: Estado = { loja, situacao, q: busca, porPagina, ordem };

  function ir(mudanca: Partial<Estado>) {
    const e = { ...atual, ...mudanca };
    const p = new URLSearchParams();
    if (e.loja) p.set("loja", e.loja);
    if (e.situacao !== "acompanhamento") p.set("situacao", e.situacao);
    if (e.q.trim()) p.set("q", e.q.trim());
    if (e.porPagina !== 20) p.set("por_pagina", String(e.porPagina));
    if (e.ordem !== "desc") p.set("ordem", e.ordem);
    const texto = p.toString();
    router.push(texto ? `/emporio/orcamentos?${texto}` : "/emporio/orcamentos");
  }

  return (
    <BarraDeFiltros
      busca={
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ir({});
        }}
      >
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Telefone, CPF, CNPJ, nome ou nº"
          aria-label="Buscar orçamento"
        />
        <Button type="submit" variant="outline">
          Buscar
        </Button>
      </form>
      }
      filtros={
        <>
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

      <Select value={situacao} onValueChange={(v) => ir({ situacao: v })}>
        <SelectTrigger aria-label="Filtrar por situação">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SITUACOES_DO_ORCAMENTO.map((s) => (
            <SelectItem key={s.valor} value={s.valor}>
              {s.rotulo}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
        </>
      }
      ajustes={
        <>
      <Select value={ordem} onValueChange={(v) => ir({ ordem: v })}>
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

      <Select value={String(porPagina)} onValueChange={(v) => ir({ porPagina: Number(v) })}>
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
      }
    />
  );
}
