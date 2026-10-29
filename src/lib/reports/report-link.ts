import { signReportToken } from "@/lib/reports/report-token";
import type { AreaFinanceira } from "@/lib/financial-area";

/**
 * Constrói o link de download do relatório financeiro. Chamado tanto pela
 * rota HTTP (botão "Exportar relatório" da web) quanto diretamente pelo
 * roteador de intenções do agente WhatsApp (spec 3.5/4.7: "mesma função").
 */
export function buildReportLink(tenantId: string, start: Date, end: Date, area?: AreaFinanceira): string {
  const token = signReportToken({
    tenant_id: tenantId,
    start: start.toISOString(),
    end: end.toISOString(),
    ...(area ? { area } : {}),
  });
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base}/api/v1/financial/report?token=${encodeURIComponent(token)}`;
}
