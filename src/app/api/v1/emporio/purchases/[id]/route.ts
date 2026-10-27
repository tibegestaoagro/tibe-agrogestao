import { withApi } from "@/lib/route";
import { lerCompraAction } from "@/lib/actions/emporio-compras";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/purchases/:id */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerCompraAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
