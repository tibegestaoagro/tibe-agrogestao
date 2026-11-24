"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

/**
 * O (i) ao lado do título: o texto de apresentação da tela, fora do caminho de
 * quem já sabe usá-la. Abre com o mouse em cima e fecha ao sair, a menos que
 * tenha sido aberto por clique (aí fica até novo clique, Esc ou clique fora).
 * Toque só alterna.
 */
export function AjudaDaTela({
  children,
  manual,
  rotulo = "Sobre esta tela",
}: {
  children: React.ReactNode;
  manual?: string;
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [fixo, setFixo] = useState(false);
  const raiz = useRef<HTMLSpanElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const idBalao = useId();

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) {
        setAberto(false);
        setFixo(false);
      }
    }
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [aberto]);

  function fechar() {
    setAberto(false);
    setFixo(false);
  }

  return (
    <span
      ref={raiz}
      className="relative inline-flex"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setAberto(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse" && !fixo) setAberto(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && aberto) {
          fechar();
          botao.current?.focus();
        }
      }}
    >
      <button
        ref={botao}
        type="button"
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={idBalao}
        onClick={() => {
          if (aberto && fixo) {
            fechar();
          } else {
            setAberto(true);
            setFixo(true);
          }
        }}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-borda bg-superficie text-xs font-semibold italic text-texto-secundario hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria"
      >
        i
      </button>
      <span
        id={idBalao}
        role="region"
        aria-label={rotulo}
        hidden={!aberto}
        className="absolute left-0 top-7 z-20 w-[min(20rem,calc(100vw-2rem))] rounded-lg bg-superficie-invertida px-3.5 py-3 text-left text-sm font-normal not-italic leading-snug text-texto-invertido shadow-lg"
      >
        {children}
        {manual && (
          <Link href={manual} className="mt-2 block font-semibold underline underline-offset-2">
            Ver no manual ›
          </Link>
        )}
      </span>
    </span>
  );
}
