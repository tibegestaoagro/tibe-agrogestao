import { prisma, type TenantPrismaClient } from "@/lib/prisma";
import { PLAN_SEATS } from "@/lib/asaas";

/**
 * Limite de assentos por plano (decisão 2026-07-30).
 *
 * Semântica fechada com o usuário, e as três regras existem por um motivo:
 * 1. O Owner ocupa um assento: plano campo (1) significa uso individual.
 * 2. Usuário desativado NÃO ocupa assento: desativar libera a vaga, então
 *    trocar de funcionário não força upgrade de plano.
 * 3. O limite NUNCA desativa ninguém retroativamente. Um tenant que já tem
 *    mais usuários que o plano permite (downgrade, dado antigo) mantém todo
 *    mundo funcionando; o bloqueio vale só para convite novo e reativação.
 *    Cortar acesso sozinho por mudança de plano tiraria do cliente o acesso
 *    aos próprios dados, sem ele ter feito nada.
 *
 * O `tenantId` é sempre resolvido da sessão pelo caller e nunca vem do client,
 * mesmo contrato de `getBillingAccess()`: o plano mora em `Tenant`, que não é
 * um modelo escopado (é o próprio tenant), então precisa do client base.
 */

export type SeatUsage = {
  used: number;
  limit: number;
  has_room: boolean;
};

export async function getSeatUsage(
  db: TenantPrismaClient,
  tenantId: string,
): Promise<SeatUsage> {
  const [tenant, used] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } }),
    db.user.count({ where: { active: true } }),
  ]);

  const limit = tenant ? PLAN_SEATS[tenant.plan] : 0;
  return { used, limit, has_room: used < limit };
}

/** Mensagem de erro que nomeia plano e limite, em vez de um "não permitido" seco. */
export function seatLimitMessage(plan: string, limit: number): string {
  const usuarios = limit === 1 ? "1 usuário ativo" : `${limit} usuários ativos`;
  return `Seu plano ${plan} permite ${usuarios} e o limite já foi atingido. Desative um usuário existente ou faça upgrade do plano.`;
}

/**
 * Checagem usada nos dois pontos de entrada (convite novo e reativação).
 * Devolve `null` quando há vaga; senão, a mensagem pronta para o erro.
 */
export async function checkSeatAvailable(
  db: TenantPrismaClient,
  tenantId: string,
): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });
  if (!tenant) return "Empresa não encontrada";

  const limit = PLAN_SEATS[tenant.plan];
  const used = await db.user.count({ where: { active: true } });
  if (used < limit) return null;

  return seatLimitMessage(tenant.plan, limit);
}
