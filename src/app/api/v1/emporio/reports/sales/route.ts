import { withApi } from "@/lib/route";
import { relatorioDeVendasAction } from "@/lib/actions/emporio-relatorios";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/** GET /api/v1/emporio/reports/sales  ?from=AAAA-MM-DD &to=AAAA-MM-DD &establishment_id=  o relatório de vendas: Gestor da loja, Gerente geral e Dono. */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(
    await relatorioDeVendasAction(g.db, g.user, {
      from: sp.get("from") ?? "",
      to: sp.get("to") ?? "",
      establishment_id: sp.get("establishment_id") ?? undefined,
    }),
  );
}

export const GET = withApi(GETHandler);
