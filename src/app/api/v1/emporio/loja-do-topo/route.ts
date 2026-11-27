import { z } from "zod";
import { apiOk, apiError, apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { guardEmporio } from "@/lib/emporio/rota";
import { escolherLojaDoTopoAction } from "@/lib/actions/emporio-loja-do-topo";
import { LOJA_DO_TOPO_COOKIE } from "@/lib/emporio/loja-do-topo";

/**
 * POST /api/v1/emporio/loja-do-topo  troca a loja do seletor do topo do Empório.
 * Corpo `{ establishment_id: string | null }` (`null` é "Todas"). Preferência de sessão
 * via cookie, como a propriedade ativa: não é escrita de negócio, por isso `read` basta.
 */
const schema = z.object({ establishment_id: z.string().nullable() });

async function POSTHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;

  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  const r = await escolherLojaDoTopoAction(g.db, g.user, parsed.data.establishment_id);
  if (!r.ok) return apiError(r.code, r.message, r.status, r.field);

  const res = apiOk({ establishment_id: r.data.establishment_id });
  if (r.data.establishment_id) {
    res.cookies.set(LOJA_DO_TOPO_COOKIE, r.data.establishment_id, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  } else {
    res.cookies.delete(LOJA_DO_TOPO_COOKIE);
  }
  return res;
}

export const POST = withApi(POSTHandler);
