import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { forceSubscriptionStatusAction } from "@/lib/actions/platform-tenants";

const schema = z.object({
  status: z.enum(["active", "overdue", "canceled"]),
  reason: z.string().trim().min(1).nullish(),
});

/**
 * PATCH /api/platform/tenants/:id/status (spec 6.9): só master_admin.
 * Grava em SubscriptionStatusLog com o PlatformUser responsável (log de
 * auditoria exigido pela spec).
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await forceSubscriptionStatusAction({
    tenantId: params.id,
    newStatus: parsed.data.status,
    reason: parsed.data.reason ?? null,
    platformUserId: g.platformUser.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  return apiOk(result.data);
}
