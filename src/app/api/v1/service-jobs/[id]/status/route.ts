import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { setServiceJobStatus } from "@/lib/actions/service-jobs";
import { withApi } from "@/lib/route";

/**
 * PATCH /api/v1/service-jobs/:id/status   iniciar e encerrar o serviço (§42).
 *
 * Só o status muda. Concluir NÃO quita nada: o §42 pergunta se o cliente já
 * pagou DEPOIS de mostrar o resumo, e responder por ele inventaria um
 * recebimento.
 *
 * Guard `servicos`: ver `src/app/api/v1/service-jobs/route.ts`.
 */

const schema = z.object({ status: z.enum(["em_andamento", "concluido"]) });

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const g = await guard("servicos", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const res = await setServiceJobStatus(g.db, { service_job_id: id, status: parsed.data.status });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data);
}

export const PATCH = withApi(PATCHHandler);
