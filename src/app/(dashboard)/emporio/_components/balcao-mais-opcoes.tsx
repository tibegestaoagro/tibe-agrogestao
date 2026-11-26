"use client";

import { useState, type ReactNode } from "react";

/**
 * "Mais opções" do balcão: o que é raro (desconto no total, frete, entrega, franqueado, número do
 * orçamento) fica recolhido, e o título já diz o que está preenchido lá dentro.
 *
 * `open` é controlado por estado (e `onToggle`), para a seção não fechar sozinha a cada render. Ela abre
 * quando o servidor recusa um campo de dentro (`recusa` muda de valor a cada recusa, `temRecusa` diz se
 * algum campo da seção foi recusado): campo escondido não recebe a recusa nem o foco. A abertura é feita
 * DURANTE a renderização (estado derivado), e não num efeito, para a seção já estar aberta no mesmo
 * commit em que o balcão manda o foco ao campo.
 */
export function BalcaoMaisOpcoes({
  titulo,
  abertoDeInicio,
  temRecusa,
  recusa,
  carga,
  algoPreenchido,
  children,
}: {
  titulo: string;
  abertoDeInicio: boolean;
  temRecusa: boolean;
  recusa: number;
  /** Muda a cada orçamento carregado para faturar depois de a tela abrir ("Faturar" ou a busca pelo número). */
  carga: number;
  /** Algo da seção está preenchido: ao faturar um orçamento com frete ou franqueado, ela abre, como na edição. */
  algoPreenchido: boolean;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(abertoDeInicio);
  const [recusaVista, setRecusaVista] = useState(recusa);
  const [cargaVista, setCargaVista] = useState(carga);
  if (recusa !== recusaVista) {
    setRecusaVista(recusa);
    if (temRecusa && !aberto) setAberto(true);
  }
  if (carga !== cargaVista) {
    setCargaVista(carga);
    if (algoPreenchido && !aberto) setAberto(true);
  }

  return (
    <details
      open={aberto}
      onToggle={(e) => setAberto(e.currentTarget.open)}
      className="rounded-lg border border-borda bg-superficie-afundada px-3 py-2"
    >
      <summary className="cursor-pointer text-sm font-medium text-texto">{titulo}</summary>
      <div className="mt-3 space-y-4">{children}</div>
    </details>
  );
}
