import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { listarEntregasAction } from "@/lib/actions/emporio-turno";
import { guardEmporio, paginaDaQuery, respostaPaginada } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/cash/handovers  ?establishment_id= &status=pending|confirmed &page= &per_page= (20, 40, 80, 100) &order= (desc|asc; sem ele, as pendentes vêm da mais antiga e as confirmadas da mais nova)
 * sangrias e malotes das lojas visíveis; meta: total, page, per_page.
 */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const pagina = paginaDaQuery(sp, "entregas");
  if (!pagina.success) return apiErroDeZod(pagina.error);
  return respostaPaginada(
    await listarEntregasAction(g.db, g.user, {
      ...pagina.data,
      establishment_id: sp.get("establishment_id") ?? undefined,
      status: sp.get("status") ?? undefined,
    }),
  );
}

export const GET = withApi(GETHandler);
