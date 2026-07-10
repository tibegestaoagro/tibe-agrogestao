import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { scoped, prisma, type TenantPrismaClient } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Gestão de usuários do tenant (spec 5.2). Convite gera senha temporária
 * (não há serviço de email neste projeto — ver CLAUDE.md) exibida uma única
 * vez para o convidante repassar manualmente.
 */

function generateTempPassword(): string {
  // 10 caracteres alfanuméricos, fáceis de digitar/ditar por telefone.
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}

export async function inviteUserAction(
  db: TenantPrismaClient,
  input: { name: string; email: string; phone?: string | null; role: AppUserRole },
): Promise<ActionResult<{ id: string; temp_password: string }>> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    return fail("DUPLICATE_EMAIL", "Já existe um usuário com esse email", 409);
  }

  const temp_password = generateTempPassword();
  const password_hash = await bcrypt.hash(temp_password, 10);

  const user = await db.user.create({
    data: scoped({
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
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
  userId: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  const existing = await db.user.findFirst({ where: { id: userId } });
  if (!existing) return fail("NOT_FOUND", "Usuário não encontrado", 404);
  if (existing.role === "OWNER" && !active) {
    return fail("CANNOT_DEACTIVATE_OWNER", "O Owner não pode ser desativado", 422);
  }

  await db.user.update({ where: { id: userId }, data: { active } });
  return ok({ id: userId });
}
