import type { Prisma } from "@/generated/prisma/client";

/**
 * O Financeiro do Tibé é SÓ da fazenda (Empório, financeiro das lojas, Q222,
 * 07/11/2026). O Empório tem o seu em `/api/v1/emporio/finance`, com a conta
 * paga saindo de uma gaveta ou conta bancária (`CashMovement`).
 *
 * Antes disso o filtro "Fazenda / Empório / Tudo" (Q106, F4b) deixava o
 * lançamento do Empório aparecer aqui e ser pago sem mover dinheiro nenhum.
 *
 * O parâmetro `area` das seis rotas segue aceito para o contrato não quebrar
 * (cliente antigo, link de relatório já emitido), mas é IGNORADO: o filtro
 * devolve sempre a fazenda, qualquer que seja o pedido.
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

/** Sempre `fazenda`: o Financeiro do Tibé não tem mais outra área (Q222). */
export async function areaPermitida(
  _user: { id: string; tenant_id: string },
  _area: AreaFinanceira,
): Promise<AreaFinanceira> {
  return "fazenda";
}

/** Pedaço do `where` de `FinancialEntry`: sempre sem loja, com a fazenda escolhida quando houver. */
export function filtroDeArea(
  _area: AreaFinanceira | undefined,
  property_id?: string,
): Pick<Prisma.FinancialEntryWhereInput, "establishment_id" | "property_id"> {
  const propriedade = property_id ? { property_id } : {};
  return { establishment_id: null, ...propriedade };
}
