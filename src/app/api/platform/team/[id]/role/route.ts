import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guardPlatform } from "@/lib/platform-guard";
import { updateTeamMemberRoleAction } from "@/lib/actions/platform-team";

const schema = z.object({ role: z.enum(["MASTER_ADMIN", "EQUIPE"]) });

/** PATCH /api/platform/team/:id/role (spec 6.10): só master_admin, não pode alterar a própria role. */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  if (params.id === g.platformUser.id) {
    return apiError("CANNOT_EDIT_SELF", "Você não pode alterar seu próprio papel", 422);
  }

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await updateTeamMemberRoleAction(params.id, parsed.data.role);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
