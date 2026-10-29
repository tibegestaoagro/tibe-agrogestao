import { withApi } from "@/lib/route";
import { produtosDoMesAction } from "@/lib/actions/emporio-resultado";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/result/products  ?establishment_id=(id|all) &month=AAAA-MM  os 10 produtos que mais venderam e os 10 de maior margem: só OWNER e ADMIN. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await produtosDoMesAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? "",
      month: sp.get("month") ?? "",
    }),
  );
}

export const GET = withApi(GETHandler);
