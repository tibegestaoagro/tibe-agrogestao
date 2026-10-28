import { withApi } from "@/lib/route";
import { renovarDespesaFixaAction } from "@/lib/actions/emporio-despesas";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/fixed-expenses/:id/renew  sem corpo: gera os meses que faltam até 12 à frente, sem duplicar (só OWNER e ADMIN). */

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;
  return respostaDaAction(await renovarDespesaFixaAction(g.db, g.user, id));
}

export const POST = withApi(POSTHandler);
