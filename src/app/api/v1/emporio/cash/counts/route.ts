import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { conferirGavetaAction, listarConferenciasAction } from "@/lib/actions/emporio-caixa";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/cash/counts  ?establishment_id= &limit=  o histórico de conferências da gaveta.
 * POST /api/v1/emporio/cash/counts  confere a gaveta: a diferença vira ajuste de caixa e "Diferença de caixa".
 */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
  counted: z.number({ error: "Informe quanto há na gaveta." }),
  justification: z.string().nullish(),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  const limit = Number(sp.get("limit"));
  return respostaDaAction(
    await listarConferenciasAction(g.db, g.user, {
      establishment_id: sp.get("establishment_id") ?? undefined,
      limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    }),
  );
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await conferirGavetaAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
