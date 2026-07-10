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
import { getBillingAccess } from "@/lib/billing-access";

/**
 * Guarda padrão para rotas de API de negócio: valida sessão, permissão por módulo
 * (PRD 5.2), status de cobrança (spec 5.7/5.8) e devolve o client escopado ao
 * tenant. Em falha, retorna `{ error }` com a Response pronta no formato do
 * contrato.
 *
 * Uso:
 *   const g = await guard("rebanho", "write");
 *   if ("error" in g) return g.error;
 *   const { db, user } = g;
 *
 * `skipBillingCheck: true` é só para as próprias rotas de billing
 * (`/api/v1/billing/*`) — precisam continuar acessíveis mesmo com a conta
 * bloqueada, para o tenant conseguir regularizar.
 */
export async function guard(
  module: ModuleKey,
  action: "read" | "write",
  opts?: { profile?: ProfileType; skipBillingCheck?: boolean },
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

  if (!opts?.skipBillingCheck) {
    const access = await getBillingAccess(user.tenant_id);
    if (access === "blocked") {
      return {
        error: apiError(
          "SUBSCRIPTION_BLOCKED",
          "Acesso bloqueado por pendência de pagamento. Regularize a assinatura para continuar.",
          402,
        ),
      };
    }
    if (access === "read_only" && action === "write") {
      return {
        error: apiError(
          "SUBSCRIPTION_READ_ONLY",
          "Pagamento em atraso: apenas leitura liberada até a regularização.",
          402,
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
