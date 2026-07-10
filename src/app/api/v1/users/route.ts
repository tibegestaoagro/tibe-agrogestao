import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { inviteUserAction } from "@/lib/actions/users";

/** GET /api/v1/users · POST /api/v1/users (spec 5.2) */

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  email: z.string().trim().email("Email inválido"),
  phone: z.string().trim().nullish(),
  role: z.enum(["OWNER", "ADMIN", "OPERADOR", "VISUALIZADOR"]),
});

export async function GET() {
  const g = await guard("usuarios", "read");
  if ("error" in g) return g.error;

  const users = await g.db.user.findMany({ orderBy: { created_at: "asc" } });
  return apiOk(
    users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      active: u.active,
      created_at: u.created_at.toISOString(),
    })),
    { total: users.length },
  );
}

export async function POST(request: Request) {
  const g = await guard("usuarios", "write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  // Só Owner cria outro Owner (evita Admin promover alguém acima de si mesmo).
  if (parsed.data.role === "OWNER" && g.user.role !== "OWNER") {
    return apiError("FORBIDDEN", "Apenas o Owner pode convidar outro Owner", 403);
  }

  const result = await inviteUserAction(g.db, parsed.data);
  if (!result.ok) return apiError(result.code, result.message, result.status);

  return apiOk(result.data, {}, { status: 201 });
}
