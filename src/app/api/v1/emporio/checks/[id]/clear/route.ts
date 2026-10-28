import { withApi } from "@/lib/route";
import { compensarChequeAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/checks/:id/clear  sem corpo: depositado para compensado, o dinheiro entra na conta (só OWNER e ADMIN). */

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  return respostaDaAction(await compensarChequeAction(g.db, g.user, id));
}

export const POST = withApi(POSTHandler);
