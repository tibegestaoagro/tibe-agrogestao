import { withApi } from "@/lib/route";
import { lerVendaAction } from "@/lib/actions/emporio-vendas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/sales/:id  a venda com itens, pagamentos e devoluções. */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerVendaAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
