import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { confirmarEntregaAction } from "@/lib/actions/emporio-turno";
import { guardEmporio } from "@/lib/emporio/rota";
import { chaveDeOperacao } from "@/lib/emporio/venda-schema";

/** POST /api/v1/emporio/cash/handovers/:id/confirm  o gerente confirma o valor recebido, que entra em "Com a gerência". */

const schema = z.object({
  operation_key: chaveDeOperacao,
  received_amount: z.number({ error: "Informe quanto foi recebido." }),
  notes: z.string().nullish(),
});

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const res = await confirmarEntregaAction(g.db, g.user, id, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  const { replayed: _replayed, ...entrega } = res.data;
  return apiOk(entrega);
}

export const POST = withApi(POSTHandler);
