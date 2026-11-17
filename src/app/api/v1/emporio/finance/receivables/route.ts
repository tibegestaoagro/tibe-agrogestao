import { apiErroDeZod } from "@/lib/api";
import { withApi } from "@/lib/route";
import { listarContasAReceberAction } from "@/lib/actions/emporio-financeiro";
import { filtroDeResumo, guardEmporio, queryComoObjeto, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET /api/v1/emporio/finance/receivables  ?establishment_id=&de=&ate=
 * O fiado por cliente, os cheques em carteira, os boletos e os cartões a receber, mais o `summary`
 * (vencido, vence hoje, a vencer e recebido no período, com o % do previsto) e `received_items`
 * (a lista do período). `de` e `ate` são AAAA-MM-DD; ausentes, valem Este mês.
 * Só o Financeiro, o Gerente geral e o Dono.
 */

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const parsed = filtroDeResumo.safeParse(queryComoObjeto(request));
  if (!parsed.success) return apiErroDeZod(parsed.error);
  return respostaDaAction(await listarContasAReceberAction(g.db, g.user, parsed.data));
}

export const GET = withApi(GETHandler);
