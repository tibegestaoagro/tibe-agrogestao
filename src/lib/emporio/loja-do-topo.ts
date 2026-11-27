/**
 * A loja do topo do Empório (UX onda 6): a escolha vive num cookie, conferida no
 * servidor a cada leitura. Este arquivo é puro (sem `next/headers`), para o
 * componente de cliente e as suítes poderem importá-lo.
 */
export const LOJA_DO_TOPO_COOKIE = "tibe_emporio_loja";

/** As telas que filtram por loja e, por isso, obedecem ao seletor. Caminho exato: as fichas não entram. */
export const TELAS_COM_LOJA_NO_TOPO: readonly string[] = [
  "/emporio",
  "/emporio/vendas",
  "/emporio/orcamentos",
  "/emporio/fiado",
  "/emporio/estoque",
  "/emporio/compras",
  "/emporio/transferencias",
  "/emporio/financeiro",
  "/emporio/financeiro/receber",
  "/emporio/financeiro/pagar",
  "/emporio/estatisticas",
  "/emporio/historico",
];

/** O seletor aparece neste caminho? Barra final ignorada. */
export function seletorDeLojaVale(pathname: string): boolean {
  const limpo = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return TELAS_COM_LOJA_NO_TOPO.includes(limpo);
}

/** A loja valendo: a da URL vence a do cookie, e só vale id que esteja em `lojas`. Nada válido: "" (Todas). */
export function escolherLojaDoTopo(a: { daUrl?: string; doCookie?: string; lojas: { id: string }[] }): string {
  const vale = (id?: string) => !!id && a.lojas.some((l) => l.id === id);
  if (vale(a.daUrl)) return a.daUrl as string;
  if (vale(a.doCookie)) return a.doCookie as string;
  return "";
}
