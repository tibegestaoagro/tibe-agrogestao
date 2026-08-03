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

/**
 * Troca VOLUNTÁRIA de senha, pelo próprio usuário já logado (Módulo 19).
 *
 * Aqui a senha atual é exigida, ao contrário da troca obrigatória: o cenário é
 * outro. Na obrigatória, o usuário acabou de provar posse dos canais (cadastro
 * verificado) ou digitou a temporária no login, então pedir de novo seria a
 * mesma prova duas vezes. Aqui a sessão pode estar aberta num computador
 * destravado, e é justamente disso que o campo protege.
 */
export async function changeOwnPasswordWithCurrentAction(
  db: TenantPrismaClient,
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ActionResult<{ id: string }>> {
  const user = await db.user.findFirst({ where: { id: userId } });
  if (!user) return fail("NOT_FOUND", "Usuário não encontrado", 404);

  const matches = await bcrypt.compare(currentPassword, user.password_hash);
  if (!matches) return fail("INVALID_PASSWORD", "Senha atual incorreta", 422);

  const strength = isStrongPassword(newPassword);
  if (!strength.ok) return fail("VALIDATION_ERROR", strength.message, 422);

  const password_hash = await bcrypt.hash(newPassword, 10);
  await db.user.update({
    where: { id: userId },
    data: { password_hash, must_change_password: false },
  });
  return ok({ id: userId });
}

/**
 * Renomeia o próprio usuário (briefing de layout, menu "Perfil" do topo).
 * Só o nome: email é o identificador de login (globalmente único, spec
 * 0.6) e trocar exigiria reverificação, fora de escopo aqui.
 */
export async function updateOwnNameAction(
  db: TenantPrismaClient,
  userId: string,
  name: string,
): Promise<ActionResult<{ id: string; name: string }>> {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return fail("VALIDATION_ERROR", "Informe um nome com pelo menos 2 caracteres", 422);
  }
  const user = await db.user.update({ where: { id: userId }, data: { name: trimmed } });
  return ok({ id: user.id, name: user.name });
}
