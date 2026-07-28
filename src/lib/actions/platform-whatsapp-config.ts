import { prisma } from "@/lib/prisma";
import { ok, fail, type ActionResult } from "@/lib/actions/types";
import { encryptConfig } from "@/lib/crypto-config";
import type { WhatsAppProvider } from "@/generated/prisma/enums";

/**
 * Config de provider WhatsApp (spec 2026-07-11) — ações do painel da
 * plataforma, só master_admin (recorte aplicado nas rotas via guardPlatform).
 * Usa o client base: config GLOBAL de plataforma, não pertence a tenant
 * (mesma categoria de PlatformUser — exceção documentada no CLAUDE.md).
 */

export type EvolutionCredentials = {
  base_url: string;
  api_key: string;
  instance: string;
  /** URL do webhook do workflow N8N (spec 2026-07-28) — configurada na
   * instância Evolution automaticamente ao criar/conectar, sem precisar
   * mexer na Evolution direto. */
  n8n_webhook_url: string;
};
export type MetaCredentials = { access_token: string; phone_number_id: string };

export async function upsertProviderConfigAction(params: {
  provider: WhatsAppProvider;
  credentials: EvolutionCredentials | MetaCredentials;
}): Promise<ActionResult<{ provider: WhatsAppProvider }>> {
  const credentials_encrypted = encryptConfig(params.credentials);
  await prisma.whatsAppProviderConfig.upsert({
    where: { provider: params.provider },
    update: { credentials_encrypted },
    create: { provider: params.provider, credentials_encrypted },
  });
  return ok({ provider: params.provider });
}

export async function activateProviderAction(
  provider: WhatsAppProvider,
): Promise<ActionResult<{ provider: WhatsAppProvider }>> {
  const config = await prisma.whatsAppProviderConfig.findUnique({ where: { provider } });
  if (!config) {
    return fail("NOT_FOUND", "Configure as credenciais deste provider antes de ativá-lo", 404);
  }
  // Invariante "no máximo 1 ativo": desativa todos e ativa o alvo na mesma
  // transação (o partial unique index da migração é só defesa extra).
  await prisma.$transaction([
    prisma.whatsAppProviderConfig.updateMany({ data: { active: false } }),
    prisma.whatsAppProviderConfig.update({ where: { provider }, data: { active: true } }),
  ]);
  return ok({ provider });
}

/** Máscara para exibição: nunca devolver credencial íntegra ao client. */
export function maskCredentials(credentials: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(credentials).map(([k, v]) => [k, v.length > 4 ? `•••• ${v.slice(-4)}` : "••••"]),
  );
}
