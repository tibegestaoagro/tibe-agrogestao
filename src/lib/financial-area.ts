import type { Prisma } from "@/generated/prisma/client";

/**
 * Meu Empório, F4b (Q106): o filtro "Fazenda / Empório / Tudo" do Financeiro.
 *
 * `emporio` é o lançamento com `establishment_id`; `fazenda` é o que não tem;
 * `tudo` não filtra nada (o comportamento de antes do filtro existir).
 */

export const AREAS_FINANCEIRAS = ["fazenda", "emporio", "tudo"] as const;
export type AreaFinanceira = (typeof AREAS_FINANCEIRAS)[number];

export const AREA_INVALIDA = "Escolha Fazenda, Empório ou Tudo.";

/** Ausente ou vazio vira `tudo`; qualquer outro valor fora da lista dá `null` (a rota responde 422 `area`). */
export function lerArea(valor: unknown): AreaFinanceira | null {
  if (valor === undefined || valor === null || valor === "") return "tudo";
  return typeof valor === "string" && (AREAS_FINANCEIRAS as readonly string[]).includes(valor)
    ? (valor as AreaFinanceira)
    : null;
}

/**
 * Pedaço do `where` de `FinancialEntry` para a área. Com `emporio` a fazenda
 * escolhida é ignorada: lançamento do Empório nunca tem propriedade, e filtrar
 * por ela esvaziaria a lista.
 */
export function filtroDeArea(
  area: AreaFinanceira | undefined,
  property_id?: string,
): Pick<Prisma.FinancialEntryWhereInput, "establishment_id" | "property_id"> {
  const propriedade = area !== "emporio" && property_id ? { property_id } : {};
  if (area === "emporio") return { establishment_id: { not: null } };
  if (area === "fazenda") return { establishment_id: null, ...propriedade };
  return propriedade;
}
