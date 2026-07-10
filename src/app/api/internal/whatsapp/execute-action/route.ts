import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { prismaForTenant } from "@/lib/prisma";
import { isIntent } from "@/lib/whatsapp-intents";
import { detectConfirmation } from "@/lib/actions/confirmation";
import { logInbound, logOutbound } from "@/lib/actions/conversation-log";
import { routeIntent } from "@/lib/actions/whatsapp-router";

/**
 * POST /api/internal/whatsapp/execute-action (spec 3.5)
 *
 * Recebe a intenção já classificada pelo LLM (no N8N) e roteia para a lógica de
 * negócio existente dos Módulos 1/2 (src/lib/actions/*), sem duplicar.
 *
 * Campos aditivos ao contrato da spec (documentados no plano do Módulo 3):
 * - message_text (opcional): texto bruto da mensagem, usado para log fiel em
 *   AgentConversationLog e como fallback de interpretação de confirmação
 *   ("sim"/"não") independente do LLM.
 * - confirmed (opcional): quando o N8N já resolveu que o usuário confirmou a
 *   ação pendente, reenviando a MESMA intenção+parâmetros originais.
 */

const schema = z.object({
  tenant_id: z.string().min(1),
  user_id: z.string().min(1),
  intent: z.string(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  message_text: z.string().nullish(),
  confirmed: z.boolean().nullish(),
});

export async function POST(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      "Corpo inválido: tenant_id, user_id e intent são obrigatórios",
      422,
    );
  }
  const { tenant_id, user_id, parameters, message_text } = parsed.data;
  const intent = isIntent(parsed.data.intent) ? parsed.data.intent : "ambigua";

  const db = prismaForTenant(tenant_id);

  // user_id é sempre revalidado no banco — nunca confiamos na role vinda do caller.
  const user = await db.user.findFirst({ where: { id: user_id, active: true } });
  if (!user) {
    return apiError("INVALID_USER", "Usuário não encontrado ou inativo neste tenant", 404);
  }

  const contact = await db.whatsAppContact.findFirst({ where: { user_id: user.id } });
  const profiles = await db.tenantProfile.findMany({ where: { active: true } });
  const activeProfiles = profiles.map((p) => p.profile_type);

  if (contact) {
    await logInbound(db, {
      whatsapp_contact_id: contact.id,
      content: message_text ?? `[${intent}] ${JSON.stringify(parameters)}`,
      intent,
    });
  }

  const confirmationSignal = detectConfirmation(message_text);
  const confirmed = parsed.data.confirmed === true || confirmationSignal === "yes";
  const explicitNo = parsed.data.confirmed === false || confirmationSignal === "no";

  const result = await routeIntent(db, {
    role: user.role,
    activeProfiles,
    intent,
    parameters,
    confirmed,
    explicitNo,
  });

  if (contact) {
    await logOutbound(db, {
      whatsapp_contact_id: contact.id,
      content: result.reply_text,
      intent,
      action_taken: result.action_taken,
    });
  }

  return apiOk({
    reply_text: result.reply_text,
    requires_confirmation: result.requires_confirmation,
    auxiliary_data: result.auxiliary_data,
    report_url: result.report_url,
  });
}
