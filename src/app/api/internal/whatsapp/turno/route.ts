import { z } from "zod";
import { apiOk, apiErroDeZod } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { withApi } from "@/lib/route";
import { executarTurno } from "@/lib/actions/turno";

/**
 * POST /api/internal/whatsapp/turno (Fase 2 do agente)
 *
 * O n8n manda a mensagem consolidada; o Tibé identifica o contato, entende e
 * executa, e devolve as mensagens a enviar. A lógica vive em `executarTurno`
 * (src/lib/actions/turno.ts).
 */

const schema = z.object({
  telefone: z.string().min(3),
  texto: z.string(),
  provider_message_id: z.string().nullish(),
  recibo: z
    .object({
      amount: z.number().positive(),
      category: z.string().nullish(),
      vendor: z.string().nullish(),
      description: z.string().nullish(),
    })
    .nullish(),
}).refine((corpo) => !!corpo.recibo || corpo.texto.trim().length > 0, {
  message: "Mande o texto da mensagem ou um recibo.",
  path: ["texto"],
});

async function POSTHandler(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const { mensagens, replay } = await executarTurno({
    telefone: parsed.data.telefone,
    texto: parsed.data.texto,
    provider_message_id: parsed.data.provider_message_id ?? null,
    recibo: parsed.data.recibo ?? null,
  });
  return apiOk({ mensagens, replay });
}

export const POST = withApi(POSTHandler);
