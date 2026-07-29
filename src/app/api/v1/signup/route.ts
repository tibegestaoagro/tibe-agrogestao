import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { createTenantWithOwner } from "@/lib/actions/tenants";
import { sendEmail } from "@/lib/email-send";
import { buildWelcomeEmailHtml } from "@/lib/email-templates";

/**
 * POST /api/v1/signup: cadastro público de novo tenant (self-service).
 *
 * ⚠️ Fora do escopo original do MVP (PRD §12 marca signup público como v1.1);
 * construído a pedido explícito do Dilton para destravar testes do painel
 * antes do Módulo 4/5, sem esperar a integração real de cobrança (Asaas).
 * Cria Tenant (status=trial) + User (role=OWNER) de verdade. Sem rate limiting
 * (não há infra de fila/Redis conectada ainda): nota conhecida, não bloqueante
 * para uso controlado de testes.
 *
 * Única rota de negócio que roda sem sessão por natureza (ainda não existe
 * usuário): mesmo assim segue o contrato { data, meta } / { error } do PRD.
 */

const schema = z.object({
  company_name: z.string().trim().min(1, "Nome da empresa é obrigatório"),
  document: z.string().trim().min(11, "CNPJ ou CPF inválido"),
  phone: z.string().trim().min(8, "Telefone é obrigatório"),
  plan: z.enum(["campo", "fazenda", "grupo"]),
  owner_name: z.string().trim().min(1, "Nome do responsável é obrigatório"),
  owner_email: z.string().trim().email("Email inválido"),
  password: z.string().min(8, "A senha deve ter ao menos 8 caracteres"),
  // Origem do lead (Módulo 6, funil por UTM): capturado no site público via
  // cookie first-touch (src/lib/utm.ts), opcional (a maioria dos acessos é direta).
  utm_source: z.string().trim().min(1).nullish(),
  utm_medium: z.string().trim().min(1).nullish(),
  utm_campaign: z.string().trim().min(1).nullish(),
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { company_name, document, phone, plan, owner_name, owner_email, password, utm_source, utm_medium, utm_campaign } =
    parsed.data;

  const result = await createTenantWithOwner({
    company_name,
    document,
    phone,
    owner_name,
    owner_email,
    plan,
    plan_confirmed: true,
    password,
    must_change_password: false,
    utm: { source: utm_source, medium: utm_medium, campaign: utm_campaign },
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  // Boas-vindas por email (arquitetura 2026-07-29): signup nunca teve
  // equivalente por WhatsApp, e não ganha um agora — só o email, que nunca
  // lança (melhor esforço, sempre grava EmailLog).
  await sendEmail({
    to: owner_email,
    subject: "Bem-vindo ao Tibé",
    html: buildWelcomeEmailHtml({ ownerName: owner_name, email: owner_email }),
    tenant_id: result.data.tenant_id,
    type: "welcome",
  });

  return apiOk(result.data, {}, { status: 201 });
}
