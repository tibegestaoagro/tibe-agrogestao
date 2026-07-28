import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { prisma } from "@/lib/prisma";
import { decryptConfig } from "@/lib/crypto-config";
import type { EvolutionCredentials } from "@/lib/actions/platform-whatsapp-config";
import {
  getInstanceStatus,
  createInstance,
  connectInstance,
  setInstanceWebhook,
} from "@/lib/evolution-client";

/**
 * POST /api/platform/whatsapp-config/evolution/connect (spec 2026-07-24,
 * webhook automático 2026-07-28): só master_admin. Cria a instância na
 * Evolution se ainda não existir (ou pede um QR novo se existir mas não
 * estiver conectada) e aponta o webhook pro N8N: nunca precisa mexer na
 * Evolution direto, tudo pelo painel.
 */
export async function POST() {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const config = await prisma.whatsAppProviderConfig.findUnique({ where: { provider: "evolution" } });
  if (!config) {
    return apiError("NOT_FOUND", "Configure as credenciais da Evolution antes de conectar", 404);
  }
  const creds = decryptConfig<EvolutionCredentials>(config.credentials_encrypted);

  const current = await getInstanceStatus(creds);
  const result =
    current.state === "not_found" ? await createInstance(creds) : await connectInstance(creds);

  // A instância já existe nesse ponto (create ou connect rodaram): aponta o
  // webhook pro N8N. Não trava o fluxo se falhar (QR ainda vale a pena
  // mostrar); o client mostra um aviso se webhook_configured vier false.
  const webhook = await setInstanceWebhook(creds);

  return apiOk({ ...result, webhook_configured: webhook.ok });
}
