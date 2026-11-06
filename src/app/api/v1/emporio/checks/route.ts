import { withApi } from "@/lib/route";
import { listarChequesAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/checks  ?establishment_id= &customer_id= &status=  os cheques das lojas visíveis. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await listarChequesAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      customer_id: sp.get("customer_id") ?? undefined,
      status: sp.get("status") ?? undefined,
    }),
  );
}

export const GET = withApi(GETHandler);
