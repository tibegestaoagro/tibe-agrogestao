import bcrypt from "bcryptjs";
import type { TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";

/**
 * Troca de senha pelo próprio usuário (spec 2026-07-24): usada no fluxo de
 * troca obrigatória no primeiro login (tenants criados manualmente pelo
 * painel). Zera must_change_password ao trocar.
 */
export async function changeOwnPasswordAction(
  db: TenantPrismaClient,
  userId: string,
  newPassword: string,
): Promise<ActionResult<{ id: string }>> {
  if (newPassword.length < 8) {
    return fail("VALIDATION_ERROR", "A senha deve ter ao menos 8 caracteres", 422);
  }
  const password_hash = await bcrypt.hash(newPassword, 10);
  const user = await db.user.update({
    where: { id: userId },
    data: { password_hash, must_change_password: false },
  });
  return ok({ id: user.id });
}
