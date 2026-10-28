import { withApi } from "@/lib/route";
import { listarFiadoAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/receivables  ?establishment_id= &contact_id=  o fiado em aberto, por cliente. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await listarFiadoAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      contact_id: sp.get("contact_id") ?? undefined,
    }),
  );
}

export const GET = withApi(GETHandler);
