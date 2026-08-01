import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { rotateRefreshToken } from "@/lib/auth-token";

/**
 * POST /api/v1/auth/token/refresh: troca um refresh token por um par novo.
 *
 * Uso único com rotação: o token apresentado é invalidado no mesmo passo em
 * que o novo é emitido. Apresentar de novo um refresh já usado devolve o mesmo
 * `INVALID_REFRESH_TOKEN` de um token inexistente, expirado ou revogado: nada
 * aqui distingue os casos para quem chama.
 */
const schema = z.object({ refresh_token: z.string().min(1) });

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Informe o refresh_token", 422);
  }

  const pair = await rotateRefreshToken(parsed.data.refresh_token);
  if (!pair) {
    return apiError(
      "INVALID_REFRESH_TOKEN",
      "Sessão expirada. Entre novamente com email e senha.",
      401,
    );
  }
  return apiOk(pair);
}
