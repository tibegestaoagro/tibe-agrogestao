import crypto from "node:crypto";
import { apiError, ApiErrors } from "@/lib/api";

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

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
  if (!provided || !timingSafeEqualStr(provided, expected)) {
    return { error: apiError(...ApiErrors.UNAUTHORIZED) };
  }
  return { ok: true };
}

/**
 * Autenticação das rotas de Cron (`/api/internal/jobs/*`). A Vercel injeta
 * automaticamente `Authorization: Bearer <CRON_SECRET>` nas chamadas que ela
 * mesma faz para as rotas listadas em `vercel.json`: basta definir a env var
 * `CRON_SECRET` no projeto (local e na Vercel) com o mesmo valor.
 */
export function requireCronSecret(
  request: Request,
): { error: ReturnType<typeof apiError> } | { ok: true } {
  const auth = request.headers.get("authorization");
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return { error: apiError("SERVER_MISCONFIGURED", "CRON_SECRET não configurado", 500) };
  }
  if (!auth || !timingSafeEqualStr(auth, `Bearer ${expected}`)) {
    return { error: apiError(...ApiErrors.UNAUTHORIZED) };
  }
  return { ok: true };
}
