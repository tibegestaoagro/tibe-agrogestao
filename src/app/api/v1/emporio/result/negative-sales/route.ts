import { withApi } from "@/lib/route";
import { vendasComMargemNegativaAction } from "@/lib/actions/emporio-resultado";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/result/negative-sales  ?establishment_id=(id|all) &month=AAAA-MM  as vendas do mês com margem negativa, da pior para a melhor: só OWNER e ADMIN. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await vendasComMargemNegativaAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? "",
      month: sp.get("month") ?? "",
    }),
  );
}

export const GET = withApi(GETHandler);
