import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { postponeTaskAction } from "@/lib/actions/tasks";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/tasks/:id/postpone   adia uma tarefa pendente (§26)
 *
 * Rota própria, e não o PATCH com `due_date`, pelo mesmo motivo do `/pay` do
 * Financeiro: o gesto tem REGRA. Adiar tarefa concluída ou cancelada é
 * recusado, e editar a data de uma concluída (para corrigir o histórico) não
 * é. Duas coisas diferentes com o mesmo campo pedem duas portas.
 */

const schema = z.object({
  due_date: z.string().datetime({ message: "Diga para quando adiar" }),
});

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("tarefas", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const result = await postponeTaskAction(g.db, params.id, new Date(parsed.data.due_date));
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
