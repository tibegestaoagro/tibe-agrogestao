"use client";

import { useEffect, useRef } from "react";
import { ACOES_DE_ATALHO, teclaDoEvento, type AcaoDeAtalho } from "@/lib/emporio/atalhos";

/**
 * Os atalhos do balcão (Q361): um `keydown` no documento enquanto o balcão está montado.
 * Cada ação procura o alvo na tela na hora de agir (o Caixa não tem "Vendedor", o modo
 * Orçamento não tem pagamento): alvo ausente não faz nada, mas a tecla de uma ação é retida
 * mesmo assim (o `preventDefault` vem antes de procurar o alvo).
 */

const ROTULO_DA_ACAO: Record<AcaoDeAtalho, string> = {
  produto: "Produto",
  cliente: "Cliente",
  vendedor: "Vendedor",
  pagamento: "Pagamento",
  fechar: "Fechar a venda",
};

/** O alvo de cada ação, ou nulo se a tela não o tem agora. */
function alvoDaAcao(acao: AcaoDeAtalho, idDoVendedor: string): HTMLElement | null {
  switch (acao) {
    case "produto":
      return document.querySelector<HTMLElement>('[data-atalho="busca"]');
    case "cliente": {
      // Sem cliente, "Escolher cliente"; com cliente, "Trocar". Os dois vivem no grupo do campo Cliente.
      const grupo = document.querySelector('[role="group"][aria-label="Cliente"]');
      if (!grupo) return null;
      const botoes = Array.from(grupo.querySelectorAll<HTMLElement>("button"));
      return (
        botoes.find((b) => b.getAttribute("aria-label") === "Trocar cliente") ??
        botoes.find((b) => b.textContent?.trim() === "Escolher cliente") ??
        null
      );
    }
    case "vendedor":
      return document.getElementById(idDoVendedor);
    case "pagamento":
      return document.querySelector<HTMLElement>('[data-atalho="forma-de-pagamento"]');
    case "fechar":
      return document.querySelector<HTMLElement>('[data-atalho="fechar"]');
  }
}

function agir(acao: AcaoDeAtalho, alvo: HTMLElement) {
  // Fechar aciona o botão principal do rodapé: passa pelas mesmas conferências do clique dele.
  if (acao === "fechar" || acao === "cliente") alvo.click();
  else alvo.focus();
}

/**
 * `teclas` mapeia cada ação à tecla configurada. Não age com janela ou painel aberto por cima
 * (`[role=dialog]`) e só segura a tecla (`preventDefault`) quando ela é de uma ação.
 */
export function useAtalhosDoBalcao({
  teclas,
  idDoVendedor,
}: {
  teclas: Record<AcaoDeAtalho, string>;
  idDoVendedor: string;
}) {
  // Sempre a configuração mais recente, sem religar o listener a cada render.
  const atual = useRef({ teclas, idDoVendedor });
  useEffect(() => {
    atual.current = { teclas, idDoVendedor };
  });

  useEffect(() => {
    function aoApertar(e: KeyboardEvent) {
      const tecla = teclaDoEvento(e);
      if (!tecla) return;
      const { teclas: mapa, idDoVendedor: idV } = atual.current;
      const acao = ACOES_DE_ATALHO.find((a) => mapa[a] === tecla);
      if (!acao) return;
      // Com janela ou painel por cima, a tecla é deles: nem age, nem é retida.
      if (document.querySelector('[role="dialog"]')) return;
      // A tecla é de uma ação: o navegador não a usa (nem o campo a escreve), com ou sem alvo.
      e.preventDefault();
      if (e.repeat) return;
      const alvo = alvoDaAcao(acao, idV);
      if (alvo) agir(acao, alvo);
    }
    document.addEventListener("keydown", aoApertar);
    return () => document.removeEventListener("keydown", aoApertar);
  }, []);
}

/** A legenda fixa no rodapé do balcão: só a partir de `md` (no celular não há teclado). */
export function LegendaDosAtalhos({
  teclas,
  fechar,
}: {
  teclas: Record<AcaoDeAtalho, string>;
  /** O rótulo do botão principal do rodapé neste momento ("Salvar orçamento", "Fechar a venda"...). */
  fechar: string;
}) {
  return (
    <ul aria-label="Atalhos do teclado" className="hidden flex-wrap gap-x-4 gap-y-1 text-xs text-texto-secundario md:flex">
      {ACOES_DE_ATALHO.map((a) => (
        <li key={a} className="flex items-center gap-1">
          <kbd className="rounded border border-borda bg-superficie-afundada px-1.5 py-0.5 font-sans font-medium text-texto">
            {teclas[a]}
          </kbd>
          {a === "fechar" ? fechar : ROTULO_DA_ACAO[a]}
        </li>
      ))}
    </ul>
  );
}
