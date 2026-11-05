import { withApi } from "@/lib/route";
import { listarEntregasAction } from "@/lib/actions/emporio-turno";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/cash/handovers  ?establishment_id= &status=pending|confirmed  sangrias e malotes das lojas visíveis. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await listarEntregasAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      status: sp.get("status") ?? undefined,
    }),
  );
}

export const GET = withApi(GETHandler);
