/**
 * Fora do componente client de propósito: uma constante exportada de um
 * arquivo "use client" chega ao servidor como referência, e `FUNCAO_ROTULO[x]`
 * na página devolveria `undefined`.
 */
export type FuncaoDaEquipe = "gerente_geral" | "gestor" | "vendedor";

export const FUNCAO_ROTULO: Record<FuncaoDaEquipe, string> = {
  gerente_geral: "Gerente geral",
  gestor: "Gestor",
  vendedor: "Vendedor",
};
