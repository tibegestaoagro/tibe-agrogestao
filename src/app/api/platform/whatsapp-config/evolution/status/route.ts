import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { prisma } from "@/lib/prisma";
import { decryptConfig } from "@/lib/crypto-config";
import type { EvolutionCredentials } from "@/lib/actions/platform-whatsapp-config";
import { getInstanceStatus } from "@/lib/evolution-client";

/** GET /api/platform/whatsapp-config/evolution/status — usado pelo polling do card. */
export async function GET() {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const config = await prisma.whatsAppProviderConfig.findUnique({ where: { provider: "evolution" } });
  if (!config) return apiError("NOT_FOUND", "Evolution não configurada", 404);

  const creds = decryptConfig<EvolutionCredentials>(config.credentials_encrypted);
  const result = await getInstanceStatus(creds);
  return apiOk(result);
}
