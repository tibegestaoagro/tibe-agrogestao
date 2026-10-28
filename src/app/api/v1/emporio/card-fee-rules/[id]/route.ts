import { withApi } from "@/lib/route";
import { removerRegraCartaoAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** DELETE /api/v1/emporio/card-fee-rules/:id  remove a regra (as vendas passadas guardam a taxa no pagamento): só OWNER e ADMIN. */

type Props = { params: Promise<{ id: string }> };

async function DELETEHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  return respostaDaAction(await removerRegraCartaoAction(g.db, g.user, id));
}

export const DELETE = withApi(DELETEHandler);
