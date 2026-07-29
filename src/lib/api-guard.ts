import {
  getSessionUser,
  getTenantDb,
  getActiveProfiles,
  type SessionUser,
  type ProfileType,
} from "@/lib/tenant-context";
import { type TenantPrismaClient } from "@/lib/prisma";
import { apiError, ApiErrors } from "@/lib/api";
import { canAccess, canWrite, type ModuleKey } from "@/lib/permissions";
import { getBillingAccess } from "@/lib/billing-access";
import { requireSessionGateApi } from "@/lib/session-gate";

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
 * (`/api/v1/billing/*`): precisam continuar acessíveis mesmo com a conta
 * bloqueada, para o tenant conseguir regularizar.
 *
 * `must_change_password`/`plan_confirmed` (spec 2026-07-24/2026-07-27,
 * criação manual de tenant pelo painel) bloqueiam TODA ação aqui, sem
 * exceção, via `requireSessionGateApi()` (`session-gate.ts`, seam
 * compartilhado com o layout do dashboard e as páginas standalone
 * `trocar-senha`/`escolher-plano`/`onboarding`): diferente do billing, não
 * existe rota que precise ficar acessível nesses estados, porque
 * `POST /api/v1/auth/change-password` e `POST /api/v1/tenant/plan` (que os
 * resolvem) nunca passam por `guard()` (usam só `getSessionUser()`, de
 * propósito, pra funcionar mesmo com a conta em read_only/blocked). Sem
 * essa checagem aqui, o gate de página era só de UI: uma chamada direta à
 * API com a sessão da senha temporária/plano não confirmado ainda
 * funcionava.
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

  const gate = await requireSessionGateApi(user);
  if (gate) return gate;

  const db = await getTenantDb();

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
