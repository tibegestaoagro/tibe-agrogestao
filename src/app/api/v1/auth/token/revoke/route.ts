import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { revokeRefreshToken } from "@/lib/auth-token";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/auth/token/revoke: logout do aplicativo.
 *
 * Responde `{ revoked: true }` sempre que o formato do corpo é válido, tenha
 * ou não existido uma linha viva para revogar. Diferenciar os casos daria a
 * quem tem uma lista de tokens roubados um jeito barato de saber quais ainda
 * valem, sem nenhum ganho para o cliente honesto (que só quer sair).
 *
 * O access token já emitido continua valendo até expirar (15 minutos). Revogar
 * um JWT de vida curta exigiria consultar uma lista de bloqueio a cada
 * requisição, custo que a janela curta já torna desnecessário.
 */
const schema = z.object({ refresh_token: z.string().min(1) });

async function POSTHandler(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Informe o refresh_token", 422);
  }

  await revokeRefreshToken(parsed.data.refresh_token);
  return apiOk({ revoked: true });
}

export const POST = withApi(POSTHandler);
