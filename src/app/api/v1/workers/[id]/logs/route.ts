import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { listWorkerLogs, createWorkerLog } from "@/lib/actions/worker-logs";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/workers/:id/logs   as anotações do trabalhador (§12, §34)
 * POST /api/v1/workers/:id/logs   registra atividade ou ausência
 *
 * ⚠️ Guard `mao_de_obra`, e NÃO `servicos` como as rotas de serviço: isto é a
 * ficha de um trabalhador, e quem não pode ver o salário dele não pode ver as
 * faltas dele. As duas coisas dizem o mesmo tipo de informação sobre a pessoa.
 *
 * ⚠️ Nada aqui calcula nada. O §34 diz que o TIBÉ "não deverá calcular
 * automaticamente consequências trabalhistas", e uma falta NÃO gera desconto.
 */

const schema = z.object({
  kind: z.enum(["atividade", "falta", "folga", "ferias", "afastamento"]),
  occurred_at: z.string().datetime("Informe uma data válida"),
  description: z.string().trim().max(500).nullish(),
  property_id: z.string().trim().min(1).nullish(),
  pasture_id: z.string().trim().min(1).nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guard("mao_de_obra", "read", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const logs = await listWorkerLogs(g.db, id);
  return apiOk(logs, { total: logs.length });
}

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guard("mao_de_obra", "write", { profile: "fazenda" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);
  const d = parsed.data;

  const res = await createWorkerLog(g.db, {
    worker_id: id,
    kind: d.kind,
    occurred_at: new Date(d.occurred_at),
    description: d.description ?? null,
    property_id: d.property_id ?? null,
    pasture_id: d.pasture_id ?? null,
  });
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  return apiOk(res.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
