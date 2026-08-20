import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { updateTaskStatusAction } from "@/lib/actions/tasks";

/** PATCH /api/v1/tasks/:id: conclui ou cancela uma tarefa. */

const schema = z.object({
  status: z.enum(["pending", "completed", "cancelled"]),
});

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("tarefas", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await updateTaskStatusAction(g.db, params.id, parsed.data.status);
  if (!result.ok) return apiError(result.code, result.message, result.status);
  return apiOk(result.data);
}
