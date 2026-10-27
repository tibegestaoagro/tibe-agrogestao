import { withApi } from "@/lib/route";
import { saldoDoProdutoAction } from "@/lib/actions/emporio-estoque";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/products/:id/stock: saldo do produto em cada loja visível, mais o consolidado. */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await saldoDoProdutoAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
