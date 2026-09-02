import { apiOk, apiError } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { deleteWorkerLog } from "@/lib/actions/worker-logs";
import { withApi } from "@/lib/route";

/**
 * DELETE /api/v1/workers/:id/logs/:logId   apaga uma anotação.
 *
 * ⚠️ APAGAR É APAGAR AQUI, e é a única exceção do módulo ao "desativar, nunca
 * apagar" que vale para Fazenda, Pasto, Contato e Trabalhador. Uma anotação
 * errada não é histórico de dinheiro: registrar "folga" no dia errado e não
 * poder corrigir seria pior que perder a linha.
 *
 * Guard `mao_de_obra`: ver `src/app/api/v1/workers/[id]/logs/route.ts`.
 */

async function DELETEHandler(
  _request: Request,
  props: { params: Promise<{ id: string; logId: string }> },
) {
  const { logId } = await props.params;
  const g = await guard("mao_de_obra", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const res = await deleteWorkerLog(g.db, logId);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

export const DELETE = withApi(DELETEHandler);
