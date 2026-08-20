import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { saveSubscription, removeSubscription } from "@/lib/notify";
import { withApi } from "@/lib/route";

/**
 * POST   /api/v1/notifications/subscribe: registra a inscrição de push do
 *        aparelho atual para o usuário autenticado (Onda 2).
 * DELETE /api/v1/notifications/subscribe: cancela a inscrição pelo endpoint.
 *
 * Gate por "alertas"+"read": ativar/desativar notificação é preferência
 * pessoal de QUALQUER papel que recebe alerta (inclusive VISUALIZADOR), não
 * uma ação de escrita de dado de negócio. Não existe ModuleKey "notificacoes"
 * na matriz de permissões (PRD 5.2, src/lib/permissions.ts); criar um
 * exigiria editar esse arquivo, fora do escopo deste agente (ver briefing da
 * Onda 2). "alertas" é o módulo mais próximo do propósito e o único que
 * todo papel acessa em modo leitura.
 */
const subscribeSchema = z.object({
  endpoint: z.string().trim().min(1),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1),
});

async function POSTHandler(request: Request) {
  const g = await guard("alertas", "read");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = subscribeSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await saveSubscription({
    tenant_id: g.user.tenant_id,
    user_id: g.user.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  return apiOk({ subscribed: true }, {}, { status: 201 });
}

async function DELETEHandler(request: Request) {
  const g = await guard("alertas", "read");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = unsubscribeSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  await removeSubscription({
    tenant_id: g.user.tenant_id,
    user_id: g.user.id,
    endpoint: parsed.data.endpoint,
  });

  return apiOk({ unsubscribed: true });
}

export const POST = withApi(POSTHandler);
export const DELETE = withApi(DELETEHandler);
