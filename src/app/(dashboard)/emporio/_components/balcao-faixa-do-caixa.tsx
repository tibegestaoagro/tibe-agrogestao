"use client";

import type { ReactNode } from "react";
import { faixaDoCaixa } from "@/lib/emporio/balcao-tela";
import { cn } from "@/lib/utils";

/**
 * A faixa do caixa no topo do balcão: verde com o caixa aberto, laranja com o caixa fechado (e então
 * traz a ação de abrir). O contêiner leva o `id` e o `aria` do `<Field>` de `cash_register_id`, onde
 * cai o foco da recusa do servidor. O texto depende do relógio, então quem a monta só a renderiza
 * depois de ler os caixas no navegador: o HTML do servidor nunca a contém.
 */
export function FaixaDoCaixa({
  id,
  aria,
  escolhido,
  abertos,
  lojaNome,
  acao,
}: {
  id?: string;
  aria?: Record<string, string | boolean | undefined>;
  escolhido: { nome: string; aberto_em: string | null } | null;
  abertos: number;
  lojaNome: string;
  /** "Abrir o caixa" e afins, à direita do texto. */
  acao?: ReactNode;
}) {
  const faixa = faixaDoCaixa({
    escolhido: escolhido && escolhido.aberto_em ? { nome: escolhido.nome, aberto_em: escolhido.aberto_em } : null,
    abertos,
    lojaNome,
    agora: new Date(),
  });
  return (
    <div
      id={id}
      tabIndex={id ? -1 : undefined}
      {...aria}
      data-faixa-do-caixa={faixa.tom}
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-2 text-sm font-medium",
        faixa.tom === "aberto" ? "bg-sucesso-suave text-sucesso-tinta" : "bg-atencao-suave text-atencao-tinta",
      )}
    >
      <span>{faixa.texto}</span>
      {acao}
    </div>
  );
}
