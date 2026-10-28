import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { devolverAction } from "@/lib/actions/emporio-vendas";
import { guardEmporio } from "@/lib/emporio/rota";
import { chaveDeOperacao, itemDevolvidoSchema } from "@/lib/emporio/venda-schema";

/** POST /api/v1/emporio/sales/:id/return  devolução parcial (chave de operação): wrapper fino. */

const schema = z.object({
  operation_key: chaveDeOperacao,
  refund_kind: z.string({ error: "Escolha como devolver o valor." }).min(1, "Escolha como devolver o valor."),
  items: z.array(itemDevolvidoSchema, { error: "Escolha os itens a devolver." }),
  reason: z.string().nullish(),
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

  const res = await devolverAction(g.db, g.user, id, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  const { replayed, ...devolucao } = res.data;
  return apiOk(devolucao, {}, replayed ? undefined : { status: 201 });
}

export const POST = withApi(POSTHandler);
