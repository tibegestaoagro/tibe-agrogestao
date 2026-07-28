import { signReportToken } from "@/lib/reports/report-token";

/**
 * Constrói o link de download do relatório financeiro. Chamado tanto pela
 * rota HTTP (botão "Exportar relatório" da web) quanto diretamente pelo
 * roteador de intenções do agente WhatsApp (spec 3.5/4.7: "mesma função").
 */
export function buildReportLink(tenantId: string, start: Date, end: Date): string {
  const token = signReportToken({
    tenant_id: tenantId,
    start: start.toISOString(),
    end: end.toISOString(),
  });
  const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  return `${base}/api/v1/financial/report?token=${encodeURIComponent(token)}`;
}
