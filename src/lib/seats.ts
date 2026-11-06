import { prisma, type TenantPrismaClient } from "@/lib/prisma";
import { PLAN_SEATS } from "@/lib/asaas";

/**
 * Dois limites de assentos, contados separados (Q190, decisão de 06/11/2026).
 *
 * - **plano**: os usuários do Tibé, quem NÃO tem função no Empório (o Dono
 *   entra aqui). Limite do plano: `PLAN_SEATS` (campo 1, fazenda 2, grupo 5).
 * - **emporio**: a equipe do Empório, quem tem `emporio_role` preenchido
 *   (gerente geral, gestor, vendedor, caixa). Limite `EMPORIO_SEATS`, igual em
 *   toda conta. Quem é da equipe não ocupa assento do plano, e o inverso.
 *
 * As três regras da decisão de 30/07/2026 valem nos dois limites:
 * 1. O Owner ocupa um assento do plano: plano campo (1) significa uso individual.
 * 2. Usuário desativado NÃO ocupa assento: desativar libera a vaga, então
 *    trocar de funcionário não força upgrade de plano.
 * 3. O limite NUNCA desativa ninguém retroativamente. Uma conta que já tem
 *    mais usuários que o limite (downgrade, dado antigo) mantém todo mundo
 *    funcionando; o bloqueio vale só para cadastro novo e reativação.
 *    Cortar acesso sozinho por mudança de plano tiraria do cliente o acesso
 *    aos próprios dados, sem ele ter feito nada.
 *
 * O `tenantId` é sempre resolvido da sessão pelo caller e nunca vem do client,
 * mesmo contrato de `getBillingAccess()`: o plano mora em `Tenant`, que não é
 * um modelo escopado (é o próprio tenant), então precisa do client base.
 */

export const EMPORIO_SEATS = 50;

/** Qual dos dois limites: o do plano (usuários do Tibé) ou o da equipe do Empório. */
export type QualLimite = "plano" | "emporio";

export type SeatUsage = {
  used: number;
  limit: number;
  has_room: boolean;
};

function contarAtivos(db: TenantPrismaClient, limite: QualLimite): Promise<number> {
  return db.user.count({
    where: { active: true, emporio_role: limite === "emporio" ? { not: null } : null },
  });
}

export async function getSeatUsage(
  db: TenantPrismaClient,
  tenantId: string,
  limite: QualLimite = "plano",
): Promise<SeatUsage> {
  if (limite === "emporio") {
    const used = await contarAtivos(db, "emporio");
    return { used, limit: EMPORIO_SEATS, has_room: used < EMPORIO_SEATS };
  }

  const [tenant, used] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } }),
    contarAtivos(db, "plano"),
  ]);

  const limit = tenant ? PLAN_SEATS[tenant.plan] : 0;
  return { used, limit, has_room: used < limit };
}

/** Mensagem de erro que nomeia plano e limite, em vez de um "não permitido" seco. */
function seatLimitMessage(plan: string, limit: number): string {
  const usuarios = limit === 1 ? "1 usuário ativo" : `${limit} usuários ativos`;
  return `Seu plano ${plan} permite ${usuarios} e o limite já foi atingido. Desative um usuário existente ou faça upgrade do plano.`;
}

const MENSAGEM_DO_EMPORIO =
  `A equipe do Empório já tem ${EMPORIO_SEATS} pessoas ativas, o limite. ` +
  "Desative alguém da equipe para cadastrar ou reativar outra pessoa.";

/**
 * Checagem usada nos pontos de entrada (cadastro novo e reativação), no
 * limite pedido. Devolve `null` quando há vaga; senão, a mensagem pronta.
 */
export async function checkSeatAvailable(
  db: TenantPrismaClient,
  tenantId: string,
  limite: QualLimite = "plano",
): Promise<string | null> {
  if (limite === "emporio") {
    const used = await contarAtivos(db, "emporio");
    return used < EMPORIO_SEATS ? null : MENSAGEM_DO_EMPORIO;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });
  if (!tenant) return "Empresa não encontrada";

  const limit = PLAN_SEATS[tenant.plan];
  const used = await contarAtivos(db, "plano");
  if (used < limit) return null;

  return seatLimitMessage(tenant.plan, limit);
}
