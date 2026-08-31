import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { updateTaskStatusAction } from "@/lib/actions/tasks";
import { withApi } from "@/lib/route";

/** PATCH /api/v1/tasks/:id: conclui ou cancela uma tarefa. */

const schema = z.object({
  status: z.enum(["pending", "completed", "cancelled"]),
});

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("tarefas", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const result = await updateTaskStatusAction(g.db, params.id, parsed.data.status);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const PATCH = withApi(PATCHHandler);
