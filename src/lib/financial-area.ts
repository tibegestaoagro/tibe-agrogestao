import type { Prisma } from "@/generated/prisma/client";
import { isFeatureVisibleForUser } from "@/lib/features";

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
 * Meu Empório, F5 (Q117): quem não vê o Empório tem a área forçada para
 * `fazenda`, sem erro e sem aviso. Pedir `emporio` vira `fazenda` para não
 * revelar que o recurso existe, e o "Tudo" dele é só a fazenda. Quem vê
 * mantém o pedido.
 */
export async function areaPermitida(
  user: { id: string; tenant_id: string },
  area: AreaFinanceira,
): Promise<AreaFinanceira> {
  if (area === "fazenda") return area;
  return (await isFeatureVisibleForUser(user.tenant_id, user.id, "emporio")) ? area : "fazenda";
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
