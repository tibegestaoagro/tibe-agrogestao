import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { startSignupAction } from "@/lib/actions/signup-flow";
import { buildSignupCookie } from "@/lib/signup-cookie";

/**
 * POST /api/v1/signup/start (Módulo 19, etapa 1).
 *
 * Pública por natureza (ainda não existe usuário). Não cria Tenant nem User:
 * só o cadastro pendente, e dispara o código de WhatsApp. O id volta em cookie
 * httpOnly, nunca no corpo (ver src/lib/signup-cookie.ts).
 */

const schema = z.object({
  company_name: z.string().trim().min(1, "Nome da empresa é obrigatório"),
  owner_name: z.string().trim().min(1, "Nome do responsável é obrigatório"),
  owner_email: z.string().trim().email("Email inválido"),
  document: z.string().trim().min(11, "CNPJ ou CPF inválido"),
  phone: z.string().trim().min(8, "WhatsApp é obrigatório"),
  plan: z.enum(["campo", "fazenda", "grupo"]),
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
  const d = parsed.data;

  const result = await startSignupAction({
    company_name: d.company_name,
    owner_name: d.owner_name,
    owner_email: d.owner_email,
    document: d.document,
    phone: d.phone,
    plan: d.plan,
    utm: { source: d.utm_source, medium: d.utm_medium, campaign: d.utm_campaign },
  });
  if (!result.ok) return apiError(result.code, result.message, result.status);

  const res = apiOk({ state: result.data.state }, {}, { status: 201 });
  res.cookies.set(buildSignupCookie(result.data.signup_id));
  return res;
}
