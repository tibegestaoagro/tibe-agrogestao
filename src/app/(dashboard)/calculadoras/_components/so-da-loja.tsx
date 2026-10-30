"use client";

import { createContext, useContext } from "react";

/**
 * F6b (Q120): quem é só da loja não tem a Lista de Compra, então a calculadora
 * não oferece mandar o material para ela. A decisão é tomada no servidor (o
 * papel sai do banco, nunca do navegador) e desce por aqui, porque as 23
 * calculadoras são client e o `papel.ts` não pode ser importado por elas.
 */
const SoDaLojaContext = createContext(false);

export function SoDaLojaProvider({ valor, children }: { valor: boolean; children: React.ReactNode }) {
  return <SoDaLojaContext.Provider value={valor}>{children}</SoDaLojaContext.Provider>;
}

export function useSoDaLoja(): boolean {
  return useContext(SoDaLojaContext);
}
