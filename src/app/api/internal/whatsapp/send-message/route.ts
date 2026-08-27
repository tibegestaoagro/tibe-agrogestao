import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";
import { withApi } from "@/lib/route";

/**
 * POST /api/internal/whatsapp/send-message (spec 2026-07-11): chamado pelo
 * N8N no lugar de falar direto com Meta/Evolution. O Tibé decide o provider
 * pela config do painel (troca 1-clique, sem mexer no N8N).
 */

const schema = z.object({
  to: z.string().trim().min(8),
  text: z.string().min(1),
});

async function POSTHandler(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await sendWhatsAppMessage(parsed.data.to, parsed.data.text);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
