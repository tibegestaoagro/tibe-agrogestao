import { prisma, prismaForTenant, scoped } from "@/lib/prisma";
import { toBrazilPhoneDigits } from "@/lib/phone";
import type { AppUserRole } from "@/types/next-auth";
import type { ProfileType } from "@/lib/tenant-context";

/**
 * Lógica de `POST /api/internal/whatsapp/resolve-contact` (spec 3.2), extraída
 * da rota (task 9, fase 2 do agente).
 *
 * `identificarContato` é quem usa o client Prisma base (`prisma`, sem escopo)
 * para este lookup; as rotas `resolve-contact` e `turno` só a chamam:
 * ainda não se sabe a qual tenant o telefone pertence, então as duas
 * primeiras buscas (WhatsAppContact e depois User) são cross-tenant por
 * necessidade. Ver .claude/rules/isolamento.md. Toda query seguinte, já com
 * o tenant_id resolvido, usa o client escopado (`prismaForTenant`).
 */

const PROFILE_LABEL: Record<string, string> = {
  fazenda: "Rebanho e Lavoura",
  prestador: "Prestador de Serviço",
};

export type ContatoIdentificado =
  | { identificado: false; resposta_sugerida: string | null }
  | {
      identificado: true;
      primeiro_contato: boolean;
      resposta_sugerida: string | null;
      tenant_id: string;
      user: { id: string; name: string; role: AppUserRole };
      contato_id: string;
      activeProfiles: ProfileType[];
      // intent_detected não está no contrato original da task 9 (a rota lê da
      // mesma consulta): mantido para a rota devolver exatamente a mesma
      // meta.recent_history de antes da extração.
      historico: { direction: string; content: string | null; intent_detected: string | null; created_at: Date }[];
    };

export async function identificarContato(telefone: string): Promise<ContatoIdentificado> {
  const phone = toBrazilPhoneDigits(telefone);

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
      return {
        identificado: false,
        resposta_sugerida:
          "Este número não está cadastrado no Tibé. Peça para o administrador da sua empresa cadastrar seu telefone no sistema.",
      };
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
    return { identificado: false, resposta_sugerida: null };
  }

  const user = await db.user.findFirst({ where: { id: contact.user_id, active: true } });
  if (!user) {
    return { identificado: false, resposta_sugerida: null };
  }

  const profiles = await db.tenantProfile.findMany({ where: { active: true } });
  const activeProfiles = profiles.map((p) => p.profile_type);

  const historyRaw = await db.agentConversationLog.findMany({
    where: { whatsapp_contact_id: contact.id },
    orderBy: { created_at: "desc" },
    take: 5,
  });

  const suggestedReply = firstContact
    ? `Olá, ${user.name}! 👋 Bem-vindo(a) ao Tibé. Sua empresa tem os módulos: ${
        activeProfiles.map((p) => PROFILE_LABEL[p] ?? p).join(", ")
      } e Financeiro. Você pode me pedir para cadastrar animais, registrar pesagens e vacinas, criar ordens de serviço, ou consultar informações: é só me mandar uma mensagem.`
    : null;

  return {
    identificado: true,
    primeiro_contato: firstContact,
    resposta_sugerida: suggestedReply,
    tenant_id: tenantId,
    user: { id: user.id, name: user.name, role: user.role },
    contato_id: contact.id,
    activeProfiles,
    historico: historyRaw.reverse().map((h) => ({
      direction: h.direction,
      content: h.content,
      intent_detected: h.intent_detected,
      created_at: h.created_at,
    })),
  };
}
