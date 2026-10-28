import { withApi } from "@/lib/route";
import { encerrarDespesaFixaAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/fixed-expenses/:id/end  sem corpo: encerra e cancela as contas de meses depois do atual sem pagamento (só OWNER e ADMIN). */

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  return respostaDaAction(await encerrarDespesaFixaAction(g.db, g.user, id));
}

export const POST = withApi(POSTHandler);
