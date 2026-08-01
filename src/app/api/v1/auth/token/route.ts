import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { authenticateWithPassword } from "@/lib/auth-token";

/**
 * POST /api/v1/auth/token: login do aplicativo (email e senha), devolve o par
 * access + refresh.
 *
 * Roda sem sessão por natureza, como `/api/v1/password-reset/*`: é o passo que
 * cria a identidade. Não usa `guard()` (não há o que guardar ainda) e não
 * aplica o gate de sessão: quem tem senha temporária precisa autenticar para
 * conseguir trocá-la, e as rotas de negócio seguem barradas pelo `guard()`.
 *
 * Rate limit fica dentro de `authenticateWithPassword`, aplicado ANTES da
 * busca pelo usuário: a rota é pública e não pode diferenciar conta
 * inexistente de senha errada, nem pelo erro nem pelo tempo de resposta.
 */
const schema = z.object({
  email: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Informe email e senha", 422);
  }

  const result = await authenticateWithPassword(parsed.data.email, parsed.data.password);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
