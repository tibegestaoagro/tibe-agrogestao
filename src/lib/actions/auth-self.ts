import bcrypt from "bcryptjs";
import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { isStrongPassword } from "@/lib/passwords";

/**
 * Troca de senha pelo próprio usuário (spec 2026-07-24): usada no fluxo de
 * troca obrigatória no primeiro login (tenants criados manualmente pelo
 * painel). Zera must_change_password ao trocar. Regra de senha forte
 * (arquitetura 2026-07-29): mesma exigida na recuperação de senha, não faz
 * sentido a troca obrigatória aceitar uma senha mais fraca que o reset.
 */
export async function changeOwnPasswordAction(
  db: TenantPrismaClient,
  userId: string,
  newPassword: string,
): Promise<ActionResult<{ id: string }>> {
  const strength = isStrongPassword(newPassword);
  if (!strength.ok) {
    return fail("VALIDATION_ERROR", strength.message, 422);
  }
  const password_hash = await bcrypt.hash(newPassword, 10);
  const user = await db.user.update({
    where: { id: userId },
    data: { password_hash, must_change_password: false },
  });
  return ok({ id: user.id });
}
