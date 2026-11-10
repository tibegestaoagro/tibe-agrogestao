import { withApi } from "@/lib/route";
import { listarBoletosAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/boletos  ?status=aberto|vencido|pago|no_fiado &loja= (ou establishment_id) &customer_id=  os boletos das lojas visíveis. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await listarBoletosAction(g.db, g.user, {
      establishment_id: sp.get("loja") ?? sp.get("establishment_id") ?? undefined,
      customer_id: sp.get("customer_id") ?? undefined,
      status: sp.get("status") ?? undefined,
    }),
  );
}

export const GET = withApi(GETHandler);
