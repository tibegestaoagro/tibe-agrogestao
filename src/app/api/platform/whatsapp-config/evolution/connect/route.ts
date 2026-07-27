import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { prisma } from "@/lib/prisma";
import { decryptConfig } from "@/lib/crypto-config";
import type { EvolutionCredentials } from "@/lib/actions/platform-whatsapp-config";
import { getInstanceStatus, createInstance, connectInstance } from "@/lib/evolution-client";

/**
 * POST /api/platform/whatsapp-config/evolution/connect (spec 2026-07-24) —
 * só master_admin. Cria a instância na Evolution se ainda não existir, ou
 * pede um QR novo se existir mas não estiver conectada.
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

  return apiOk(result);
}
