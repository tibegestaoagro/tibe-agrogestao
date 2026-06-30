import {
  getSessionUser,
  getTenantDb,
  getActiveProfiles,
  type SessionUser,
  type ProfileType,
} from "@/lib/tenant-context";
import type { TenantPrismaClient } from "@/lib/prisma";
import { apiError, ApiErrors } from "@/lib/api";
import { canAccess, canWrite, type ModuleKey } from "@/lib/permissions";

/**
 * Guarda padrão para rotas de API de negócio: valida sessão, permissão por módulo
 * (PRD 5.2) e devolve o client escopado ao tenant. Em falha, retorna `{ error }`
 * com a Response pronta no formato do contrato.
 *
 * Uso:
 *   const g = await guard("rebanho", "write");
 *   if ("error" in g) return g.error;
 *   const { db, user } = g;
 */
export async function guard(
  module: ModuleKey,
  action: "read" | "write",
  opts?: { profile?: ProfileType },
): Promise<
  | { error: ReturnType<typeof apiError> }
  | { user: SessionUser; db: TenantPrismaClient }
> {
  const user = await getSessionUser();
  if (!user) return { error: apiError(...ApiErrors.UNAUTHORIZED) };

  const ok =
    action === "write" ? canWrite(user.role, module) : canAccess(user.role, module);
  if (!ok) return { error: apiError(...ApiErrors.FORBIDDEN) };

  // Exige perfil ativo (ex: fazenda) também na API, não só na UI.
  if (opts?.profile) {
    const profiles = await getActiveProfiles();
    if (!profiles.includes(opts.profile)) {
      return {
        error: apiError(
          "PROFILE_INACTIVE",
          `Perfil '${opts.profile}' não está ativo para este tenant`,
          403,
        ),
      };
    }
  }

  const db = await getTenantDb();
  return { user, db };
}

/** Lê e valida o corpo JSON; retorna `{ json }` ou `{ error }`. */
export async function readJson(
  request: Request,
): Promise<{ json: unknown } | { error: ReturnType<typeof apiError> }> {
  try {
    return { json: await request.json() };
  } catch {
    return { error: apiError("INVALID_JSON", "Corpo da requisição inválido", 400) };
  }
}
