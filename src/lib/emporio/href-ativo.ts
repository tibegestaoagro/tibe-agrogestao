/**
 * Qual folha do menu acende para a rota. Pura, de propósito: o sidebar é client
 * e não pode importar o que arrasta `papel.ts`.
 *
 * Entre todas as folhas, só a de href mais específico que casa com a rota fica
 * ativa. `exact` só casa igual. Sem isso, "Hoje" (/emporio/financeiro) acendia
 * junto com "Projeção" (/emporio/financeiro/projecao).
 */
export function hrefAtivo(pathname: string, folhas: { href: string; exact?: boolean }[]): string | null {
  let melhor: string | null = null;
  for (const f of folhas) {
    const casa = f.exact ? pathname === f.href : pathname === f.href || pathname.startsWith(`${f.href}/`);
    if (casa && (melhor === null || f.href.length > melhor.length)) melhor = f.href;
  }
  return melhor;
}
