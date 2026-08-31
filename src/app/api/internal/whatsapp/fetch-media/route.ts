import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { fetchEvolutionMediaBase64 } from "@/lib/whatsapp-media";
import { withApi } from "@/lib/route";

/**
 * POST /api/internal/whatsapp/fetch-media (spec 2026-07-28): chamado pelo N8N
 * quando uma mensagem de áudio/imagem/documento chega sem base64 inline no
 * webhook (comportamento inconsistente da Evolution API em produção: ver
 * src/lib/whatsapp-media.ts). Busca a mídia decriptada sob demanda.
 */

const schema = z.object({
  message_id: z.string().trim().min(1),
});

async function POSTHandler(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const result = await fetchEvolutionMediaBase64(parsed.data.message_id);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
