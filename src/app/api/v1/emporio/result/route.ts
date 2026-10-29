import { withApi } from "@/lib/route";
import { resultadoDaLojaAction } from "@/lib/actions/emporio-resultado";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/result  ?establishment_id=(id|all) &month=AAAA-MM  o Resultado da Loja do mês (ou de todas, com `all`), calculado na leitura: só OWNER e ADMIN. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await resultadoDaLojaAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? "",
      month: sp.get("month") ?? "",
    }),
  );
}

export const GET = withApi(GETHandler);
