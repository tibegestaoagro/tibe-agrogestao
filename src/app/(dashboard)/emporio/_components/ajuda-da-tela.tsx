"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

/**
 * O (i) ao lado do título: o texto de apresentação da tela, fora do caminho de
 * quem já sabe usá-la. Abre com o mouse em cima e fecha ao sair, a menos que
 * tenha sido aberto por clique (aí fica até novo clique, Esc ou clique fora).
 * O foco pelo teclado abre e a saída do foco fecha. Toque só alterna.
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
  const balao = useRef<HTMLSpanElement>(null);
  const idBalao = useId();
  // O Esc devolve o foco ao botão; sem esta marca, o onFocus reabriria o balão que acabou de fechar.
  const devolvendoFoco = useRef(false);

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) {
        setAberto(false);
        setFixo(false);
      }
    }
    function tecla(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const estavaDentro = raiz.current?.contains(document.activeElement) ?? false;
      setAberto(false);
      setFixo(false);
      if (estavaDentro) {
        devolvendoFoco.current = true;
        botao.current?.focus();
        devolvendoFoco.current = false;
      }
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  // Mantém o balão inteiro dentro da viewport, qualquer que seja a posição do (i).
  // Mexe direto no estilo (sem estado) porque depende da medida do DOM já pintado.
  useLayoutEffect(() => {
    const b = balao.current;
    const btn = botao.current;
    if (!aberto || !b || !btn) return;
    b.style.transform = "";
    const margem = 8;
    const esquerda = btn.getBoundingClientRect().left;
    const largura = b.offsetWidth;
    const limite = document.documentElement.clientWidth;
    const deslocamento = Math.max(margem - esquerda, Math.min(0, limite - margem - (esquerda + largura)));
    if (deslocamento !== 0) b.style.transform = `translateX(${deslocamento}px)`;
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
      onBlur={(e) => {
        if (!raiz.current?.contains(e.relatedTarget as Node | null)) fechar();
      }}
    >
      <button
        ref={botao}
        type="button"
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={idBalao}
        onFocus={(e) => {
          // Só o foco de teclado abre (o clique e o toque também focam, e têm o onClick).
          if (!devolvendoFoco.current && e.currentTarget.matches(":focus-visible")) setAberto(true);
        }}
        onClick={() => {
          if (aberto && fixo) {
            fechar();
          } else {
            setAberto(true);
            setFixo(true);
          }
        }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-texto-secundario hover:text-texto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria"
      >
        <Info className="h-5 w-5" aria-hidden="true" />
      </button>
      {/* O pt-1 do contêiner é a ponte invisível entre o botão e o balão: o ponteiro não sai do componente. */}
      <span
        ref={balao}
        id={idBalao}
        tabIndex={-1}
        hidden={!aberto}
        className="absolute left-0 top-full z-20 w-[min(20rem,calc(100vw-1rem))] pt-1 outline-none"
      >
        <span className="block rounded-lg bg-superficie-invertida px-3.5 py-3 text-left text-sm font-normal not-italic leading-snug text-texto-invertido shadow-lg">
          {children}
          {manual && (
            <Link href={manual} className="mt-2 block font-semibold underline underline-offset-2">
              Ver no manual ›
            </Link>
          )}
        </span>
      </span>
    </span>
  );
}
