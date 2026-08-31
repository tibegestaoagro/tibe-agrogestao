import { RelatedModule } from "@/generated/prisma/enums";

/**
 * Rótulo de exibição de `RelatedModule` (Prisma), fonte única. Antes vivia
 * duplicado em `financeiro/page.tsx` e `generate-financial-pdf.ts`, cada um
 * com a própria cópia da lista, o mesmo padrão de gap que já fez `"maquinas"`
 * faltar em um dos dois no Módulo 26 (ver CLAUDE.md). Terceiro consumidor
 * (`/relatorios`, briefing de layout Fase 2) foi o motivo direto de
 * consolidar agora em vez de copiar de novo.
 *
 * `Record<RelatedModule, string>` (não `Record<string, string>`): quando o
 * enum ganha um valor novo (caso `confinamento`, 2026-08-31, T02), o `tsc`
 * acusa a linha que falta em vez de deixar o rótulo sair em branco em
 * silêncio. Foi exatamente essa lacuna que o T02 deixou passar.
 */
export const MODULE_LABEL: Record<RelatedModule, string> = {
  rebanho: "Rebanho",
  lavoura: "Lavoura",
  servico: "Prestador",
  maquinas: "Máquinas",
  geral: "Geral",
  confinamento: "Confinamento",
};

/**
 * Lista dos valores do enum, na ordem declarada no schema: derivada das
 * chaves de `MODULE_LABEL` (que por sua vez o `tsc` obriga a cobrir todo o
 * enum), em vez de manter um segundo `as const` paralelo que também pode
 * ficar para trás.
 */
export const RELATED_MODULES = Object.keys(MODULE_LABEL) as RelatedModule[];
