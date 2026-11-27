import { withApi } from "@/lib/route";
import { compararVendasAction } from "@/lib/actions/emporio-relatorios";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/reports/sales/comparison  ?from=AAAA-MM-DD &to=AAAA-MM-DD &establishment_id=  o total do período e o do mesmo trecho do mês anterior. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await compararVendasAction(g.db, g.user, {
      from: sp.get("from") ?? "",
      to: sp.get("to") ?? "",
      establishment_id: sp.get("establishment_id") ?? undefined,
    }),
  );
}

export const GET = withApi(GETHandler);
