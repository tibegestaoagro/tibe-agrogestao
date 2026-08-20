import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { activateProviderAction } from "@/lib/actions/platform-whatsapp-config";

/** POST /api/platform/whatsapp-config/:provider/activate: só master_admin. */

const providerSchema = z.enum(["evolution", "meta_cloud_api"]);

export async function POST(_request: Request, props: { params: Promise<{ provider: string }> }) {
  const params = await props.params;
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const parsed = providerSchema.safeParse(params.provider);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "provider deve ser 'evolution' ou 'meta_cloud_api'", 422);
  }

  const result = await activateProviderAction(parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
