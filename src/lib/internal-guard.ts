import { apiError, ApiErrors } from "@/lib/api";

/**
 * Autenticação de rotas internas (`/api/internal/*`) via secret no header,
 * não via sessão (PRD §10.3, mesmo padrão de `/api/webhooks/*`).
 * Usado pelo N8N para chamar resolve-contact e execute-action.
 */
export function requireInternalSecret(
  request: Request,
): { error: ReturnType<typeof apiError> } | { ok: true } {
  const provided = request.headers.get("x-internal-secret");
  const expected = process.env.INTERNAL_API_SECRET;
  if (!expected) {
    return { error: apiError("SERVER_MISCONFIGURED", "INTERNAL_API_SECRET não configurado", 500) };
  }
  if (!provided || provided !== expected) {
    return { error: apiError(...ApiErrors.UNAUTHORIZED) };
  }
  return { ok: true };
}
