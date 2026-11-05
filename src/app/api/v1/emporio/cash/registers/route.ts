import { z } from "zod";
import { apiErroDeZod } from "@/lib/api";
import { readJson } from "@/lib/api-guard";
import { withApi } from "@/lib/route";
import { criarCaixaAction, listarCaixasAction } from "@/lib/actions/emporio-turno";
import { guardEmporio, respostaDaAction } from "@/lib/emporio/rota";

/**
 * GET  /api/v1/emporio/cash/registers  ?establishment_id=  os caixas numerados da loja, com saldo e turno aberto.
 * POST /api/v1/emporio/cash/registers  { establishment_id }  cria o próximo caixa (Gestor da loja para cima).
 */

const schema = z.object({
  establishment_id: z.string({ error: "Escolha o estabelecimento." }).min(1, "Escolha o estabelecimento."),
});

async function GETHandler(request: Request) {
  const g = await guardEmporio("read");
  if ("error" in g) return g.error;
  const sp = new URL(request.url).searchParams;
  return respostaDaAction(await listarCaixasAction(g.db, g.user, sp.get("establishment_id") ?? ""));
}

async function POSTHandler(request: Request) {
  const g = await guardEmporio("write");
  if ("error" in g) return g.error;

  const body = await readJson(request);
  if ("error" in body) return body.error;
  const parsed = schema.safeParse(body.json);
  if (!parsed.success) return apiErroDeZod(parsed.error);

  return respostaDaAction(await criarCaixaAction(g.db, g.user, parsed.data), 201);
}

export const GET = withApi(GETHandler);
export const POST = withApi(POSTHandler);
