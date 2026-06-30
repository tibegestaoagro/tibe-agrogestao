import { z } from "zod";
import { apiOk, apiError, ApiErrors } from "@/lib/api";
import { getSessionUser, getTenantDb } from "@/lib/tenant-context";
import { scoped } from "@/lib/prisma";
import { requireRole } from "@/lib/permissions";
import { provisionDefaultVaccines } from "@/lib/vaccines";

/**
 * POST /api/v1/tenant/profiles  (spec Módulo 0, task 0.5)
 *
 * Request:  { "profile_type": "fazenda" | "prestador" }
 * Response 201: { data: { id, profile_type, active, created_at }, meta: {} }
 *
 * Cria (ou reativa) um TenantProfile para o tenant da sessão. Idempotente: se o
 * profile já existe, retorna-o (reativando se estava inativo). tenant_id é sempre
 * resolvido da sessão e injetado pelo client escopado — nunca vem do client.
 */

const bodySchema = z.object({
  profile_type: z.enum(["fazenda", "prestador"]),
});

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) return apiError(...ApiErrors.UNAUTHORIZED);

  // Onboarding / configuração de conta: restrito a OWNER e ADMIN.
  try {
    await requireRole(["OWNER", "ADMIN"]);
  } catch {
    return apiError(...ApiErrors.FORBIDDEN);
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError("INVALID_JSON", "Corpo da requisição inválido", 400);
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return apiError(
      "VALIDATION_ERROR",
      "profile_type deve ser 'fazenda' ou 'prestador'",
      422,
    );
  }

  const { profile_type } = parsed.data;
  const db = await getTenantDb();

  // tenant_id injetado automaticamente pelo middleware de isolamento.
  const existing = await db.tenantProfile.findFirst({ where: { profile_type } });

  let profile = existing;
  if (existing) {
    if (!existing.active) {
      profile = await db.tenantProfile.update({
        where: { id: existing.id },
        data: { active: true },
      });
    }
  } else {
    profile = await db.tenantProfile.create({ data: scoped({ profile_type }) });
  }

  // Ao ativar o perfil Fazenda, provisiona o catálogo de vacinas padrão (1.4).
  if (profile_type === "fazenda" && profile!.active) {
    await provisionDefaultVaccines(db);
  }

  return apiOk(
    {
      id: profile!.id,
      profile_type: profile!.profile_type,
      active: profile!.active,
      created_at: profile!.created_at.toISOString(),
    },
    {},
    { status: 201 },
  );
}
