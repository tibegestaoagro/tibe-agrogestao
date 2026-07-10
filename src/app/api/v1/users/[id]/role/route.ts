import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { updateUserRoleAction } from "@/lib/actions/users";

const schema = z.object({ role: z.enum(["OWNER", "ADMIN", "OPERADOR", "VISUALIZADOR"]) });

/** PATCH /api/v1/users/:id/role (spec 5.2) */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const g = await guard("usuarios", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  if (parsed.data.role === "OWNER" && g.user.role !== "OWNER") {
    return apiError("FORBIDDEN", "Apenas o Owner pode promover outro usuário a Owner", 403);
  }
  if (params.id === g.user.id) {
    return apiError("CANNOT_EDIT_SELF", "Você não pode alterar seu próprio papel", 422);
  }

  const result = await updateUserRoleAction(g.db, params.id, parsed.data.role);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
