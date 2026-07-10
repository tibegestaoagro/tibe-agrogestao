import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import type { PlatformSessionRole } from "@/types/next-auth";

/**
 * Gestão da equipe da plataforma (Módulo 6, task 6.10) — só master_admin.
 * Mesmo padrão de src/lib/actions/users.ts (convite com senha temporária
 * exibida uma única vez; sem infra de email no projeto).
 */

function generateTempPassword(): string {
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}

export async function inviteTeamMemberAction(input: {
  name: string;
  email: string;
  role: PlatformSessionRole;
}): Promise<ActionResult<{ id: string; temp_password: string }>> {
  const existing = await prisma.platformUser.findUnique({ where: { email: input.email } });
  if (existing) {
    return fail("DUPLICATE_EMAIL", "Já existe um membro da equipe com esse email", 409);
  }

  const temp_password = generateTempPassword();
  const password_hash = await bcrypt.hash(temp_password, 10);

  const member = await prisma.platformUser.create({
    data: { name: input.name, email: input.email, role: input.role, password_hash },
  });

  return ok({ id: member.id, temp_password });
}

export async function updateTeamMemberRoleAction(
  memberId: string,
  role: PlatformSessionRole,
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.platformUser.findUnique({ where: { id: memberId } });
  if (!existing) return fail("NOT_FOUND", "Membro não encontrado", 404);

  await prisma.platformUser.update({ where: { id: memberId }, data: { role } });
  return ok({ id: memberId });
}

export async function setTeamMemberActiveAction(
  memberId: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  const existing = await prisma.platformUser.findUnique({ where: { id: memberId } });
  if (!existing) return fail("NOT_FOUND", "Membro não encontrado", 404);

  await prisma.platformUser.update({ where: { id: memberId }, data: { active } });
  return ok({ id: memberId });
}
