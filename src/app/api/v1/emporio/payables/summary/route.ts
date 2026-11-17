import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { resumoDoAPagarAction } from "@/lib/actions/emporio-despesas";
import { filtroDeResumo, guardEmporio, queryComoObjeto, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/payables/summary  ?establishment_id=&de=&ate=
 * A faixa do A pagar: `summary` (vencida, vence hoje, a vencer com `undated_count`, e pago no período com o
 * % do previsto) e `paid_items` (a lista do período). `de` e `ate` são AAAA-MM-DD; ausentes, valem Este mês.
 * No alcance do papel do Empório, como `GET /payables`.
 */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const parsed = filtroDeResumo.safeParse(queryComoObjeto(request));
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(await resumoDoAPagarAction(g.db, g.user, parsed.data));
}

export const GET = withApi(GETHandler);
