import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { appendToBuffer, flushBuffer } from "@/lib/actions/whatsapp-buffer";

/**
 * POST /api/internal/whatsapp/buffer (2026-07-30)
 *
 * Duas operações no mesmo endpoint, chamadas pelo n8n em volta de uma espera:
 * - `append`: guarda o fragmento e devolve o token desta execução.
 * - `flush`: se o token ainda for o último, devolve o texto concatenado; senão
 *   `ready: false`, e aquela execução deve encerrar sem responder.
 *
 * Autenticação por secret no header, como as outras rotas internas.
 */

const schema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("append"),
    phone: z.string().min(8),
    message_text: z.string().default(""),
  }),
  z.object({
    op: z.literal("flush"),
    phone: z.string().min(8),
    token: z.number().int().positive(),
  }),
]);

export async function POST(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Corpo inválido: informe op, phone e os campos da operação", 422);
  }

  if (parsed.data.op === "append") {
    const result = await appendToBuffer(parsed.data.phone, parsed.data.message_text);
    return apiOk(result);
  }

  const result = await flushBuffer(parsed.data.phone, parsed.data.token);
  return apiOk(result);
}
