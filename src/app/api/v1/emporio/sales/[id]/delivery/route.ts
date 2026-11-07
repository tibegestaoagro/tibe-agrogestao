import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { mudarPedidoParaEntregaAction } from "@/lib/actions/emporio-vendas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";
import { pedidoParaEntregaSchema } from "@/lib/emporio/venda-schema";

/**
 * PATCH /api/v1/emporio/sales/:id/delivery  { for_delivery, delivery_address_kind?, delivery_*? }:
 * quem fatura muda o pedido para entrega da venda fechada (D5 do plano 3).
 */

type Props = { params: Promise<{ id: string }> };

async function PATCHHandler(request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = pedidoParaEntregaSchema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await mudarPedidoParaEntregaAction(g.db, g.user, id, parsed.data));
}

export const PATCH = withApi(PATCHHandler);
