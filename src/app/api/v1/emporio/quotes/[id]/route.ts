import { withApi } from "@/lib/route";
import { lerOrcamentoAction } from "@/lib/actions/emporio-orcamentos";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/quotes/:id  o orçamento com itens, preço de hoje, saldo e situação. */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerOrcamentoAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
