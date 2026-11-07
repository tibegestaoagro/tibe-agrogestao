import { withApi } from "@/lib/route";
import { lerOpcoesDeEntregaDoClienteAction } from "@/lib/actions/emporio-clientes";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/customers/:id/delivery-options: os endereços que o pedido
 * para entrega pode usar (principal e de entrega do cadastro) e o que falta no cliente.
 */

type Props = { params: Promise<{ id: string }> };

async function GETHandler(_request: Request, props: Props) {
  const { id } = await props.params;
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  return respostaDaAction(await lerOpcoesDeEntregaDoClienteAction(g.db, g.user, id));
}

export const GET = withApi(GETHandler);
