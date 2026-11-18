"use client";

import { useEffect, useRef } from "react";

/**
 * Abre o diálogo de impressão do navegador quando a página carrega (as
 * etiquetas vêm de uma tela de escolha: quem chegou aqui já pediu para imprimir).
 * O adiamento deixa as barras e a fonte pintarem antes do diálogo; a marca
 * é gravada só quando o diálogo abre, para o modo estrito do React em
 * desenvolvimento (monta, desmonta e monta de novo) abrir uma vez só.
 */
export function AbrirImpressao() {
  const aberto = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (aberto.current) return;
      aberto.current = true;
      window.print();
    }, 400);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
