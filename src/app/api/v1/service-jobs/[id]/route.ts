import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { getServiceJobDetail, cancelServiceJob } from "@/lib/actions/service-jobs";
import { withApi } from "@/lib/route";

/**
 * GET    /api/v1/service-jobs/:id   o serviço, os logs e os lançamentos (§22)
 * DELETE /api/v1/service-jobs/:id   CANCELA, não apaga
 *
 * O `DELETE` cancela porque o §40.8 exige histórico: apagar levaria junto os
 * lançamentos já pagos, e aquele dinheiro saiu de verdade. O cancelamento
 * apaga só as contas a pagar pendentes, que é o que um serviço que não
 * aconteceu não pode continuar gerando no DRE dos meses seguintes.
 *
 * Guard `servicos`: ver `src/app/api/v1/service-jobs/route.ts`.
 */

const cancelSchema = z.object({
  reason: z.string().trim().max(500).nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guard("servicos", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const res = await getServiceJobDetail(g.db, id);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

async function DELETEHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guard("servicos", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  // O motivo é opcional, então corpo ausente é caminho normal, não erro.
  const body = await readJson(request);
  const reason =
    "error" in body ? null : (cancelSchema.safeParse(body.json).data?.reason ?? null);

  const res = await cancelServiceJob(g.db, {
    service_job_id: id,
    reason,
    user_id: g.user.id,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

export const GET = withApi(GETHandler);
export const DELETE = withApi(DELETEHandler);
