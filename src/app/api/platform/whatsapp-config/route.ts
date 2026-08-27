import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { prisma } from "@/lib/prisma";
import { decryptConfig } from "@/lib/crypto-config";
import {
  upsertProviderConfigAction,
  maskCredentials,
} from "@/lib/actions/platform-whatsapp-config";
import { withApi } from "@/lib/route";

/**
 * GET/PUT /api/platform/whatsapp-config (spec 2026-07-11): só master_admin.
 * GET devolve credenciais SEMPRE mascaradas (últimos 4 chars); o valor
 * íntegro nunca sai do servidor.
 */

const putSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("evolution"),
    credentials: z.object({
      base_url: z.string().trim().url(),
      api_key: z.string().trim().min(1),
      instance: z.string().trim().min(1),
      n8n_webhook_url: z.string().trim().url(),
    }),
  }),
  z.object({
    provider: z.literal("meta_cloud_api"),
    credentials: z.object({
      access_token: z.string().trim().min(1),
      phone_number_id: z.string().trim().min(1),
    }),
  }),
]);

async function GETHandler() {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const configs = await prisma.whatsAppProviderConfig.findMany({ orderBy: { provider: "asc" } });
  return apiOk(
    configs.map((c) => ({
      provider: c.provider,
      active: c.active,
      credentials_masked: maskCredentials(decryptConfig<Record<string, string>>(c.credentials_encrypted)),
      updated_at: c.updated_at.toISOString(),
    })),
  );
}

async function PUTHandler(request: Request) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await upsertProviderConfigAction(parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const GET = withApi(GETHandler);
export const PUT = withApi(PUTHandler);
