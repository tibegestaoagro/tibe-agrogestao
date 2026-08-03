"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Estado mínimo de um dropdown (trigger + painel flutuante): fecha ao
 * clicar fora ou apertar Escape. Sem dependência do Radix (o registry do
 * shadcn gera classes `oklch(...)` incompatíveis com o Tailwind v3 deste
 * projeto, ver docs/design/briefing-novo-layout.md seção 3): componente
 * escrito à mão, mesmo padrão do resto de `src/components/ui`.
 */
export function useDropdown<T extends HTMLElement = HTMLDivElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
}
