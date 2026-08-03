/**
 * Rótulo de exibição de `RelatedModule` (Prisma), fonte única. Antes vivia
 * duplicado em `financeiro/page.tsx` e `generate-financial-pdf.ts`, cada um
 * com a própria cópia da lista, o mesmo padrão de gap que já fez `"maquinas"`
 * faltar em um dos dois no Módulo 26 (ver CLAUDE.md). Terceiro consumidor
 * (`/relatorios`, briefing de layout Fase 2) foi o motivo direto de
 * consolidar agora em vez de copiar de novo.
 */
export const MODULE_LABEL: Record<string, string> = {
  rebanho: "Rebanho",
  lavoura: "Lavoura",
  servico: "Prestador",
  maquinas: "Máquinas",
  geral: "Geral",
};
