import { fail, type ActionResult } from "@/lib/actions/types";
import type { TenantTransactionClient } from "@/lib/financial";
import type { AtorPapel } from "@/lib/emporio/papel";

/**
 * Meu Empório, entrega 2: em que turno cai um lançamento de dinheiro da gaveta.
 * Mora fora de `actions/` para o caixa (`emporio-caixa.ts`) e o turno
 * (`emporio-turno.ts`, que o reexporta) usarem a mesma regra sem um importar
 * o outro em círculo.
 */

export type TurnoResolvido = { id: string; cash_register_id: string };
export type RecusaDoTurno = Extract<ActionResult<never>, { ok: false }>;
export type ResultadoDoTurno = { ok: true; turno: TurnoResolvido | null } | RecusaDoTurno;

export const CAIXA_FECHADO = (): RecusaDoTurno =>
  fail("CASH_CLOSED", "Nenhum caixa aberto nesta loja. Abra o caixa com o troco inicial.", 409, "cash_register_id") as RecusaDoTurno;

export const ESCOLHA_O_CAIXA = (): RecusaDoTurno =>
  fail("CASH_REGISTER_REQUIRED", "Há mais de um caixa aberto. Escolha o caixa.", 422, "cash_register_id") as RecusaDoTurno;

/**
 * Com `pedido`, ele precisa ser um caixa da loja com turno aberto. Sem pedido:
 * nenhum aberto recusa (ou nulo em `se_houver`), um aberto é ele, vários
 * abertos é o que o ator abriu; sem esse (ou com mais de um dele), pede para
 * escolher (ou nulo em `se_houver`). Rode dentro da transação da escrita.
 */
export async function resolverTurno(
  tx: TenantTransactionClient,
  ator: AtorPapel,
  establishmentId: string,
  pedido: string | undefined,
  modo: "exige" | "se_houver",
): Promise<ResultadoDoTurno> {
  const abertos = await tx.cashSession.findMany({
    where: { establishment_id: establishmentId, open_register_id: { not: null } },
    select: { id: true, cash_register_id: true, opened_by_user_id: true },
    orderBy: { opened_at: "asc" },
  });
  const turno = (t: { id: string; cash_register_id: string }) => ({ ok: true as const, turno: { id: t.id, cash_register_id: t.cash_register_id } });
  if (pedido) {
    const t = abertos.find((a) => a.cash_register_id === pedido);
    return t ? turno(t) : CAIXA_FECHADO();
  }
  if (abertos.length === 0) return modo === "exige" ? CAIXA_FECHADO() : { ok: true, turno: null };
  if (abertos.length === 1) return turno(abertos[0]);
  const meus = abertos.filter((a) => a.opened_by_user_id === ator.id);
  if (meus.length === 1) return turno(meus[0]);
  return modo === "exige" ? ESCOLHA_O_CAIXA() : { ok: true, turno: null };
}
