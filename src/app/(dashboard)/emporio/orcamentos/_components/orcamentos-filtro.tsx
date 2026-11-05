"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";

import { SITUACOES_DO_ORCAMENTO } from "./situacoes";

const TODAS = "__todas__";

/** Filtro da lista de orçamentos: vive na URL, e a página server relê. */
export function OrcamentosFiltro({
  lojas,
  loja,
  situacao,
  q,
}: {
  lojas: { id: string; name: string }[];
  loja: string;
  situacao: string;
  q: string;
}) {
  const router = useRouter();
  const [busca, setBusca] = useState(q);

  function ir(novaLoja: string, novaSituacao: string, novaBusca: string) {
    const p = new URLSearchParams();
    if (novaLoja) p.set("loja", novaLoja);
    if (novaSituacao !== "acompanhamento") p.set("situacao", novaSituacao);
    if (novaBusca.trim()) p.set("q", novaBusca.trim());
    const texto = p.toString();
    router.push(texto ? `/emporio/orcamentos?${texto}` : "/emporio/orcamentos");
  }

  return (
    <div className="grid gap-3 sm:max-w-3xl sm:grid-cols-3">
      <Select value={loja || TODAS} onValueChange={(v) => ir(v === TODAS ? "" : v, situacao, busca)}>
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

      <Select value={situacao} onValueChange={(v) => ir(loja, v, busca)}>
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

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ir(loja, situacao, busca);
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
    </div>
  );
}
