import { scoped, type TenantPrismaClient } from "@/lib/prisma";

/**
 * Persistência de AgentConversationLog (spec 3.7). Toda mensagem recebida e toda
 * resposta enviada são registradas, com intenção detectada e ação tomada.
 */
export async function logInbound(
  db: TenantPrismaClient,
  params: { whatsapp_contact_id: string; content: string | null; intent?: string | null },
) {
  return db.agentConversationLog.create({
    data: scoped({
      whatsapp_contact_id: params.whatsapp_contact_id,
      direction: "in" as const,
      message_type: "text",
      content: params.content,
      intent_detected: params.intent ?? null,
    }),
  });
}

export async function logOutbound(
  db: TenantPrismaClient,
  params: {
    whatsapp_contact_id: string;
    content: string;
    intent?: string | null;
    action_taken?: string | null;
  },
) {
  return db.agentConversationLog.create({
    data: scoped({
      whatsapp_contact_id: params.whatsapp_contact_id,
      direction: "out" as const,
      message_type: "text",
      content: params.content,
      intent_detected: params.intent ?? null,
      action_taken: params.action_taken ?? null,
    }),
  });
}
