import { z } from "zod";
import { guardPlatform } from "@/lib/platform-guard";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { updateOwnerLoginEmailAction } from "@/lib/actions/platform-tenants";
import { withApi } from "@/lib/route";

/**
 * PATCH /api/platform/tenants/:id/owner-email (2026-07-30)
 *
 * Troca o email de LOGIN do dono, que é coisa diferente de `Tenant.email` (o
 * contato da empresa, editado pela rota de cadastro). Separado numa rota
 * própria de propósito: são dois dados com consequências distintas, e juntar
 * os dois no mesmo formulário foi exatamente o que induziu ao erro.
 *
 * Só master_admin: mexer em credencial de acesso de cliente não é operação de
 * equipe de suporte.
 */
const schema = z.object({ email: z.string().trim().email("Email inválido") });

async function PATCHHandler(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const result = await updateOwnerLoginEmailAction(params.id, parsed.data.email);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);
  return apiOk(result.data);
}

export const PATCH = withApi(PATCHHandler);
