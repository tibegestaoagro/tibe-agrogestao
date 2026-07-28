import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { requireInternalSecret } from "@/lib/internal-guard";
import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";

/**
 * POST /api/internal/whatsapp/resolve-contact (spec 3.2)
 *
 * Único endpoint que legitimamente faz lookup CROSS-TENANT: ainda não sabemos a
 * qual tenant o telefone pertence. Usa o client base (sem escopo) só para essa
 * busca inicial; toda query subsequente, já com tenant_id conhecido, usa o client
 * escopado (prismaForTenant): mesma convenção do resto do app.
 *
 * Extensões aditivas ao contrato da spec (documentadas, não fazem parte de "data"):
 * - meta.first_contact: true quando o vínculo WhatsAppContact acabou de ser criado
 *   (usado para a saudação personalizada da task 3.8).
 * - meta.recent_history: últimas 5 interações de AgentConversationLog, já que a
 *   spec (task 3.3) exige esse histórico para o LLM mas não define de onde o N8N
 *   o obtém: resolve-contact é chamado primeiro no fluxo, então é o lugar natural.
 * - meta.suggested_reply: mensagem pronta para os dois casos "de fronteira" da
 *   task 3.8 (contato não identificado / primeira mensagem de usuário recém
 *   vinculado): permite ao N8N responder direto, sem passar pelo LLM.
 */

const PROFILE_LABEL: Record<string, string> = {
  fazenda: "Rebanho e Lavoura",
  prestador: "Prestador de Serviço",
};

const schema = z.object({ phone: z.string().min(3) });

export async function POST(request: Request) {
  const auth = requireInternalSecret(request);
  if ("error" in auth) return auth.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "phone é obrigatório", 422);
  }
  const phone = normalizePhone(parsed.data.phone);

  // 1. Busca cross-tenant: contato já vinculado a algum tenant?
  let contact = await prisma.whatsAppContact.findFirst({ where: { phone } });
  let firstContact = false;
  let tenantId: string;

  if (contact) {
    tenantId = contact.tenant_id;
  } else {
    // 2. Busca cross-tenant: existe User ativo com esse telefone em algum tenant?
    const user = await prisma.user.findFirst({ where: { phone, active: true } });
    if (!user) {
      return apiOk(
        { identified: false },
        {
          suggested_reply:
            "Este número não está cadastrado no Tibé. Peça para o administrador da sua empresa cadastrar seu telefone no sistema.",
        },
      );
    }
    tenantId = user.tenant_id;
    contact = await prismaForTenant(tenantId).whatsAppContact.create({
      data: scoped({ phone, user_id: user.id, last_interaction_at: new Date() }),
    });
    firstContact = true;
  }

  const db = prismaForTenant(tenantId);

  if (!firstContact) {
    contact = await db.whatsAppContact.update({
      where: { id: contact.id },
      data: { last_interaction_at: new Date() },
    });
  }

  if (!contact.user_id) {
    return apiOk({ identified: false });
  }

  const user = await db.user.findFirst({ where: { id: contact.user_id, active: true } });
  if (!user) {
    return apiOk({ identified: false });
  }

  const profiles = await db.tenantProfile.findMany({ where: { active: true } });

  const historyRaw = await db.agentConversationLog.findMany({
    where: { whatsapp_contact_id: contact.id },
    orderBy: { created_at: "desc" },
    take: 5,
  });

  const activeProfiles = profiles.map((p) => p.profile_type);
  const suggestedReply = firstContact
    ? `Olá, ${user.name}! 👋 Bem-vindo(a) ao Tibé. Sua empresa tem os módulos: ${
        activeProfiles.map((p) => PROFILE_LABEL[p] ?? p).join(", ")
      } e Financeiro. Você pode me pedir para cadastrar animais, registrar pesagens e vacinas, criar ordens de serviço, ou consultar informações: é só me mandar uma mensagem.`
    : null;

  return apiOk(
    {
      identified: true,
      tenant_id: tenantId,
      user_id: user.id,
      user_name: user.name,
      role: user.role,
      active_profiles: activeProfiles,
    },
    {
      first_contact: firstContact,
      suggested_reply: suggestedReply,
      recent_history: historyRaw.reverse().map((h) => ({
        direction: h.direction,
        content: h.content,
        intent_detected: h.intent_detected,
        created_at: h.created_at.toISOString(),
      })),
    },
  );
}
