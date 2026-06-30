import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/tenant-context";
import type { AppUserRole } from "@/types/next-auth";

/**
 * Sistema de roles e permissões (PRD seção 5, spec task 0.6).
 * Matriz de acesso por módulo derivada da tabela 5.2 do PRD.
 */

export type ModuleKey =
  | "rebanho"
  | "lavoura"
  | "prestador"
  | "financeiro"
  | "alertas"
  | "usuarios"
  | "assinatura";

export type AccessLevel = "none" | "read" | "write";

const W: AccessLevel = "write";
const R: AccessLevel = "read";
const N: AccessLevel = "none";

// PRD 5.2 — linhas = módulos, colunas = roles.
const ACCESS_MATRIX: Record<ModuleKey, Record<AppUserRole, AccessLevel>> = {
  rebanho: { OWNER: W, ADMIN: W, OPERADOR: W, VISUALIZADOR: R },
  lavoura: { OWNER: W, ADMIN: W, OPERADOR: W, VISUALIZADOR: R },
  prestador: { OWNER: W, ADMIN: W, OPERADOR: W, VISUALIZADOR: R },
  financeiro: { OWNER: W, ADMIN: W, OPERADOR: W, VISUALIZADOR: R },
  alertas: { OWNER: W, ADMIN: W, OPERADOR: R, VISUALIZADOR: R },
  usuarios: { OWNER: W, ADMIN: W, OPERADOR: N, VISUALIZADOR: N },
  assinatura: { OWNER: W, ADMIN: N, OPERADOR: N, VISUALIZADOR: N },
};

/** Nível de acesso de uma role a um módulo. */
export function getAccessLevel(role: AppUserRole, module: ModuleKey): AccessLevel {
  return ACCESS_MATRIX[module][role];
}

/** True se a role tem qualquer acesso (leitura ou escrita) ao módulo. */
export function canAccess(role: AppUserRole, module: ModuleKey): boolean {
  return getAccessLevel(role, module) !== "none";
}

/** True se a role pode escrever (criar/editar/deletar) no módulo. */
export function canWrite(role: AppUserRole, module: ModuleKey): boolean {
  return getAccessLevel(role, module) === "write";
}

// Hierarquia de roles para checagens por "role mínima".
const ROLE_RANK: Record<AppUserRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  OPERADOR: 2,
  VISUALIZADOR: 1,
};

/** True se `role` é igual ou superior a `minRole` na hierarquia. */
export function hasMinRole(role: AppUserRole, minRole: AppUserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/**
 * Guard para Server Actions / Server Components: exige uma das roles informadas.
 * Lança erro se a sessão não atende — capture e trate conforme o contexto.
 */
export async function requireRole(
  allowed: AppUserRole | AppUserRole[],
): Promise<{ id: string; tenant_id: string; role: AppUserRole }> {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHORIZED");
  const list = Array.isArray(allowed) ? allowed : [allowed];
  if (!list.includes(user.role)) throw new Error("FORBIDDEN");
  return { id: user.id, tenant_id: user.tenant_id, role: user.role };
}

/**
 * Guard de rota (Server Component): redireciona para o dashboard se o usuário não
 * tem o acesso exigido ao módulo. Implementa o "redirecionamento automático quando
 * usuário tenta acessar rota sem permissão" (spec task 0.6).
 */
export async function requireModuleAccess(
  module: ModuleKey,
  action: "read" | "write" = "read",
  redirectTo = "/dashboard",
): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const level = getAccessLevel(user!.role, module);
  const allowed =
    action === "read" ? level !== "none" : level === "write";
  if (!allowed) redirect(redirectTo);
}
