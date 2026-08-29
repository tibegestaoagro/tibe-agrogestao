import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { guardPlatform } from "@/lib/platform-guard";
import { inviteTeamMemberAction } from "@/lib/actions/platform-team";
import { withApi } from "@/lib/route";

/** GET /api/platform/team · POST /api/platform/team (spec 6.10): só master_admin. */

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  email: z.string().trim().email("Email inválido"),
  role: z.enum(["MASTER_ADMIN", "EQUIPE"]),
});

async function GETHandler() {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const members = await prisma.platformUser.findMany({ orderBy: { created_at: "asc" } });
  return apiOk(
    members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      active: m.active,
      created_at: m.created_at.toISOString(),
    })),
    { total: members.length },
  );
}

async function POSTHandler(request: Request) {
  const g = await guardPlatform({ requireMasterAdmin: true });
  if ("error" in g) return g.error;

  const json = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return apiErroDeZod(parsed.error);
  }

  const result = await inviteTeamMemberAction(parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status, result.field);

  return apiOk(result.data, {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
