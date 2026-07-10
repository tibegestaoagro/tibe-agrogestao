import { apiOk } from "@/lib/api";
import { guard } from "@/lib/api-guard";
import { resolvePeriod } from "@/lib/actions/financial-reports";
import { buildReportLink } from "@/lib/reports/report-link";

/**
 * GET /api/v1/financial/report/link?start=&end=
 * Sessão obrigatória. Devolve um link assinado (válido por 1h) para
 * `/api/v1/financial/report`, que gera o PDF sob demanda — usado pelo botão
 * "Exportar relatório" da web.
 */
export async function GET(request: Request) {
  const g = await guard("financeiro", "read");
  if ("error" in g) return g.error;

  const sp = new URL(request.url).searchParams;
  const { start, end } = resolvePeriod(sp.get("start"), sp.get("end"));

  const report_url = buildReportLink(g.user.tenant_id, start, end);
  return apiOk({ report_url, expires_in_seconds: 3600 });
}
