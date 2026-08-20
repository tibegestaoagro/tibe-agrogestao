import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { scoped } from "@/lib/prisma";
import { serializeServiceClient } from "@/lib/serializers";
import { withApi } from "@/lib/route";

/**
 * GET  /api/v1/service-clients?q=    lista clientes (busca por nome ou telefone)
 * POST /api/v1/service-clients       cadastra cliente (2.2)
 */

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório"),
  document: z.string().trim().nullish(),
  phone: z.string().trim().nullish(),
  email: z.string().trim().email("Email inválido").nullish().or(z.literal("")),
  notes: z.string().trim().nullish(),
});

async function GETHandler(request: Request) {
  const g = await guard("prestador", "read", { profile: "prestador" });
  if ("error" in g) return g.error;

  const q = new URL(request.url).searchParams.get("q")?.trim();

  const clients = await g.db.serviceClient.findMany({
    where: q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
          ],
        }
      : {},
    orderBy: { created_at: "desc" },
  });

  return apiOk(clients.map(serializeServiceClient), { total: clients.length });
}

async function POSTHandler(request: Request) {
  const g = await guard("prestador", "write", { profile: "prestador" });
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = createSchema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }
  const { name, document, phone, email, notes } = parsed.data;

  const client = await g.db.serviceClient.create({
    data: scoped({
      name,
      document: document ?? null,
      phone: phone ?? null,
      email: email ? email : null,
      notes: notes ?? null,
    }),
  });

  return apiOk(serializeServiceClient(client), {}, { status: 201 });
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
