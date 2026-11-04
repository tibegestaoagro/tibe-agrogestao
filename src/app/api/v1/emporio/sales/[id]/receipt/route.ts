import { withApi } from "@/lib/route";
import { lerImpressoDaVendaAction } from "@/lib/actions/emporio-impressao";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/sales/:id/receipt  os dados do papel da venda (A4 e bobina). */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerImpressoDaVendaAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
