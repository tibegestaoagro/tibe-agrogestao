import { apiError } from "@/lib/api";
import { prisma, prismaForTenant } from "@/lib/prisma";
import { verifyReportToken } from "@/lib/reports/report-token";
import { generateFinancialPdf } from "@/lib/reports/generate-financial-pdf";

/**
 * GET /api/v1/financial/report?token=...
 *
 * Rota PÚBLICA por natureza (quem clica no link vindo do WhatsApp não tem
 * sessão no navegador): a autorização vem inteiramente do token assinado
 * (HMAC, expira em 1h), não de cookie/sessão. Gera o PDF sob demanda e
 * transmite direto na resposta, sem armazenar em lugar nenhum.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return apiError("VALIDATION_ERROR", "token é obrigatório", 400);

  const payload = verifyReportToken(token);
  if (!payload) {
    return apiError("INVALID_OR_EXPIRED_TOKEN", "Link inválido ou expirado", 401);
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: payload.tenant_id } });
  if (!tenant) return apiError("NOT_FOUND", "Tenant não encontrado", 404);

  const db = prismaForTenant(payload.tenant_id);
  const start = new Date(payload.start);
  const end = new Date(payload.end);

  const pdfBytes = await generateFinancialPdf(db, { tenantName: tenant.name, start, end });

  const filename = `relatorio-financeiro-${start.toISOString().slice(0, 10)}-a-${end
    .toISOString()
    .slice(0, 10)}.pdf`;

  return new Response(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
