import { withApi } from "@/lib/route";
import { aprovarPedidoDePagamentoAction } from "@/lib/actions/emporio-aprovacoes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** POST /api/v1/emporio/finance/payment-requests/:id/approve: aprova e paga (a recusa do pagamento volta como recusa da rota). */

type Props = { params: Promise<{ id: string }> };

async function POSTHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  return respostaDaAction(await aprovarPedidoDePagamentoAction(g.db, g.user, id));
}

export const POST = withApi(POSTHandler);
