import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { getSessionUser } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/tenant/plan (spec 2026-07-27): confirma o plano de um tenant
 * criado manualmente pelo painel (que nasce com plan_confirmed=false).
 *
 * Só sessão (`getSessionUser`), **sem** `guard()` de propósito: guard() agora
 * bloqueia toda ação enquanto `plan_confirmed` for false (defesa em
 * profundidade, mesmo raciocínio do must_change_password): se esta rota
 * passasse por guard(), ninguém conseguiria nunca confirmar o plano.
 */
const schema = z.object({ plan: z.enum(["campo", "fazenda", "grupo"]) });

async function POSTHandler(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError(...ApiErrors.UNAUTHORIZED);

  const json = await request.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Escolha um plano válido (campo, fazenda ou grupo)", 422);
  }

  await prisma.tenant.update({
    where: { id: user.tenant_id },
    data: { plan: parsed.data.plan, plan_confirmed: true },
  });

  return apiOk({ plan: parsed.data.plan });
}

export const POST = withApi(POSTHandler);
