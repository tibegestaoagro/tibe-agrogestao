import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { fetchEvolutionMediaBase64 } from "@/lib/whatsapp-media";

/**
 * POST /api/internal/whatsapp/fetch-media (spec 2026-07-28): chamado pelo N8N
 * quando uma mensagem de áudio/imagem/documento chega sem base64 inline no
 * webhook (comportamento inconsistente da Evolution API em produção: ver
 * src/lib/whatsapp-media.ts). Busca a mídia decriptada sob demanda.
 */

const schema = z.object({
  message_id: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await fetchEvolutionMediaBase64(parsed.data.message_id);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
