import bcrypt from "bcryptjs";
import { scoped, prisma, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { generateTempPassword } from "@/lib/passwords";
import { toBrazilPhoneDigits } from "@/lib/phone";
import { checkSeatAvailable } from "@/lib/seats";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Gestão de usuários do tenant (spec 5.2). Convite gera senha temporária
 * (não há serviço de email neste projeto: ver CLAUDE.md) exibida uma única
 * vez para o convidante repassar manualmente.
 */

export async function inviteUserAction(
  db: TenantPrismaClient,
  tenantId: string,
  input: { name: string; email: string; phone?: string | null; role: AppUserRole },
): Promise<ActionResult<{ id: string; temp_password: string }>> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    return fail("DUPLICATE_EMAIL", "Já existe um usuário com esse email", 409);
  }

  // Limite de assentos do plano (2026-07-30), checado DEPOIS da duplicidade
  // de propósito: se o email já existe e o plano está cheio, responder
  // "faça upgrade" mandaria o cliente pagar por um problema que não é esse.
  const seatError = await checkSeatAvailable(db, tenantId);
  if (seatError) return fail("SEAT_LIMIT_REACHED", seatError, 422);

  const temp_password = generateTempPassword();
  const password_hash = await bcrypt.hash(temp_password, 10);

  const user = await db.user.create({
    data: scoped({
      name: input.name,
      email: input.email,
      phone: input.phone ? toBrazilPhoneDigits(input.phone) : null,
      role: input.role,
      password_hash,
    }),
  });

  return ok({ id: user.id, temp_password });
}

export async function updateUserRoleAction(
  db: TenantPrismaClient,
  userId: string,
  role: AppUserRole,
): Promise<ActionResult<{ id: string }>> {
  const existing = await db.user.findFirst({ where: { id: userId } });
  if (!existing) return fail("NOT_FOUND", "Usuário não encontrado", 404);

  await db.user.update({ where: { id: userId }, data: { role } });
  return ok({ id: userId });
}

export async function setUserActiveAction(
  db: TenantPrismaClient,
  tenantId: string,
  userId: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  const existing = await db.user.findFirst({ where: { id: userId } });
  if (!existing) return fail("NOT_FOUND", "Usuário não encontrado", 404);
  if (existing.role === "OWNER" && !active) {
    return fail("CANNOT_DEACTIVATE_OWNER", "O Owner não pode ser desativado", 422);
  }

  // Reativar ocupa um assento; desativar sempre é permitido (libera vaga).
  // Reativar quem já está ativo não consome nada, então não é bloqueado:
  // sem essa guarda, um tenant no limite não conseguiria nem repetir a
  // operação que já está valendo.
  if (active && !existing.active) {
    const seatError = await checkSeatAvailable(db, tenantId);
    if (seatError) return fail("SEAT_LIMIT_REACHED", seatError, 422);
  }

  await db.user.update({ where: { id: userId }, data: { active } });
  return ok({ id: userId });
}
