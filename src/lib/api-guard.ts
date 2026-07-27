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
 *
 * `must_change_password` (spec 2026-07-24, criação manual de tenant pelo
 * painel) bloqueia TODA ação aqui, sem exceção — diferente do billing, não
 * existe rota que precise ficar acessível nesse estado, porque
 * `POST /api/v1/auth/change-password` nunca passa por `guard()` (usa só
 * `getSessionUser()`, de propósito, pra funcionar mesmo com a conta em
 * read_only/blocked). Sem essa checagem aqui, o gate de página
 * (`/trocar-senha`) era só de UI — uma chamada direta à API com a sessão da
 * senha temporária ainda funcionava.
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

  const db = await getTenantDb();

  const dbUser = await db.user.findFirst({
    where: { id: user.id },
    select: { must_change_password: true },
  });
  if (dbUser?.must_change_password) {
    return {
      error: apiError(
        "MUST_CHANGE_PASSWORD",
        "Troque sua senha temporária antes de continuar (acesse /trocar-senha).",
        403,
      ),
    };
  }

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
