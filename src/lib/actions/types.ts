/**
 * Resultado padrão das funções de "action" em src/lib/actions/*.
 * Reusado tanto pelas rotas HTTP (traduzido para apiOk/apiError) quanto pelo
 * endpoint interno do agente WhatsApp (traduzido para reply_text em português).
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; status: number };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string, status = 422): ActionResult<never> {
  return { ok: false, code, message, status };
}
