import { z } from "zod";
import { apiOk, apiError } from "@/lib/api";
import { guard, readJson } from "@/lib/api-guard";
import { ACTIVE_PROPERTY_COOKIE } from "@/lib/active-property";
import { withApi } from "@/lib/route";

/**
 * POST /api/v1/tenant/active-property
 *
 * Troca a propriedade ativa (seletor do topo, briefing de layout Fase
 * 2+/seção 12): preferência de sessão via cookie, não escrita de negócio,
 * por isso `guard("rebanho", "read")` basta (toda role tem pelo menos
 * leitura de rebanho).
 */
const schema = z.object({ property_id: z.string().nullable() });

async function POSTHandler(request: Request) {
  const g = await guard("rebanho", "read");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0].message, 422);
  }

  if (parsed.data.property_id) {
    const property = await g.db.property.findFirst({
      where: { id: parsed.data.property_id, archived_at: null },
    });
    if (!property) return apiError("NOT_FOUND", "Propriedade não encontrada", 404);
  }

  const res = apiOk({ property_id: parsed.data.property_id });
  if (parsed.data.property_id) {
    res.cookies.set(ACTIVE_PROPERTY_COOKIE, parsed.data.property_id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  } else {
    res.cookies.delete(ACTIVE_PROPERTY_COOKIE);
  }
  return res;
}

export const POST = withApi(POSTHandler);
