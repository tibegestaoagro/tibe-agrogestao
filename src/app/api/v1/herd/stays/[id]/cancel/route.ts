import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { cancelStay } from "@/lib/actions/herd-stays";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/herd/stays/{id}/cancel   cancela uma estadia inteira
 *
 * POST em sub-rota, e não DELETE, pelo mesmo motivo do cancelamento de
 * movimentação: o recurso não é removido (cancelar nunca apaga, a linha
 * continua no histórico) e a operação exige o motivo.
 *
 * Recusa estadia que já tem encerramento, com `ESTADIA_JA_ENCERRADA`: desfazer
 * um encerramento parcial exigiria decidir o que fazer com o que já foi
 * vendido, e essa decisão é do produtor.
 */

const cancelSchema = z.object({
  reason: z.string().trim().min(1, "Informe o motivo do cancelamento").max(500),
});

async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const { id } = await context.params;
  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = cancelSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422, "reason");
  }

  const result = await cancelStay(g.db, id, {
    reason: parsed.data.reason,
    canceled_by_user_id: g.user.id,
  });
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data);
}

export const POST = withApi(POSTHandler);
