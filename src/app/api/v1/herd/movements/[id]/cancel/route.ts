import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { cancelMovement, serializeHerdMovement } from "@/lib/actions/herd-ledger";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/herd/movements/:id/cancel   cancela uma movimentação (§10.8)
 *
 * Cancelar não apaga: marca a linha, que continua identificada no histórico, e
 * o saldo se recalcula sozinho por ser sempre a soma das não canceladas.
 *
 * É POST numa sub-rota, não DELETE em `/movements/:id`, porque o recurso não é
 * removido e a operação exige um corpo (o motivo). `DELETE` prometeria uma
 * semântica que o módulo inteiro foi desenhado para não ter.
 *
 * Editar uma movimentação é cancelar e lançar de novo: não existe PATCH aqui
 * de propósito, sobrescrever a linha apagaria o rastro que o §10.8 exige.
 */

const cancelSchema = z.object({
  reason: z.string().trim().min(1, "Informe o motivo do cancelamento").max(500),
});

async function POSTHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guard("rebanho", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = cancelSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  const result = await cancelMovement(g.db, params.id, parsed.data.reason);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(serializeHerdMovement(result.data));
}

export const POST = withApi(POSTHandler);
