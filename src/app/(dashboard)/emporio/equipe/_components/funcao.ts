/**
 * Fora do componente client de propósito: uma constante exportada de um
 * arquivo "use client" chega ao servidor como referência, e `FUNCAO_ROTULO[x]`
 * na página devolveria `undefined`.
 */
export type FuncaoDaEquipe = "gerente_geral" | "financeiro" | "gestor" | "vendedor" | "caixa";

export const FUNCAO_ROTULO: Record<FuncaoDaEquipe, string> = {
  gerente_geral: "Gerente geral",
  financeiro: "Financeiro",
  gestor: "Gestor",
  vendedor: "Vendedor",
  caixa: "Caixa",
};

/** Funções que valem para todas as lojas e não escolhem loja. */
export const FUNCAO_DE_TODAS_AS_LOJAS: readonly FuncaoDaEquipe[] = ["gerente_geral", "financeiro"];

export const FUNCAO_DESCRICAO: Partial<Record<FuncaoDaEquipe, string>> = {
  financeiro:
    "Cuida do dinheiro de todas as lojas: paga, recebe, concilia e cobra. Não vende nem mexe em catálogo ou equipe.",
};
