import { z } from "zod";
import { apiError, apiErroDeZod, apiOk } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { trocarAction } from "@/lib/actions/emporio-vendas";
import { guardEmporio } from "@/lib/emporio/rota";
import { chaveDeOperacao, corpoDaVendaSchema, itemDevolvidoSchema } from "@/lib/emporio/venda-schema";

/** POST /api/v1/emporio/sales/:id/exchange  troca = devolução mais venda nova (chave de operação): wrapper fino. */

const schema = z.object({
  operation_key: chaveDeOperacao,
  items_devolvidos: z.array(itemDevolvidoSchema, { error: "Escolha os itens a devolver." }),
  reason: z.string().nullish(),
  venda: corpoDaVendaSchema.extend({
    operation_key: z.string().nullish(),
    establishment_id: z.string().nullish(),
  }),
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

  const res = await trocarAction(g.db, g.user, id, parsed.data);
  if (!res.ok) return apiError(res.code, res.message, res.status, res.field);
  const { replayed, ...troca } = res.data;
  return apiOk(troca, {}, replayed ? undefined : { status: 201 });
}

export const POST = withApi(POSTHandler);
