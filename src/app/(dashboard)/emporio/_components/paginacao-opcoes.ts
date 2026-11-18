export const TAMANHOS_DE_PAGINA = [20, 40, 80, 100] as const;

export const ORDENS_DO_ORCAMENTO = [
  { valor: "desc", rotulo: "Mais recentes primeiro" },
  { valor: "asc", rotulo: "Mais antigos primeiro" },
] as const;

/** Lê `pagina`, `por_pagina` e `ordem` da URL; valor inválido cai no padrão. */
export function lerPaginacaoDaUrl(url: { pagina?: string; por_pagina?: string; ordem?: string }): {
  pagina: number;
  porPagina: number;
  ordem: "asc" | "desc";
} {
  const { pagina = "", por_pagina = "", ordem = "" } = url;
  return {
    pagina: /^\d+$/.test(pagina) && Number(pagina) >= 1 ? Math.min(Number(pagina), 1_000_000) : 1,
    porPagina: TAMANHOS_DE_PAGINA.find((n) => String(n) === por_pagina) ?? 20,
    ordem: ordem === "asc" ? "asc" : "desc",
  };
}
